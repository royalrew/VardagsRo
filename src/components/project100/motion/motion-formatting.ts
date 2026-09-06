export function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

export function milliseconds(value: number | null): string {
  return value === null ? "—" : `${rounded(value)} ms`;
}

export function angleDegrees(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}°`;
}

export function baselineClock(elapsedMs: number, baselineDurationMs = 180_000): string {
  const remainingSeconds = Math.max(0, Math.ceil((baselineDurationMs - elapsedMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  return `${minutes}:${String(remainingSeconds % 60).padStart(2, "0")}`;
}

export function elapsedClock(elapsedMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
}

export function remainingClock(durationMs: number, elapsedMs: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((durationMs - Math.max(0, elapsedMs)) / 1_000));
  return `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
}
