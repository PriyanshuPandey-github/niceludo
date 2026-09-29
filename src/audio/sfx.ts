/**
 * Sound effects, synthesised live with the Web Audio API (via
 * react-native-audio-api) - no audio files, in keeping with the rest of the
 * app's artwork being code. Every effect is a few oscillators and filtered
 * noise bursts shaped by gain envelopes.
 *
 * Audio must never take the game down: if the native module is missing or
 * the context fails, every call quietly does nothing.
 *
 * Each effect also fires its haptic taps (see `haptics.ts`) with the same
 * offsets as its notes - outside the audio path, so they still play with
 * sound off.
 */

import { rollImpacts } from '../components/diceRoll';
import { Tap, tap, taps } from './haptics';

type Ctx = any;

let enabled = true;
let ctx: Ctx | null = null;
let master: any = null;
let noise: any = null;
let broken = false;

export const setSoundEnabled = (on: boolean) => {
  enabled = on;
};

/** Lazily open the audio context (and the ambient iOS session) once. */
const context = (): Ctx | null => {
  if (!enabled || broken) {
    return null;
  }
  if (ctx) {
    return ctx;
  }
  try {
    const audio = require('react-native-audio-api');
    try {
      // 'ambient': respects the silent switch and mixes with the user's music
      audio.AudioManager?.setAudioSessionOptions?.({
        iosCategory: 'ambient',
        iosAllowHaptics: true,
      });
    } catch {
      // session options are best-effort
    }
    ctx = new audio.AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    // one second of white noise, shared by every noisy effect
    const rate = ctx.sampleRate;
    noise = ctx.createBuffer(1, rate, rate);
    const data = new Float32Array(rate);
    for (let i = 0; i < rate; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.copyToChannel(data, 0);
    return ctx;
  } catch {
    broken = true;
    ctx = null;
    return null;
  }
};

/**
 * Open the audio engine ahead of time, so the first sound isn't late while
 * the context spins up.
 */
export const warmUpSound = () => {
  const c = context();
  try {
    if (c && c.state === 'suspended') {
      c.resume?.();
    }
  } catch {
    // best-effort
  }
};

/** Run a sound; any audio error just silences it. */
const play = (make: (c: Ctx, t: number) => void, delayMs = 0) => {
  const c = context();
  if (!c) {
    return;
  }
  try {
    if (c.state === 'suspended') {
      c.resume?.();
    }
    make(c, c.currentTime + Math.max(0, delayMs) / 1000);
  } catch {
    // ignore - a missed sound is fine
  }
};

/** Gain envelope: quick attack, exponential decay to silence. */
const envelope = (
  c: Ctx,
  t: number,
  peak: number,
  dur: number,
  attack = 0.005,
) => {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(master);
  return g;
};

/** A pitched blip sweeping from f0 to f1. */
const tone = (
  c: Ctx,
  t: number,
  {
    f0,
    f1 = f0,
    dur,
    peak,
    type = 'sine',
  }: { f0: number; f1?: number; dur: number; peak: number; type?: string },
) => {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  osc.connect(envelope(c, t, peak, dur));
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

/** A burst of filtered noise, the filter sweeping from f0 to f1. */
const hiss = (
  c: Ctx,
  t: number,
  {
    f0,
    f1 = f0,
    dur,
    peak,
    type = 'bandpass',
    q = 1,
    attack,
  }: {
    f0: number;
    f1?: number;
    dur: number;
    peak: number;
    type?: string;
    q?: number;
    attack?: number;
  },
) => {
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  src.connect(filter);
  filter.connect(envelope(c, t, peak, dur, attack));
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
};

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5 };

export const sfx = {
  /**
   * Dice rattling for a roll of `ms`: a click each time the tumble tips
   * onto a new face (the same moments the face flips on screen), softening
   * as it slows, then the landing knock as the die settles.
   */
  roll: (ms: number) => {
    const impacts = rollImpacts(ms);
    // a crisp tick per tip while it spins fast, lighter as it slows, and a
    // thud on the landing knock
    taps([
      ...impacts.map((at, i): [Tap, number] => [
        i < impacts.length / 2 ? 'rigid' : 'impactLight',
        at,
      ]),
      ['impactHeavy', ms],
    ]);
    play((c, t) => {
      impacts.forEach((at, i) => {
        const when = t + at / 1000;
        const force = 1 - (i / impacts.length) * 0.55;
        hiss(c, when, {
          f0: 2400 + Math.random() * 1800,
          dur: 0.03,
          peak: 0.3 * force,
          q: 3,
        });
        tone(c, when, { f0: 240, f1: 160, dur: 0.04, peak: 0.12 * force });
      });
      const end = t + ms / 1000;
      tone(c, end, { f0: 190, f1: 85, dur: 0.12, peak: 0.45 });
      hiss(c, end, { f0: 3000, dur: 0.035, peak: 0.25, q: 2 });
    });
  },

  /** one hop of a walking piece */
  step: () => {
    tap('impactLight');
    play((c, t) => tone(c, t, { f0: 520, f1: 700, dur: 0.05, peak: 0.12 }));
  },

  /** a piece popping out of its yard */
  pop: () => {
    tap('impactMedium');
    play((c, t) => {
      tone(c, t, { f0: 300, f1: 900, dur: 0.08, peak: 0.3 });
      tone(c, t + 0.06, { f0: 900, f1: 1200, dur: 0.05, peak: 0.12 });
    });
  },

  /** the web-shooter "thwip" */
  thwip: (delayMs = 0) => {
    tap('rigid', delayMs);
    play((c, t) => {
      hiss(c, t, {
        f0: 3200,
        f1: 900,
        dur: 0.14,
        peak: 0.45,
        q: 1.4,
        attack: 0.002,
      });
      tone(c, t, { f0: 1700, f1: 480, dur: 0.11, peak: 0.1, type: 'triangle' });
    }, delayMs);
  },

  /** a piece being reeled in along a thread */
  zip: (ms: number, delayMs = 0) =>
    play((c, t) => {
      const dur = ms / 1000;
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(820, t + dur);
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      osc.connect(filter);
      filter.connect(envelope(c, t, 0.07, dur, 0.04));
      osc.start(t);
      osc.stop(t + dur + 0.02);
      hiss(c, t, {
        f0: 3000,
        f1: 5000,
        dur,
        peak: 0.05,
        type: 'highpass',
        attack: 0.05,
      });
    }, delayMs),

  /** a piece landing */
  land: (delayMs = 0) => {
    tap('impactHeavy', delayMs);
    play((c, t) => {
      tone(c, t, { f0: 150, f1: 70, dur: 0.12, peak: 0.45 });
      hiss(c, t, { f0: 700, dur: 0.06, peak: 0.12, type: 'lowpass' });
    }, delayMs);
  },

  /** the attacker stamping down on a capture */
  stomp: () => {
    tap('impactHeavy');
    play((c, t) => {
      tone(c, t, { f0: 115, f1: 38, dur: 0.22, peak: 0.85 });
      hiss(c, t, { f0: 650, f1: 220, dur: 0.1, peak: 0.5, type: 'lowpass' });
    });
  },

  /** a web splat bursting */
  splat: (delayMs = 0) => {
    tap('impactMedium', delayMs);
    play((c, t) => {
      hiss(c, t, {
        f0: 1300,
        f1: 600,
        dur: 0.14,
        peak: 0.42,
        q: 0.8,
        attack: 0.002,
      });
    }, delayMs);
  },

  /** web wrapping round a victim */
  wrap: (delayMs = 0) => {
    taps([0, 90, 170].map((o): [Tap, number] => ['soft', delayMs + o]));
    play((c, t) => {
      [0, 0.09, 0.17].forEach(o =>
        hiss(c, t + o, {
          f0: 1500,
          f1: 4200,
          dur: 0.08,
          peak: 0.2,
          type: 'highpass',
        }),
      );
    }, delayMs);
  },

  /** a victim flung through the air */
  whoosh: (ms: number, delayMs = 0) =>
    play((c, t) => {
      const dur = ms / 1000;
      const src = c.createBufferSource();
      src.buffer = noise;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.5);
      filter.frequency.exponentialRampToValueAtTime(500, t + dur);
      src.connect(filter);
      filter.connect(envelope(c, t, 0.35, dur, dur * 0.35));
      src.start(t);
      src.stop(t + dur + 0.02);
    }, delayMs),

  /** a cartoon boing - a plain disc being knocked out */
  bonk: (delayMs = 0) => {
    tap('impactMedium', delayMs);
    play((c, t) => {
      tone(c, t, { f0: 620, f1: 140, dur: 0.26, peak: 0.22, type: 'triangle' });
    }, delayMs);
  },

  /** no legal move */
  nope: () => {
    taps([
      ['impactMedium', 0],
      ['impactLight', 120],
    ]);
    play((c, t) => {
      tone(c, t, { f0: 330, f1: 300, dur: 0.09, peak: 0.16, type: 'square' });
      tone(c, t + 0.12, {
        f0: 250,
        f1: 220,
        dur: 0.12,
        peak: 0.16,
        type: 'square',
      });
    });
  },

  /** a piece reaching home: arpeggio and sparkles */
  home: () => {
    // one tap per note of the rising arpeggio
    taps(
      (['impactLight', 'impactLight', 'impactMedium', 'rigid'] as Tap[]).map(
        (type, i): [Tap, number] => [type, i * 90],
      ),
    );
    play((c, t) => {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
        tone(c, t + i * 0.09, {
          f0: f,
          dur: 0.22,
          peak: 0.2,
          type: 'triangle',
        }),
      );
      for (let i = 0; i < 7; i++) {
        tone(c, t + 0.3 + Math.random() * 0.5, {
          f0: 2200 + Math.random() * 2200,
          dur: 0.06,
          peak: 0.06,
        });
      }
    });
  },

  /** winning the game: a rising run into a held chord */
  win: () => {
    // the rising run, then the held chord
    taps([
      ...[0, 100, 200, 300, 400].map((at, i): [Tap, number] => [
        i < 3 ? 'impactLight' : 'impactMedium',
        at,
      ]),
      ['impactHeavy', 550],
    ]);
    play((c, t) => {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) =>
        tone(c, t + i * 0.1, { f0: f, dur: 0.2, peak: 0.18, type: 'triangle' }),
      );
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach(f =>
        tone(c, t + 0.55, { f0: f, dur: 1.1, peak: 0.12, type: 'triangle' }),
      );
    });
  },
};
