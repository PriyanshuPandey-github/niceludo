import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { ColorId } from '../src/engine';
import { isOnlineState, useIsOnline } from '../src/state/network';
import { NewGameSheet } from '../src/components/NewGameSheet';

const listen = NetInfo.addEventListener as jest.Mock;
const configure = NetInfo.configure as jest.Mock;

const state = (
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
) => ({ isConnected, isInternetReachable } as NetInfoState);

/** The listener the app registered, to push connection changes through. */
const connection = () => {
  const calls = listen.mock.calls;
  return calls[calls.length - 1][0] as (s: NetInfoState) => void;
};

describe('online or not', () => {
  const options = () => configure.mock.calls[0][0];
  const reply = (status: number, body: string) =>
    ({ status, text: () => Promise.resolve(body) } as unknown as Response);

  it('really checks for internet on iOS, against Apple', async () => {
    // Jest runs as iOS
    expect(options().reachabilityShouldRun()).toBe(true);
    expect(options().reachabilityUrl).toContain('captive.apple.com');
    const page =
      '<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>';
    expect(await options().reachabilityTest(reply(200, page))).toBe(true);
  });

  it('treats a hotspot login page or an error as no internet', async () => {
    const login = '<html><body>Sign in to Cafe WiFi</body></html>';
    expect(await options().reachabilityTest(reply(200, login))).toBe(false);
    expect(await options().reachabilityTest(reply(503, 'Success'))).toBe(false);
  });

  it('is offline without a connection, or without internet on it', () => {
    expect(isOnlineState(state(true, true))).toBe(true);
    expect(isOnlineState(state(false, false))).toBe(false);
    // on wifi, but the OS found no internet behind it
    expect(isOnlineState(state(true, false))).toBe(false);
  });

  it('counts "still checking" as online, so nothing flashes offline', () => {
    expect(isOnlineState(state(null, null))).toBe(true);
    expect(isOnlineState(state(true, null))).toBe(true);
  });

  it('follows the connection as it changes', () => {
    const Probe = () => <Text>{useIsOnline() ? 'online' : 'offline'}</Text>;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe />);
    });
    const shown = () => tree.root.findByType(Text).props.children;
    expect(shown()).toBe('online');
    act(() => connection()(state(false, false)));
    expect(shown()).toBe('offline');
    act(() => connection()(state(true, true)));
    expect(shown()).toBe('online');
    act(() => tree.unmount());
  });
});

describe('Online mode while offline', () => {
  const mount = (online: boolean) => {
    const onStart = jest.fn();
    const sheet = (isOnline: boolean) => (
      <NewGameSheet
        visible
        onClose={() => {}}
        seats={[ColorId.Red, ColorId.Yellow]}
        onSeatsChange={() => {}}
        difficulty="normal"
        onDifficultyChange={() => {}}
        onStart={onStart}
        online={isOnline}
      />
    );
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(sheet(online));
    });
    return { tree, onStart, setOnline: (v: boolean) => tree.update(sheet(v)) };
  };
  const tile = (tree: renderer.ReactTestRenderer, label: string) =>
    tree.root.find(
      n =>
        n.props?.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
    );
  const hasText = (tree: renderer.ReactTestRenderer, text: string) =>
    tree.root.findAll(n => n.props?.children === text).length > 0;

  it('is marked unavailable, and the other modes are not', () => {
    const { tree } = mount(false);
    expect(tile(tree, 'Online').props.disabled).toBe(true);
    expect(hasText(tree, 'OFFLINE')).toBe(true);
    expect(tile(tree, 'vs CPU').props.disabled).toBe(false);
    expect(tile(tree, 'Pass & Play').props.disabled).toBe(false);
    act(() => tree.unmount());
  });

  it('shows BETA again once back online', () => {
    const { tree, setOnline } = mount(false);
    act(() => setOnline(true));
    expect(tile(tree, 'Online').props.disabled).toBe(false);
    expect(hasText(tree, 'BETA')).toBe(true);
    expect(hasText(tree, 'OFFLINE')).toBe(false);
    act(() => tree.unmount());
  });

  it('calls the search off if the connection drops mid-match', () => {
    jest.useFakeTimers();
    try {
      const { tree, onStart, setOnline } = mount(true);
      act(() => tile(tree, 'Online').props.onPress());
      const findMatch = tree.root.find(
        n =>
          typeof n.props?.onPress === 'function' &&
          n.findAll(c => c.props?.children === 'Find match').length > 0,
      );
      act(() => findMatch.props.onPress());
      expect(hasText(tree, 'Searching...')).toBe(true);

      act(() => setOnline(false));
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(onStart).not.toHaveBeenCalled();
      expect(hasText(tree, 'Searching...')).toBe(false);
      // and it can't be restarted until the connection is back
      expect(hasText(tree, "You're offline")).toBe(true);
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });
});
