import {
  ALL_COLORS,
  ColorId,
  BASE_ORIGIN,
  FINISHED,
  HOME_COLUMN,
  HOME_ENTRY,
  IN_BASE,
  SAFE_CELLS,
  START_INDEX,
  TRACK,
  TRACK_LENGTH,
  isSafeCell,
  ringIndex,
  tokenPoint,
} from '../src/engine';

describe('board geometry', () => {
  it('has a 52 cell ring with no duplicates', () => {
    expect(TRACK_LENGTH).toBe(52);
    const seen = new Set(TRACK.map(([c, r]) => `${c},${r}`));
    expect(seen.size).toBe(52);
  });

  it('keeps every ring cell inside the 15x15 cross', () => {
    TRACK.forEach(([c, r]) => {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(15);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(15);
      const inArm = (c >= 6 && c <= 8) || (r >= 6 && r <= 8);
      expect(inArm).toBe(true);
      const inCentre = c >= 6 && c <= 8 && r >= 6 && r <= 8;
      expect(inCentre).toBe(false);
    });
  });

  it('puts Yellow top-left, Blue top-right, Red bottom-right, Green bottom-left', () => {
    expect(BASE_ORIGIN[ColorId.Yellow]).toEqual([0, 0]);
    expect(BASE_ORIGIN[ColorId.Blue]).toEqual([9, 0]);
    expect(BASE_ORIGIN[ColorId.Red]).toEqual([9, 9]);
    expect(BASE_ORIGIN[ColorId.Green]).toEqual([0, 9]);
  });

  it("keeps each colour's start cell and home column beside its own yard", () => {
    ALL_COLORS.forEach(color => {
      const [ox, oy] = BASE_ORIGIN[color];
      const near = ([c, r]: [number, number]) =>
        c >= ox - 2 && c <= ox + 8 && r >= oy - 2 && r <= oy + 8;
      expect(near(TRACK[START_INDEX[color]])).toBe(true);
      // the home column's outer cell sits next to the start cell
      const [hc, hr] = HOME_COLUMN[color][0];
      const [sc, sr] = TRACK[START_INDEX[color]];
      expect(Math.abs(hc - sc) + Math.abs(hr - sr)).toBe(1);
    });
  });

  it('spaces the four start cells 13 apart', () => {
    // in turn order, so play passes clockwise round the board
    const starts = ALL_COLORS.map(color => START_INDEX[color]);
    expect([...starts].sort((a, b) => a - b)).toEqual([1, 14, 27, 40]);
    starts.forEach((start, index) => {
      const next = starts[(index + 1) % 4];
      expect((next - start + 52) % 52).toBe(13);
    });
  });

  it('protects the start cells and the four stars', () => {
    expect(SAFE_CELLS).toHaveLength(8);
    ALL_COLORS.forEach(color => {
      expect(isSafeCell(START_INDEX[color])).toBe(true);
      expect(isSafeCell((START_INDEX[color] + 8) % 52)).toBe(true);
    });
  });

  it('gives every colour a five cell home column ending at the centre', () => {
    ALL_COLORS.forEach(color => {
      expect(HOME_COLUMN[color]).toHaveLength(5);
      // The cell before the home column is 50 steps from the start cell.
      const lastRing = ringIndex(color, HOME_ENTRY - 1);
      expect(lastRing).toBe((START_INDEX[color] + 50) % 52);
    });
  });

  it('never lets two colours share a home column cell', () => {
    const seen = new Set<string>();
    ALL_COLORS.forEach(color => {
      HOME_COLUMN[color].forEach(([c, r]) => {
        const key = `${c},${r}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      });
    });
    expect(seen.size).toBe(20);
  });

  it('places tokens somewhere sensible in every state', () => {
    ALL_COLORS.forEach(color => {
      for (let token = 0; token < 4; token++) {
        const base = tokenPoint(color, IN_BASE, token);
        const [ox, oy] = BASE_ORIGIN[color];
        expect(base.x).toBeGreaterThan(ox);
        expect(base.x).toBeLessThan(ox + 6);
        expect(base.y).toBeGreaterThan(oy);
        expect(base.y).toBeLessThan(oy + 6);

        const home = tokenPoint(color, FINISHED, token);
        expect(Math.abs(home.x - 7.5)).toBeLessThan(1.5);
        expect(Math.abs(home.y - 7.5)).toBeLessThan(1.5);

        for (let steps = 0; steps <= FINISHED; steps++) {
          const point = tokenPoint(color, steps, token);
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
      }
    });
  });
});
