import type { Project100MediaItem } from "@/lib/project100-media";

export interface BodyComparisonStats {
  daysDiff: number;
  weightBeforeKg: number | null;
  weightAfterKg: number | null;
  weightDeltaKg: number | null;
}

/**
 * Calculates the number of calendar days and weight difference between two body photos.
 */
export function calculateBodyComparison(
  beforePhoto: Project100MediaItem | null,
  afterPhoto: Project100MediaItem | null,
  weightsByDay: Map<string, number>,
): BodyComparisonStats | null {
  if (!beforePhoto || !afterPhoto) {
    return null;
  }

  const beforeDate = new Date(`${beforePhoto.capturedOn}T12:00:00Z`);
  const afterDate = new Date(`${afterPhoto.capturedOn}T12:00:00Z`);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDiff = Math.round((afterDate.getTime() - beforeDate.getTime()) / msPerDay);

  const weightBeforeKg = weightsByDay.get(beforePhoto.capturedOn) ?? null;
  const weightAfterKg = weightsByDay.get(afterPhoto.capturedOn) ?? null;
  const weightDeltaKg =
    weightBeforeKg !== null && weightAfterKg !== null
      ? Math.round((weightAfterKg - weightBeforeKg) * 10) / 10
      : null;

  return {
    daysDiff,
    weightBeforeKg,
    weightAfterKg,
    weightDeltaKg,
  };
}
