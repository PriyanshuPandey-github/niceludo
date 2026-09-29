import HapticFeedback from 'react-native-haptic-feedback';
import { MIN_GAP_MS, haptics, setHapticsEnabled } from '../src/audio/haptics';
import { setSoundEnabled, sfx } from '../src/audio/sfx';
import { rollImpacts } from '../src/components/diceRoll';

const trigger = HapticFeedback.trigger as jest.Mock;

/** Every tap fired, as [type, ms after the effect was played]. */
const record = (play: () => void, runMs = 3000) => {
  const fired: Array<[string, number]> = [];
  const start = Date.now();
  trigger.mockImplementation((type: string) =>
    fired.push([type, Date.now() - start]),
  );
  play();
  jest.advanceTimersByTime(runMs);
  return fired;
};

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  trigger.mockReset();
  setHapticsEnabled(true);
  setSoundEnabled(true);
});
afterEach(() => jest.useRealTimers());

describe('the dice roll', () => {
  it('ticks as the die tips onto each face and thuds on the landing', () => {
    const fired = record(() => sfx.roll(760));
    const impacts = new Set(rollImpacts(760));
    const [landing, landedAt] = fired[fired.length - 1];

    expect(landing).toBe('impactHeavy');
    expect(landedAt).toBe(760);
    fired.slice(0, -1).forEach(([type, at]) => {
      expect(impacts.has(at)).toBe(true);
      expect(['rigid', 'impactLight']).toContain(type);
    });
    // crisp while it spins fast, lighter as it slows
    expect(fired[0][0]).toBe('rigid');
    expect(fired[fired.length - 2][0]).toBe('impactLight');
  });

  it('keeps taps far enough apart to feel each one', () => {
    const fired = record(() => sfx.roll(760));
    expect(fired.length).toBeGreaterThan(5);
    fired
      .slice(1)
      .forEach(([, at], i) =>
        expect(at - fired[i][1]).toBeGreaterThanOrEqual(MIN_GAP_MS),
      );
  });

  it('follows the roll length (fast animations)', () => {
    const fired = record(() => sfx.roll(471));
    expect(fired[fired.length - 1]).toEqual(['impactHeavy', 471]);
  });
});

describe('taps follow the sounds', () => {
  it('lands on the delayed beat the sound was given', () => {
    expect(record(() => sfx.land(420))).toEqual([['impactHeavy', 420]]);
    expect(record(() => sfx.thwip(150))).toEqual([['rigid', 150]]);
  });

  it('gives a web swing its shot and its landing', () => {
    const fired = record(() => {
      sfx.thwip();
      sfx.land(380);
    });
    expect(fired).toEqual([
      ['rigid', 0],
      ['impactHeavy', 380],
    ]);
  });

  it('plays one tap per note of the home arpeggio', () => {
    expect(record(() => sfx.home()).map(([, at]) => at)).toEqual([
      0, 90, 180, 270,
    ]);
  });

  it('still plays with the sound switched off', () => {
    setSoundEnabled(false);
    expect(record(() => sfx.stomp())).toEqual([['impactHeavy', 0]]);
  });
});

describe('the Haptics switch', () => {
  it('silences every tap, including ones already scheduled', () => {
    const fired = record(() => {
      sfx.roll(760);
      haptics.select();
      setHapticsEnabled(false);
    });
    // only what fired before the switch went off
    expect(fired.every(([, at]) => at === 0)).toBe(true);

    expect(record(() => sfx.win())).toEqual([]);
  });
});
