/**
 * Haptics, driven by the sound effects: each `sfx` effect fires its taps
 * here with the same offsets as its notes, so wherever a sound plays - the
 * dice rattle, a web shot, a landing, a capture - a matching tap lands with
 * it. They follow the Haptics switch, not the sound one, so muting the game
 * keeps the feel.
 *
 * Taps go through the platform's own feedback generators (UIKit on iOS, the
 * predefined click/tick/thud effects on Android) - see the patch in
 * `patches/react-native-haptic-feedback+3.0.0.patch`.
 */
import HapticFeedback from 'react-native-haptic-feedback';

/** From lightest to firmest. */
export type Tap =
  | 'soft'
  | 'impactLight'
  | 'selection'
  | 'impactMedium'
  | 'rigid'
  | 'impactHeavy';

let enabled = true;

/** Follows the Haptics switch in Settings. */
export const setHapticsEnabled = (on: boolean) => {
  enabled = on;
};

/** Two taps closer than this blur into one. */
export const MIN_GAP_MS = 55;

/** One tap, now or `delayMs` from now - the delay its sound was given. */
export const tap = (type: Tap, delayMs = 0) => {
  if (!enabled) {
    return;
  }
  const fire = () => {
    if (enabled) {
      HapticFeedback.trigger(type);
    }
  };
  if (delayMs > 0) {
    setTimeout(fire, delayMs);
  } else {
    fire();
  }
};

/**
 * A run of taps at `[type, ms]` offsets, skipping any that would land too
 * close to the last one kept to be felt apart.
 */
export const taps = (sequence: Array<[Tap, number]>) => {
  let last = -Infinity;
  sequence.forEach(([type, at]) => {
    if (at - last >= MIN_GAP_MS) {
      tap(type, at);
      last = at;
    }
  });
};

/** Touch feedback with no sound of its own. */
export const haptics = {
  /** tapping a pawn to move it */
  select: () => tap('impactMedium'),
};
