import type { HapticKind } from '@lss/shared';

const PATTERNS: Record<HapticKind, number | number[]> = {
  hit: 40,
  kill: [30, 40, 30],
  killed: [120, 60, 220],
  respawn: [20, 30, 20],
};

/** Vibrates on Android browsers; iOS Safari ignores navigator.vibrate. */
export function vibrate(kind: HapticKind): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(PATTERNS[kind]);
  }
}
