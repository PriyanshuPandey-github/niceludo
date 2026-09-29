import { Animated } from 'react-native';
import { ColorId } from '../src/engine';
import { createSwing, createYank } from '../src/components/webSwing';
import { PLAYER_COLORS } from '../src/theme/theme';

// Interpolations are plain JS nodes here; read their current value directly.
const value = (node: unknown): number =>
  parseFloat(String((node as { __getValue: () => number }).__getValue()));

const make = () =>
  createSwing({
    from: { x: 40, y: 200 },
    to: { x: 200, y: 200 },
    centre: { x: 200, y: 300 },
    unit: 30,
    pawnOffset: { x: 15, y: 16 },
    baseScale: new Animated.Value(1),
    palette: PLAYER_COLORS[ColorId.Red],
  });

describe('createSwing', () => {
  it('starts the piece where it is and lands it on the anchor', () => {
    const swing = make();
    swing.fx.progress.setValue(0);
    expect(value(swing.pawn.translateX)).toBeCloseTo(40 - 15);
    expect(value(swing.pawn.translateY)).toBeCloseTo(200 - 16);
    swing.fx.progress.setValue(2);
    expect(value(swing.pawn.translateX)).toBeCloseTo(200 - 15);
    expect(value(swing.pawn.translateY)).toBeCloseTo(200 - 16);
  });

  it('shoots both threads to the same anchor', () => {
    const swing = make();
    swing.fx.progress.setValue(1);
    swing.fx.threads.forEach((thread, i) => {
      const hand = swing.fx.hands[i];
      const size = swing.fx.handSize;
      const handX = value(hand.translateX) + size / 2;
      const handY = value(hand.translateY) + size / 2;
      const midX = value(thread.translateX) + 50;
      const midY = value(thread.translateY) + swing.fx.thickness / 2;
      // the far end of the thread is the mirror of the palm about its middle
      expect(2 * midX - handX).toBeCloseTo(200, 0);
      expect(2 * midY - handY).toBeCloseTo(200, 0);
    });
  });

  it('keeps the palms on either side of the piece', () => {
    const swing = make();
    swing.fx.progress.setValue(0.5);
    const [left, right] = swing.fx.hands.map(
      hand => value(hand.translateY) + swing.fx.handSize / 2,
    );
    expect(Math.sign(left - 200)).toBe(-Math.sign(right - 200));
    expect(swing.fx.hands.map(hand => hand.mirror)).toEqual([1, -1]);
  });
});

describe('createYank', () => {
  const makeYank = () =>
    createYank({
      from: { x: 300, y: 300 },
      to: { x: 60, y: 420 },
      unit: 30,
      pawnOffset: { x: 15, y: 16 },
      baseScale: new Animated.Value(1),
      palette: PLAYER_COLORS[ColorId.Blue],
    });
  const centre = (yank: ReturnType<typeof makeYank>) => ({
    x: value(yank.pawn.translateX) + 15,
    y: value(yank.pawn.translateY) + 16,
  });

  it('flies the victim from where it was to its yard slot', () => {
    const yank = makeYank();
    yank.fx.progress.setValue(0);
    expect(centre(yank).x).toBeCloseTo(300);
    expect(centre(yank).y).toBeCloseTo(300);
    yank.fx.progress.setValue(3);
    expect(centre(yank).x).toBeCloseTo(60);
    expect(centre(yank).y).toBeCloseTo(420);
  });

  it('throws it in a high arc, above both ends', () => {
    const yank = makeYank();
    yank.fx.progress.setValue(1.575); // mid-flight
    expect(centre(yank).y).toBeLessThan(300 - 30);
  });

  it('anchors the thread at the yard and reaches the victim', () => {
    const yank = makeYank();
    yank.fx.progress.setValue(1);
    const [thread] = yank.fx.threads;
    const midX = value(thread.translateX) + 50;
    const midY = value(thread.translateY) + yank.fx.thickness / 2;
    // the thread's middle is halfway between the anchor and the victim
    expect(midX).toBeCloseTo((60 + 300) / 2, 0);
    expect(midY).toBeCloseTo((420 + 300) / 2, 0);
    expect(yank.fx.hands).toHaveLength(0);
  });
});
