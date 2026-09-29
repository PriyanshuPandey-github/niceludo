import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { EyePose, Mood, POSES, useEyes } from '../src/components/eyes';

/** Mounts useEyes and records every pose it produces. */
const watch = (mood: Mood, animated: boolean) => {
  const seen: EyePose[] = [];
  const Probe = () => {
    seen.push(useEyes(mood, animated));
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return { seen, tree };
};

const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      jest.advanceTimersByTime(50);
    });
  }
};

describe('useEyes', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('holds the resting face when not animated', () => {
    const { seen, tree } = watch('danger', false);
    advance(10000);
    expect(seen.every(p => p.tilt === POSES.worried.tilt)).toBe(true);
    act(() => tree.unmount());
  });

  it('blinks and pulls faces on its own when idle', () => {
    const { seen, tree } = watch('idle', true);
    advance(20000);
    // shut at least once, and somewhere pulled a non-blink expression
    expect(seen.some(p => p.top > 0.9)).toBe(true);
    expect(
      seen.some(
        p => p.look !== 0 || p.lift !== 0 || p.bottom > 0.2 || p.scale > 1.05,
      ),
    ).toBe(true);
    act(() => tree.unmount());
  });

  it('keeps a determined look, without blinking, while moving', () => {
    const { seen, tree } = watch('moving', true);
    advance(10000);
    const settled = seen.slice(-5);
    settled.forEach(p => expect(p.tilt).toBeCloseTo(POSES.determined.tilt));
    expect(seen.every(p => p.top < 0.9)).toBe(true);
    act(() => tree.unmount());
  });

  it('leaves no timers behind when unmounted', () => {
    const { tree } = watch('idle', true);
    advance(3000);
    act(() => tree.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });
});
