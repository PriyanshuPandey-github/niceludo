import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HapticFeedback from 'react-native-haptic-feedback';
import { PieceShow, SKITS } from '../src/components/pieceShow';
import { setHapticsEnabled } from '../src/audio/haptics';

const trigger = HapticFeedback.trigger as jest.Mock;

const mount = () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PieceShow width={335} height={235} />);
  });
  return tree;
};

const playing = (tree: renderer.ReactTestRenderer) =>
  SKITS.filter(Skit => tree.root.findAll(n => n.type === Skit).length > 0);

beforeEach(() => {
  jest.useFakeTimers();
  trigger.mockReset();
  setHapticsEnabled(true);
});
afterEach(() => {
  jest.spyOn(Math, 'random').mockRestore();
  jest.useRealTimers();
});

it('rolls on its own, silently, and the face picks the skit', () => {
  // every random draw lands on 0.5 -> the die shows a four
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const tree = mount();
  expect(playing(tree)).toEqual([]);
  act(() => {
    jest.advanceTimersByTime(900 + 820 + 600);
  });
  expect(playing(tree)).toEqual([SKITS[3]]);
  expect(trigger).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

it('rolls with sound and haptics when tapped', () => {
  const tree = mount();
  const die = tree.root.find(
    n =>
      n.props?.accessibilityLabel === 'Roll the die' &&
      typeof n.props.onPress === 'function',
  );
  act(() => {
    die.props.onPress();
    jest.advanceTimersByTime(900);
  });
  expect(trigger).toHaveBeenCalled();
  // a second tap mid-roll is ignored
  const taps = trigger.mock.calls.length;
  act(() => die.props.onPress());
  expect(trigger.mock.calls.length).toBe(taps);
  act(() => tree.unmount());
});
