/**
 * One timing curve for a dice roll, shared by everything that has to agree
 * on it: the tray's tumble animation, the face flips shown while it tumbles,
 * and the rattle clicks. Each "impact" is the die rolling over onto a new
 * face - a quarter turn of the tumble - so a click, a new face and the
 * visible rotation all land together, and the landing thud plays exactly
 * as the die settles.
 */
import { Easing } from 'react-native';

/** Quarter turns in one tumble (the tray spins the die 1080deg). */
export const ROLL_QUARTER_TURNS = 12;

/** The tumble decelerates: quick at first, slowing as it settles. */
export const rollEasing = Easing.out(Easing.quad);

/**
 * When the die tips onto each new face, in ms from the start of a roll of
 * `durationMs` - the moments the eased rotation crosses each quarter turn.
 * The last quarter turn is the landing itself, so it is not included.
 */
export const rollImpacts = (durationMs: number): number[] =>
  Array.from({ length: ROLL_QUARTER_TURNS - 1 }, (_, i) => {
    const turned = (i + 1) / ROLL_QUARTER_TURNS;
    // invert easeOutQuad: turned = 1 - (1 - t)^2
    return Math.round((1 - Math.sqrt(1 - turned)) * durationMs);
  });
