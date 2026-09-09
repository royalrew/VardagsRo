const CYCLING_WARMUP_KEY_PREFIX = "project100:cycling-warmup:";

export function cyclingWarmupIsComplete(missionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(`${CYCLING_WARMUP_KEY_PREFIX}${missionId}`) === "complete";
  } catch {
    return false;
  }
}

export function markCyclingWarmupComplete(missionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${CYCLING_WARMUP_KEY_PREFIX}${missionId}`, "complete");
  } catch {
    // Training remains available when browser storage is blocked.
  }
  window.dispatchEvent(new Event("project100:warmup"));
}

export function clearCyclingWarmup(missionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${CYCLING_WARMUP_KEY_PREFIX}${missionId}`);
  } catch {
    // A fresh pass still works when browser storage is blocked.
  }
  window.dispatchEvent(new Event("project100:warmup"));
}

export function subscribeToWarmupMemory(onChange: () => void): () => void {
  window.addEventListener("project100:warmup", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("project100:warmup", onChange);
    window.removeEventListener("storage", onChange);
  };
}
