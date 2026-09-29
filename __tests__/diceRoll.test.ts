import {
  ROLL_QUARTER_TURNS,
  rollEasing,
  rollImpacts,
} from '../src/components/diceRoll';

describe('dice roll timing', () => {
  [760, 471].forEach(ms => {
    it(`puts every click on a quarter turn of the tumble (${ms} ms)`, () => {
      const impacts = rollImpacts(ms);
      expect(impacts).toHaveLength(ROLL_QUARTER_TURNS - 1);
      impacts.forEach((at, i) => {
        // the tray's rotation at that moment, in quarter turns
        const turned = rollEasing(at / ms) * ROLL_QUARTER_TURNS;
        expect(turned).toBeCloseTo(i + 1, 1);
      });
      // all before the landing, which gets its own knock at `ms`
      expect(impacts[impacts.length - 1]).toBeLessThan(ms);
    });
  });

  it('spaces the clicks out as the die slows down', () => {
    const impacts = rollImpacts(760);
    const gaps = impacts.slice(1).map((at, i) => at - impacts[i]);
    gaps
      .slice(1)
      .forEach((gap, i) => expect(gap).toBeGreaterThanOrEqual(gaps[i]));
  });
});
