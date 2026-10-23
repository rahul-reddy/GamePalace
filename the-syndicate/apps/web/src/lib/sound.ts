// Optional sound effects, off by default. Tones are synthesized with Web Audio, so
// there are no files to download. The browser only allows audio after a user
// gesture; turning sound on is that gesture.
import { loadSoundEnabled, saveSoundEnabled } from './session';

let ctx: AudioContext | null = null;
let enabled = loadSoundEnabled();
const listeners = new Set<() => void>();

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  saveSoundEnabled(on);
  if (on) ctx ??= new AudioContext();
  listeners.forEach((l) => l());
  if (on) play('phase');
}

export function onSoundChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const PATTERNS = {
  phase: [[660, 0.08]],
  sealed: [
    [520, 0.05],
    [780, 0.08],
  ],
  success: [
    [523, 0.1],
    [659, 0.1],
    [784, 0.18],
  ],
  failure: [
    [392, 0.14],
    [311, 0.22],
  ],
  alert: [
    [880, 0.06],
    [880, 0.06],
  ],
} as const;

export type SoundKind = keyof typeof PATTERNS;

export function play(kind: SoundKind): void {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    let t = ctx.currentTime;
    for (const [freq, dur] of PATTERNS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  } catch {
    // Audio unavailable: stay silent.
  }
}
