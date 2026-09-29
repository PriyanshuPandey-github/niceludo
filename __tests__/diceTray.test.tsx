import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ColorId } from '../src/engine';
import { DiceTray } from '../src/components/DiceTray';
import { rollImpacts } from '../src/components/diceRoll';

const mockRoll = jest.fn();
jest.mock('../src/audio/sfx', () => ({
  sfx: { roll: (ms: number) => mockRoll(ms) },
}));

const tray = (rolling: boolean, onTumbleEnd = () => {}) => (
  <DiceTray
    color={ColorId.Red}
    size={90}
    face={4}
    active
    rolling={rolling}
    interactive={false}
    playerName="Red"
    onPress={() => {}}
    rollMs={760}
    onTumbleEnd={onTumbleEnd}
  />
);

describe('DiceTray roll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRoll.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('starts the rattle with the tumble, and reports when it lands', () => {
    const ended = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(tray(false, ended));
    });
    expect(mockRoll).not.toHaveBeenCalled();

    act(() => tree.update(tray(true, ended)));
    // the sound is started by the tray as its tumble starts - not before
    expect(mockRoll).toHaveBeenCalledTimes(1);
    expect(mockRoll).toHaveBeenCalledWith(760);
    expect(ended).not.toHaveBeenCalled();

    // Dice is memoised, so find it by its props rather than its type
    const shown = () =>
      tree.root.findAll(
        node => 'tumbling' in node.props && typeof node.props.face === 'number',
      )[0].props.face;
    const impacts = rollImpacts(760);
    const faces: number[] = [];
    let elapsed = 0;
    impacts.forEach(at => {
      act(() => {
        jest.advanceTimersByTime(at - elapsed + 1);
      });
      elapsed = at + 1;
      faces.push(shown());
    });
    // it tumbles through faces, and has landed on the result before it stops
    expect(new Set(faces.slice(0, -1)).size).toBeGreaterThan(1);
    expect(faces[faces.length - 1]).toBe(4);

    act(() => {
      jest.advanceTimersByTime(760);
    });
    expect(ended).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
