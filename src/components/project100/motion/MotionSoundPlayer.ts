import type { MotionGameEffect } from "@/lib/motion-game";
import type { SquatCueSound } from "@/lib/motion-squat";

/**
 * Ensures an active AudioContext instance, creating or resuming it if suspended.
 */
export function ensureAudioContext(currentContext: AudioContext | null): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = currentContext ?? new AudioCtx();
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/**
 * Plays Web Audio synthesized effects for Neon Guardian arena events (hit, kick, double, duck, damage, round finish).
 */
export function playGameSound(
  audioContext: AudioContext | null,
  effect: MotionGameEffect | null,
  finished = false,
): void {
  if (!audioContext) return;
  const now = audioContext.currentTime;

  if (finished) {
    // Fanfar / rundan avklarad
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(523.25, now);
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.32);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now);
    osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.32);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.38);
    osc2.stop(now + 0.38);
    return;
  }

  if (!effect) return;

  if (effect.type === "hit") {
    // Slagträff: Köttig boxningssmäll med sub-thud, crack och neon-kross
    const subOsc = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(260, now);
    subOsc.frequency.exponentialRampToValueAtTime(65, now + 0.07);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.42, now + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    subOsc.connect(subGain);
    subGain.connect(audioContext.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.12);

    const snapOsc = audioContext.createOscillator();
    const snapGain = audioContext.createGain();
    snapOsc.type = "sawtooth";
    snapOsc.frequency.setValueAtTime(880, now);
    snapOsc.frequency.exponentialRampToValueAtTime(150, now + 0.038);
    snapGain.gain.setValueAtTime(0.0001, now);
    snapGain.gain.exponentialRampToValueAtTime(0.28, now + 0.003);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    snapOsc.connect(snapGain);
    snapGain.connect(audioContext.destination);
    snapOsc.start(now);
    snapOsc.stop(now + 0.06);

    const ringOsc = audioContext.createOscillator();
    const ringGain = audioContext.createGain();
    ringOsc.type = "sine";
    ringOsc.frequency.setValueAtTime(940, now);
    ringOsc.frequency.exponentialRampToValueAtTime(560, now + 0.1);
    ringGain.gain.setValueAtTime(0.0001, now);
    ringGain.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    ringOsc.connect(ringGain);
    ringGain.connect(audioContext.destination);
    ringOsc.start(now);
    ringOsc.stop(now + 0.14);
  } else if (effect.type === "kick") {
    // Spark: Tung lågbas-duns (180 Hz -> 45 Hz) med svepande snärt
    const subOsc = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(190, now);
    subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.16);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.55, now + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    subOsc.connect(subGain);
    subGain.connect(audioContext.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.24);

    const snapOsc = audioContext.createOscillator();
    const snapGain = audioContext.createGain();
    snapOsc.type = "triangle";
    snapOsc.frequency.setValueAtTime(440, now);
    snapOsc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    snapGain.gain.setValueAtTime(0.0001, now);
    snapGain.gain.exponentialRampToValueAtTime(0.32, now + 0.005);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    snapOsc.connect(snapGain);
    snapGain.connect(audioContext.destination);
    snapOsc.start(now);
    snapOsc.stop(now + 0.13);
  } else if (effect.type === "double") {
    // Dubbelslag: Dubbel explosion och tvåklangs neonackord
    const chord1 = audioContext.createOscillator();
    const chord2 = audioContext.createOscillator();
    const thump = audioContext.createOscillator();
    const gain = audioContext.createGain();

    chord1.type = "sine";
    chord1.frequency.setValueAtTime(587.33, now); // D5
    chord1.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    chord2.type = "triangle";
    chord2.frequency.setValueAtTime(880, now); // A5
    chord2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.16);

    thump.type = "triangle";
    thump.frequency.setValueAtTime(310, now);
    thump.frequency.exponentialRampToValueAtTime(75, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.42, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    chord1.connect(gain);
    chord2.connect(gain);
    thump.connect(gain);
    gain.connect(audioContext.destination);

    chord1.start(now);
    chord2.start(now);
    thump.start(now);
    chord1.stop(now + 0.25);
    chord2.stop(now + 0.25);
    thump.stop(now + 0.25);
  } else if (effect.type === "duck") {
    // Duck / dodge: Swoosh-svep
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (effect.type === "damage" || effect.type === "miss") {
    // Miss / skada: Mörk krasch/brum
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

/**
 * Plays Web Audio synthesized auditory feedback for Squat tracking and workout milestones.
 */
export function playSquatSound(
  audioContext: AudioContext | null,
  sound?: SquatCueSound,
): void {
  if (!sound || !audioContext) return;
  const now = audioContext.currentTime;

  if (sound === "half-depth") {
    // Hög, krispig ping när halv squat-djup nås (880 -> 1100 Hz)
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.26, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (sound === "full-depth") {
    // Solid kraft-ackord i bottenläget (440 + 659 Hz)
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.17);
    osc2.stop(now + 0.17);
  } else if (sound === "rep") {
    // Mjuk och behaglig rep-bekräftelse
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } else if (sound === "milestone") {
    playGameSound(audioContext, null, true);
  } else if (sound === "warning") {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }
}
