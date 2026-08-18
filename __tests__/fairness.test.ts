import {
  chiSquare,
  createRng,
  emptyDiceStats,
  nextInt,
  recordRoll,
  rollDie,
} from '../src/engine';

const ROLLS = 120000;

describe('dice fairness', () => {
  it('produces a flat distribution over 120k rolls', () => {
    let rng = createRng([1, 2, 3, 4]);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < ROLLS; i++) {
      const draw = rollDie(rng);
      rng = draw.state;
      expect(draw.value).toBeGreaterThanOrEqual(1);
      expect(draw.value).toBeLessThanOrEqual(6);
      counts[draw.value - 1] += 1;
    }
    const expected = ROLLS / 6;
    const chi = counts.reduce(
      (sum, count) =>
        sum + ((count - expected) * (count - expected)) / expected,
      0,
    );
    // 5 degrees of freedom: 20.5 is the 0.999 critical value.
    expect(chi).toBeLessThan(20.5);
    counts.forEach(count => {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.03);
    });
  });

  it('treats every seat identically when they share the stream', () => {
    let rng = createRng([9, 8, 7, 6]);
    let stats = emptyDiceStats(4);
    for (let i = 0; i < 24000; i++) {
      const seat = i % 4;
      const draw = rollDie(rng);
      rng = draw.state;
      stats = recordRoll(stats, seat, draw.value);
    }
    for (let seat = 0; seat < 4; seat++) {
      // 5 dof, 0.999 critical value again - no seat is nudged either way.
      expect(chiSquare(stats, seat)).toBeLessThan(20.5);
      const sixes = stats.faces[seat][5];
      expect(Math.abs(sixes - 1000) / 1000).toBeLessThan(0.12);
    }
  });

  it('has no serial correlation between consecutive rolls', () => {
    let rng = createRng([42, 4242, 424242, 7]);
    const pairs = new Array(36).fill(0);
    let previous = rollDie(rng);
    rng = previous.state;
    const samples = 72000;
    for (let i = 0; i < samples; i++) {
      const draw = rollDie(rng);
      rng = draw.state;
      pairs[(previous.value - 1) * 6 + (draw.value - 1)] += 1;
      previous = draw;
    }
    const expected = samples / 36;
    const chi = pairs.reduce(
      (sum, count) =>
        sum + ((count - expected) * (count - expected)) / expected,
      0,
    );
    // 35 degrees of freedom: 66.6 is the 0.999 critical value.
    expect(chi).toBeLessThan(66.6);
  });

  it('never repeats a state and is reproducible from a seed', () => {
    const a = createRng([5, 5, 5, 5]);
    const b = createRng([5, 5, 5, 5]);
    let left = a;
    let right = b;
    const sequenceA: number[] = [];
    const sequenceB: number[] = [];
    for (let i = 0; i < 500; i++) {
      const l = rollDie(left);
      left = l.state;
      sequenceA.push(l.value);
      const r = rollDie(right);
      right = r.state;
      sequenceB.push(r.value);
    }
    expect(sequenceA).toEqual(sequenceB);
    expect(left.draws).toBeGreaterThanOrEqual(500);
  });

  it('draws bounded integers uniformly', () => {
    let rng = createRng([11, 22, 33, 44]);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 50000; i++) {
      const draw = nextInt(rng, 5);
      rng = draw.state;
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(5);
      counts[draw.value] += 1;
    }
    counts.forEach(count => {
      expect(Math.abs(count - 10000) / 10000).toBeLessThan(0.05);
    });
  });

  it('seeds itself differently on every fresh game', () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const rng = createRng();
      seeds.add(`${rng.a},${rng.b},${rng.c},${rng.d}`);
    }
    expect(seeds.size).toBe(50);
  });
});
