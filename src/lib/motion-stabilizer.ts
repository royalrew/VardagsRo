import type { MotionLandmark, MotionStabilizationDiagnostics } from "./motion-engine";

export interface StabilizedMotionPose {
  diagnostics: MotionStabilizationDiagnostics;
  landmarks: MotionLandmark[];
}

interface LandmarkState {
  filtered: MotionLandmark;
  raw: MotionLandmark;
  lastReliableAtMs: number;
}

const LOW_CONFIDENCE_THRESHOLD = 0.3;
const LOW_CONFIDENCE_HOLD_MS = 120;
const RESET_GAP_MS = 500;
const FAST_LANDMARKS = new Set([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32]);
const LEG_LANDMARKS = new Set([25, 26]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneLandmark(landmark: MotionLandmark): MotionLandmark {
  return { ...landmark };
}

function isFiniteLandmark(landmark: MotionLandmark): boolean {
  return Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && Number.isFinite(landmark.z);
}

function interpolate(previous: number, next: number, alpha: number): number {
  return previous + (next - previous) * alpha;
}

export class MotionLandmarkStabilizer {
  private lastTimestampMs = -1;
  private states: Array<LandmarkState | null> = [];

  reset() {
    this.lastTimestampMs = -1;
    this.states = [];
  }

  stabilize(landmarks: readonly MotionLandmark[], timestampMs: number): StabilizedMotionPose {
    const diagnostics: MotionStabilizationDiagnostics = {
      heldLowConfidence: 0,
      limitedOutliers: 0,
    };
    const gapMs = this.lastTimestampMs < 0 ? 0 : timestampMs - this.lastTimestampMs;
    const mustReset =
      this.lastTimestampMs < 0 ||
      gapMs <= 0 ||
      gapMs > RESET_GAP_MS ||
      this.states.length !== landmarks.length;

    if (mustReset) {
      const copied = landmarks.map(cloneLandmark);
      this.states = copied.map((landmark) => ({
        filtered: cloneLandmark(landmark),
        raw: cloneLandmark(landmark),
        lastReliableAtMs: timestampMs,
      }));
      this.lastTimestampMs = timestampMs;
      return { diagnostics, landmarks: copied };
    }

    const deltaSeconds = clamp(gapMs / 1_000, 0.001, 0.2);
    const stabilized = landmarks.map((landmark, index) => {
      const previous = this.states[index];
      if (!previous || !isFiniteLandmark(landmark)) return cloneLandmark(landmark);

      const visibility = landmark.visibility ?? 1;
      if (visibility < LOW_CONFIDENCE_THRESHOLD) {
        if (timestampMs - previous.lastReliableAtMs <= LOW_CONFIDENCE_HOLD_MS) {
          diagnostics.heldLowConfidence += 1;
          const held = { ...previous.filtered, visibility: landmark.visibility };
          this.states[index] = { ...previous, filtered: held };
          return held;
        }
        const uncertain = cloneLandmark(landmark);
        this.states[index] = { ...previous, filtered: uncertain, raw: uncertain };
        return uncertain;
      }

      const fastLandmark = FAST_LANDMARKS.has(index);
      const maxSpeed = fastLandmark ? 12 : LEG_LANDMARKS.has(index) ? 6 : 4;
      const deltaX = landmark.x - previous.raw.x;
      const deltaY = landmark.y - previous.raw.y;
      const distance = Math.hypot(deltaX, deltaY);
      const maxDistance = 0.08 + maxSpeed * deltaSeconds;
      let reliable = cloneLandmark(landmark);
      if (distance > maxDistance) {
        const ratio = maxDistance / distance;
        reliable = {
          ...landmark,
          x: previous.raw.x + deltaX * ratio,
          y: previous.raw.y + deltaY * ratio,
          z: previous.raw.z + (landmark.z - previous.raw.z) * ratio,
        };
        diagnostics.limitedOutliers += 1;
      }

      const speed = Math.min(distance, maxDistance) / deltaSeconds;
      const baseAlpha = fastLandmark ? 0.62 : LEG_LANDMARKS.has(index) ? 0.38 : 0.3;
      const alpha = clamp(baseAlpha + speed * (fastLandmark ? 0.035 : 0.055), baseAlpha, 0.92);
      const filtered: MotionLandmark = {
        x: interpolate(previous.filtered.x, reliable.x, alpha),
        y: interpolate(previous.filtered.y, reliable.y, alpha),
        z: interpolate(previous.filtered.z, reliable.z, Math.max(baseAlpha, alpha * 0.8)),
        visibility: landmark.visibility,
      };
      this.states[index] = {
        filtered,
        raw: reliable,
        lastReliableAtMs: timestampMs,
      };
      return filtered;
    });

    this.lastTimestampMs = timestampMs;
    return { diagnostics, landmarks: stabilized };
  }
}
