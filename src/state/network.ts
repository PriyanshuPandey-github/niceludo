/**
 * Whether the device can actually reach the internet, for the offline banner
 * and for Online mode's availability.
 *
 * - Android answers natively: the OS marks a network "validated" only once
 *   it has confirmed real internet access behind it. No request from the app
 *   (and no INTERNET permission) is needed.
 * - iOS only knows whether a network is attached, so there the app checks
 *   for itself, against Apple's own captive-portal address - the one iOS uses
 *   to spot hotspot login pages. It re-checks every minute while online and
 *   every few seconds while offline.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

NetInfo.configure({
  useNativeReachability: true,
  // Only iOS needs the request; Android's native answer is used as-is.
  reachabilityShouldRun: () => Platform.OS === 'ios',
  reachabilityUrl: 'https://captive.apple.com/hotspot-detect.html',
  reachabilityTest: async response =>
    response.status === 200 && (await response.text()).includes('Success'),
  reachabilityMethod: 'GET',
  shouldFetchWiFiSSID: false,
});

/**
 * Online means connected with internet confirmed. "Not known yet" (while the
 * first check runs) counts as online, so nothing flashes "offline" at launch.
 */
export const isOnlineState = (state: NetInfoState): boolean =>
  state.isConnected !== false && state.isInternetReachable !== false;

export const useIsOnline = (): boolean => {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let live = true;
    const update = (state: NetInfoState) => {
      if (live) {
        setOnline(isOnlineState(state));
      }
    };
    const unsubscribe = NetInfo.addEventListener(update);
    NetInfo.fetch()
      .then(update)
      .catch(() => {});
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  return online;
};
