#!/usr/bin/env node
/**
 * Generates the app icons - Android launcher icons (legacy, round and
 * adaptive foreground), the iOS app icons (release and debug flavors) and
 * the copy the app itself shows - by cutting them from the painted artwork
 * in `spiderludo.png`.
 *
 * It deliberately has zero dependencies: PNGs are decoded and encoded with
 * Node's own zlib, resampled with an area filter, and masks are
 * signed-distance shapes anti-aliased analytically. `npm run assets`
 * re-renders everything.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------- palette
const PALETTE = {
  lane: '#F4F6FF',
  debug: '#FF7A1A',
};

const hexToRgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// ------------------------------------------------------------ sdf helpers
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

  /** Keep only what lies inside a signed-distance shape (anti-aliased). */
  mask(sdf) {
    const { size, scale } = this;
    for (let py = 0; py < size; py++) {
      const y = (py + 0.5) / scale;
      for (let px = 0; px < size; px++) {
        const x = (px + 0.5) / scale;
        const coverage = clamp(0.5 - sdf(x, y) * scale, 0, 1);
        const index = (py * size + px) * 4;
        for (let c = 0; c < 4; c++) {
          this.data[index + c] *= coverage;
        }
      }
    }
  }

  /**
   * `opaque` drops the alpha channel entirely (colour type RGB), which the
   * App Store requires for app icons.
   */
  toPng({ opaque = false } = {}) {
    const { size } = this;
    const channels = opaque ? 3 : 4;
    const stride = size * channels;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y++) {
      raw[y * (stride + 1)] = 0; // filter: none
      for (let x = 0; x < size; x++) {
        const source = (y * size + x) * 4;
        const target = y * (stride + 1) + 1 + x * channels;
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
        if (!opaque) {
          raw[target + 3] = clamp(Math.round(alpha), 0, 255);
        }
      }
    }
    return encodePng(size, size, raw, opaque ? 2 : 6);
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

const encodePng = (width, height, raw, colourType = 6) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = colourType; // 6 = RGBA, 2 = RGB
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

// ------------------------------------------------------------- app icon
/** The launcher icon is painted artwork, not vector: this file. */
const ICON_SOURCE = path.join(__dirname, '..', 'spiderludo.png');
/**
 * The artwork comes as a rounded tile on white; this is (a little more than)
 * its corner radius as a fraction of its width.
 */
const ICON_CORNER = 0.155;
/**
 * Adaptive icons: the artwork fills 90 of the 108dp foreground layer, so the
 * 72dp viewport crops into it and never reaches its edges.
 */
const FOREGROUND_ART = 90;

/** Minimal PNG decoder for 8-bit, non-interlaced RGB or RGBA files. */
const decodePng = file => {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colourType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    offset += 12 + length;
  }
  if (
    !header ||
    header.depth !== 8 ||
    header.interlace !== 0 ||
    ![2, 6].includes(header.colourType)
  ) {
    throw new Error(`${file}: expected an 8-bit, non-interlaced RGB(A) PNG`);
  }
  const { width, height } = header;
  const bpp = header.colourType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytes = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? bytes[y * stride + x - bpp] : 0;
      const up = y > 0 ? bytes[(y - 1) * stride + x] : 0;
      const corner = x >= bpp && y > 0 ? bytes[(y - 1) * stride + x - bpp] : 0;
      let value = raw[row + x];
      if (filter === 1) {
        value += left;
      } else if (filter === 2) {
        value += up;
      } else if (filter === 3) {
        value += (left + up) >> 1;
      } else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      bytes[y * stride + x] = value & 0xff;
    }
  }
  // premultiplied float RGBA, the same layout Canvas uses
  const data = new Float64Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const alpha = bpp === 4 ? bytes[i * 4 + 3] : 255;
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = (bytes[i * bpp + c] * alpha) / 255;
    }
    data[i * 4 + 3] = alpha;
  }
  return { width, height, data };
};

/**
 * Paints over the artwork's white corners by pulling colour radially in from
 * just inside its rounded edge. The platform masks cut most of it away; this
 * only guarantees no white or grey outline survives at the edge.
 */
const fillCorners = image => {
  const { width, data } = image;
  const radius = width * ICON_CORNER;
  const inner = radius * 0.92;
  const centreOf = v =>
    v < radius ? radius : v > width - radius ? width - radius : null;
  for (let y = 0; y < width; y++) {
    const cy = centreOf(y + 0.5);
    if (cy === null) {
      continue;
    }
    for (let x = 0; x < width; x++) {
      const cx = centreOf(x + 0.5);
      if (cx === null) {
        continue;
      }
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.hypot(dx, dy);
      if (distance <= inner) {
        continue;
      }
      const sx = Math.floor(cx + (dx / distance) * inner);
      const sy = Math.floor(cy + (dy / distance) * inner);
      data.copyWithin(
        (y * width + x) * 4,
        (sy * width + sx) * 4,
        (sy * width + sx) * 4 + 4,
      );
    }
  }
  return image;
};

let iconArt = null;
const loadIconArt = () =>
  iconArt || (iconArt = fillCorners(decodePng(ICON_SOURCE)));

/** For each output index, the source indices it covers and their weights. */
const areaTaps = (from, to) => {
  const ratio = from / to;
  return Array.from({ length: to }, (_, i) => {
    const start = i * ratio;
    const end = start + ratio;
    const taps = [];
    for (let s = Math.floor(start); s < Math.min(from, Math.ceil(end)); s++) {
      const weight = Math.min(end, s + 1) - Math.max(start, s);
      if (weight > 0) {
        taps.push([s, weight / ratio]);
      }
    }
    return taps;
  });
};

/** Area-average resample of a square image to `size` x `size`. */
const resample = (image, size) => {
  const { width, height, data } = image;
  const columns = areaTaps(width, size);
  const rows = areaTaps(height, size);
  const wide = new Float64Array(size * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < size; x++) {
      const target = (y * size + x) * 4;
      for (const [sx, weight] of columns[x]) {
        const source = (y * width + sx) * 4;
        for (let c = 0; c < 4; c++) {
          wide[target + c] += data[source + c] * weight;
        }
      }
    }
  }
  const out = new Float64Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (const [sy, weight] of rows[y]) {
      for (let x = 0; x < size; x++) {
        const target = (y * size + x) * 4;
        const source = (sy * size + x) * 4;
        for (let c = 0; c < 4; c++) {
          out[target + c] += wide[source + c] * weight;
        }
      }
    }
  }
  return out;
};

/** The artwork scaled to fill a canvas on the 200-unit grid. */
const iconCanvas = pixels => {
  const canvas = new Canvas(pixels, 200);
  canvas.data = resample(loadIconArt(), pixels);
  return canvas;
};

/** Legacy launcher icons: the tile's own rounded corners, or a circle. */
const renderLauncher = (pixels, round) => {
  const canvas = iconCanvas(pixels);
  canvas.mask(
    round
      ? (x, y) => sdCircle(x, y, 100, 100, 100)
      : (x, y) => sdRoundRect(x, y, 0, 0, 200, 200, 200 * ICON_CORNER),
  );
  return canvas.toPng();
};

/**
 * Adaptive-icon foreground: the artwork centred on the 108dp layer; the
 * background layer behind it is a matching red.
 */
const renderForeground = pixels => {
  const canvas = new Canvas(pixels, 108);
  const art = Math.round((pixels * FOREGROUND_ART) / 108);
  const offset = Math.round((pixels - art) / 2);
  const scaled = resample(loadIconArt(), art);
  for (let y = 0; y < art; y++) {
    canvas.data.set(
      scaled.subarray(y * art * 4, (y + 1) * art * 4),
      ((y + offset) * pixels + offset) * 4,
    );
  }
  return canvas.toPng();
};

/**
 * iOS app icon: the artwork full-bleed (iOS applies its own corner mask). The
 * debug flavor adds an orange sash across the top-right corner so the two
 * installs are easy to tell apart on the home screen.
 */
const renderIosIcon = (pixels, debug) => {
  const canvas = iconCanvas(pixels);
  if (debug) {
    // Band of constant (x - y): a 45-degree strip cutting the corner.
    const band = (centre, half) => (x, y) =>
      (Math.abs(x - y - centre) - half) / Math.SQRT2;
    canvas.fill(band(142, 20), solid(PALETTE.lane), {});
    canvas.fill(band(142, 16), solid(PALETTE.debug), {});
  }
  return canvas.toPng({ opaque: true });
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

const XCASSETS = path.join(
  __dirname,
  '..',
  'ios',
  'NiceLudo',
  'Images.xcassets',
);

/** The copy the app shows (home header, splash); RN rounds its corners. */
const APP_ICON = path.join(__dirname, '..', 'src', 'assets', 'app-icon.png');

const writeJson = (file, json) =>
  write(file, Buffer.from(JSON.stringify(json, null, 2) + '\n'));

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

  console.log('Rendering iOS app icons...');
  [
    ['AppIcon', false],
    ['AppIcon-Debug', true],
  ].forEach(([name, debug]) => {
    const dir = path.join(XCASSETS, `${name}.appiconset`);
    write(path.join(dir, 'icon-1024.png'), renderIosIcon(1024, debug));
    writeJson(path.join(dir, 'Contents.json'), {
      images: [
        {
          filename: 'icon-1024.png',
          idiom: 'universal',
          platform: 'ios',
          size: '1024x1024',
        },
      ],
      info: { author: 'xcode', version: 1 },
    });
  });

  console.log('Rendering the in-app icon...');
  write(APP_ICON, iconCanvas(256).toPng({ opaque: true }));

  console.log('Done.');
};

main();
