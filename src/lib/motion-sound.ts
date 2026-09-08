/**
 * Audio ducking options.
 */
export interface AudioDuckingOptions {
  nowSeconds: number;
  durationSeconds?: number;
  duckLevel?: number;
  fadeDownSeconds?: number;
  fadeUpSeconds?: number;
}

/**
 * Computes instantaneous ducking multiplier [duckLevel, 1.0] for software volume adjustments.
 *
 * @param elapsedMs - Milliseconds elapsed since ducking was triggered.
 * @param duckDurationMs - Duration of the ducking window in milliseconds.
 * @param duckLevel - Attenuated volume fraction (0.0 to 1.0).
 * @param fadeMs - Fade in / fade out duration in milliseconds.
 * @returns Volume multiplier from duckLevel to 1.0.
 */
export function computeDuckingGainMultiplier(
  elapsedMs: number,
  duckDurationMs: number,
  duckLevel = 0.25,
  fadeMs = 120,
): number {
  if (elapsedMs < 0) return 1.0;
  if (elapsedMs > duckDurationMs + fadeMs) return 1.0;

  // Ramping down
  if (elapsedMs < fadeMs) {
    const progress = elapsedMs / fadeMs;
    return 1.0 - progress * (1.0 - duckLevel);
  }

  // Sustained ducking
  if (elapsedMs <= duckDurationMs) {
    return duckLevel;
  }

  // Ramping back up
  const recoveryProgress = (elapsedMs - duckDurationMs) / fadeMs;
  return Math.min(1.0, duckLevel + recoveryProgress * (1.0 - duckLevel));
}

/**
 * Schedules Web Audio gain ramps on a GainNode to duck background music/audio during voice speech.
 *
 * @param gainNode - GainNode to attenuate.
 * @param options - Ducking timing and level options.
 */
export function duckAudioGainNode(
  gainNode: GainNode,
  options: AudioDuckingOptions,
): void {
  const {
    nowSeconds,
    durationSeconds = 2.0,
    duckLevel = 0.25,
    fadeDownSeconds = 0.08,
    fadeUpSeconds = 0.25,
  } = options;

  const gain = gainNode.gain;
  gain.cancelScheduledValues(nowSeconds);
  gain.setValueAtTime(gain.value || 1.0, nowSeconds);
  gain.linearRampToValueAtTime(duckLevel, nowSeconds + fadeDownSeconds);
  gain.setValueAtTime(duckLevel, nowSeconds + durationSeconds);
  gain.linearRampToValueAtTime(1.0, nowSeconds + durationSeconds + fadeUpSeconds);
}

/**
 * Synthesizes a metallic parry sound for perfect sweet-spot strikes.
 */
export function playParrySound(audioContext: AudioContext): void {
  try {
    const now = audioContext.currentTime;
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.08);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1320, now);
    osc2.frequency.exponentialRampToValueAtTime(2640, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  } catch {
    // AudioContext may be suspended or blocked
  }
}

/**
 * Synthesizes a hazard alert tone for dangerous incoming projectiles.
 */
export function playHazardAlertSound(audioContext: AudioContext): void {
  try {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(330, now + 0.06);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // AudioContext fallback
  }
}
