#!/usr/bin/env node
/**
 * Generates every raster asset the Android app needs - launcher icons
 * (legacy, round and adaptive foreground) plus the splash logo - straight
 * from the vector description below.
 *
 * It deliberately has zero dependencies: shapes are signed-distance fields,
 * anti-aliased analytically, and the PNG is encoded with Node's own zlib.
 * `npm run assets` re-renders everything, so the artwork is reproducible and
 * reviewable as code rather than as opaque binaries.
 *
 * The drawing mirrors `src/components/Logo.tsx`, so the launcher icon, the
 * splash screen and the in-app mark are the same design.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------- palette
const PALETTE = {
  plateA: '#2A356B',
  plateB: '#0D1230',
  goldA: '#FFF0BD',
  goldB: '#F6CF6A',
  goldC: '#B8862A',
  red: '#F0453C',
  green: '#22BC69',
  yellow: '#F5C02B',
  blue: '#2C86F0',
  lane: '#F4F6FF',
  dieA: '#FFFFFF',
  dieB: '#D6DCF4',
  dieEdge: '#8D97C4',
  pip: '#20264A',
};

const hexToRgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// ------------------------------------------------------------ sdf helpers
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const rotatePoint = (x, y, cx, cy, degrees) => {
  if (!degrees) {
    return [x, y];
  }
  const a = (-degrees * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [
    cx + dx * Math.cos(a) - dy * Math.sin(a),
    cy + dx * Math.sin(a) + dy * Math.cos(a),
  ];
};

/** Rounded rectangle signed distance (negative inside). */
const sdRoundRect = (x, y, rx, ry, rw, rh, r) => {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const qx = Math.abs(x - cx) - (rw / 2 - r);
  const qy = Math.abs(y - cy) - (rh / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
};

const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

// --------------------------------------------------------------- painting
const solid = hex => {
  const rgb = hexToRgb(hex);
  return () => rgb;
};

/** Linear gradient between two colours along a unit vector in design space. */
const gradient = (fromHex, toHex, x0, y0, x1, y1) => {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy || 1;
  return (x, y) => {
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / lengthSquared, 0, 1);
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
  };
};

/**
 * A canvas in "design units". Every drawing below is authored on a 200x200
 * grid and scaled to whatever pixel size the launcher needs.
 */
class Canvas {
  constructor(pixels, designSize) {
    this.size = pixels;
    this.scale = pixels / designSize;
    this.data = new Float64Array(pixels * pixels * 4); // premultiplied RGBA
  }

  /** Paint a shape given as a signed-distance function in design units. */
  fill(sdf, paint, { opacity = 1, clip = null } = {}) {
    const { size, scale } = this;
    for (let py = 0; py < size; py++) {
      const y = (py + 0.5) / scale;
      for (let px = 0; px < size; px++) {
        const x = (px + 0.5) / scale;
        // distance in pixels -> analytic 1px anti-aliasing
        const distance = sdf(x, y) * scale;
        let alpha = clamp(0.5 - distance, 0, 1) * opacity;
        if (alpha <= 0) {
          continue;
        }
        if (clip) {
          alpha *= clamp(0.5 - clip(x, y) * scale, 0, 1);
          if (alpha <= 0) {
            continue;
          }
        }
        const [r, g, b] = paint(x, y);
        const index = (py * size + px) * 4;
        const inverse = 1 - alpha;
        this.data[index] = this.data[index] * inverse + r * alpha;
        this.data[index + 1] = this.data[index + 1] * inverse + g * alpha;
        this.data[index + 2] = this.data[index + 2] * inverse + b * alpha;
        this.data[index + 3] = this.data[index + 3] * inverse + 255 * alpha;
      }
    }
  }

  toPng() {
    const { size } = this;
    const stride = size * 4;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y++) {
      raw[y * (stride + 1)] = 0; // filter: none
      for (let x = 0; x < size; x++) {
        const source = (y * size + x) * 4;
        const target = y * (stride + 1) + 1 + x * 4;
        const alpha = this.data[source + 3];
        // un-premultiply so the PNG stores straight alpha
        const factor = alpha > 0 ? 255 / alpha : 0;
        raw[target] = clamp(Math.round(this.data[source] * factor), 0, 255);
        raw[target + 1] = clamp(
          Math.round(this.data[source + 1] * factor),
          0,
          255,
        );
        raw[target + 2] = clamp(
          Math.round(this.data[source + 2] * factor),
          0,
          255,
        );
        raw[target + 3] = clamp(Math.round(alpha), 0, 255);
      }
    }
    return encodePng(size, size, raw);
  }
}

// ------------------------------------------------------------ png encoder
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

const crc32 = buffer => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, body) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
};

const encodePng = (width, height, raw) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ------------------------------------------------------------- the artwork
/** The board mark: four quadrants, white lanes, gold hub, and a die. */
const drawMark = (canvas, options = {}) => {
  const { clip = null, withRing = true } = options;
  const opts = { clip };

  if (withRing) {
    canvas.fill(
      (x, y) => sdRoundRect(x, y, 18, 18, 164, 164, 38),
      gradient(PALETTE.goldA, PALETTE.goldC, 18, 18, 182, 182),
      opts,
    );
    canvas.fill(
      (x, y) => sdRoundRect(x, y, 23, 23, 154, 154, 34),
      gradient(PALETTE.plateA, PALETTE.plateB, 23, 23, 177, 177),
      opts,
    );
  }

  const quadrants = [
    [36, 36, PALETTE.red],
    [108, 36, PALETTE.green],
    [108, 108, PALETTE.yellow],
    [36, 108, PALETTE.blue],
  ];
  quadrants.forEach(([qx, qy, color]) => {
    canvas.fill(
      (x, y) => sdRoundRect(x, y, qx, qy, 56, 56, 8),
      solid(color),
      opts,
    );
  });

  // white cross lanes
  canvas.fill(
    (x, y) => sdRoundRect(x, y, 92, 30, 16, 140, 5),
    solid(PALETTE.lane),
    opts,
  );
  canvas.fill(
    (x, y) => sdRoundRect(x, y, 30, 92, 140, 16, 5),
    solid(PALETTE.lane),
    opts,
  );

  // gold hub
  canvas.fill(
    (x, y) => sdCircle(x, y, 100, 100, 17),
    gradient(PALETTE.goldA, PALETTE.goldC, 84, 84, 117, 117),
    opts,
  );

  // die, tilted, resting over the lower-right quadrant
  const tilt = -14;
  const spin = fn => (x, y) => {
    const [rx, ry] = rotatePoint(x, y, 134, 138, tilt);
    return fn(rx, ry);
  };
  canvas.fill(
    spin((x, y) => sdRoundRect(x, y, 98, 102, 72, 72, 18)),
    solid(PALETTE.dieEdge),
    opts,
  );
  canvas.fill(
    spin((x, y) => sdRoundRect(x, y, 101, 105, 66, 66, 16)),
    gradient(PALETTE.dieA, PALETTE.dieB, 101, 105, 167, 171),
    opts,
  );
  [
    [118, 122],
    [150, 122],
    [134, 138],
    [118, 154],
    [150, 154],
  ].forEach(([cx, cy]) => {
    canvas.fill(
      spin((x, y) => sdCircle(x, y, cx, cy, 6)),
      solid(PALETTE.pip),
      opts,
    );
  });
};

/**
 * Wraps a canvas so a drawing authored on the 200-unit grid can be placed
 * scaled and centred inside a different design space.
 */
const scaledTarget = (canvas, scale, offset) => ({
  fill(sdf, paint, options) {
    canvas.fill(
      (x, y) => sdf((x - offset) / scale, (y - offset) / scale) * scale,
      (x, y) => paint((x - offset) / scale, (y - offset) / scale),
      options,
    );
  },
});

/** Full-bleed launcher tile (legacy icons). */
const renderLauncher = (pixels, round) => {
  const canvas = new Canvas(pixels, 200);
  const clip = round ? (x, y) => sdCircle(x, y, 100, 100, 98) : null;
  canvas.fill(
    round
      ? (x, y) => sdCircle(x, y, 100, 100, 98)
      : (x, y) => sdRoundRect(x, y, 2, 2, 196, 196, 44),
    gradient(PALETTE.plateA, PALETTE.plateB, 10, 10, 190, 190),
    {},
  );
  if (round) {
    // Shrink the mark so its rounded-square ring stays inside the circle.
    drawMark(scaledTarget(canvas, 0.78, 22), { clip });
  } else {
    drawMark(canvas, { clip });
  }
  return canvas.toPng();
};

/**
 * Adaptive-icon foreground: the mark alone on a transparent 108dp canvas,
 * scaled so it stays inside the 72dp safe zone.
 */
const renderForeground = pixels => {
  const canvas = new Canvas(pixels, 108);
  // Draw the 200-unit mark into a 74-unit box centred on the 108 canvas.
  const scale = 74 / 200;
  const offset = (108 - 74) / 2;
  drawMark(scaledTarget(canvas, scale, offset));
  return canvas.toPng();
};

/** Splash mark: the launcher tile with a transparent surround. */
const renderSplash = pixels => {
  const canvas = new Canvas(pixels, 200);
  canvas.fill(
    (x, y) => sdRoundRect(x, y, 4, 4, 192, 192, 44),
    gradient(PALETTE.plateA, PALETTE.plateB, 10, 10, 190, 190),
    {},
  );
  drawMark(canvas);
  return canvas.toPng();
};

// ------------------------------------------------------------------ output
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const write = (file, buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(
    `  ${path.relative(path.join(__dirname, '..'), file)}  (${kb} kB)`,
  );
};

const main = () => {
  console.log('Rendering launcher icons...');
  DENSITIES.forEach(([density, factor]) => {
    const dir = path.join(RES, `mipmap-${density}`);
    write(
      path.join(dir, 'ic_launcher.png'),
      renderLauncher(Math.round(48 * factor), false),
    );
    write(
      path.join(dir, 'ic_launcher_round.png'),
      renderLauncher(Math.round(48 * factor), true),
    );
    write(
      path.join(dir, 'ic_launcher_foreground.png'),
      renderForeground(Math.round(108 * factor)),
    );
  });

  console.log('Rendering splash artwork...');
  DENSITIES.forEach(([density, factor]) => {
    write(
      path.join(RES, `drawable-${density}`, 'splash_logo.png'),
      renderSplash(Math.round(120 * factor)),
    );
  });

  console.log('Done.');
};

main();
