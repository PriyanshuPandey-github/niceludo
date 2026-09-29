/**
 * Spider-web geometry shared by the Spider pieces, the dark board's yards
 * and the web-swing animation.
 */

/**
 * SVG path for a web centred on (cx, cy): `spokes` straight threads (the
 * first pointing straight up) reaching `spokeReach` x `radius`, and `rings`
 * evenly spaced rings whose segments sag toward the centre.
 */
export const webPath = (
  cx: number,
  cy: number,
  radius: number,
  { spokes = 12, rings = 5, spokeReach = 1.2 } = {},
): string => {
  const polar = (r: number, degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(
      cy +
      r * Math.sin(a)
    ).toFixed(2)}`;
  };
  const step = 360 / spokes;
  const angles = Array.from({ length: spokes }, (_, i) => -90 + i * step);
  const parts = angles.map(
    a => `M${cx},${cy} L${polar(radius * spokeReach, a)}`,
  );
  for (let ring = 1; ring <= rings; ring++) {
    const r = (radius * ring) / rings;
    parts.push(`M${polar(r, angles[0])}`);
    angles.forEach(a => {
      parts.push(`Q${polar(r * 0.8, a + step / 2)} ${polar(r, a + step)}`);
    });
  }
  return parts.join(' ');
};
