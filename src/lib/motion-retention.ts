export type MotionExerciseType =
  | "squat"
  | "lunge"
  | "pushup"
  | "jumping-jacks"
  | "plank"
  | "circuit"
  | "boss-fight";

export type MotionCoachMode = "rep-counter" | "living-coach";

export interface MotionWorkoutRecord {
  id: string;
  completedAt: string;
  exercise: MotionExerciseType;
  totalReps: number;
  durationSeconds: number;
  formScore: number;
  xpEarned: number;
  coachMode: MotionCoachMode;
}

export interface MotionRetentionSummary {
  totalWorkouts: number;
  totalReps: number;
  totalXp: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lastWorkoutDate: string | null;
  coachPreference: {
    repCounterCount: number;
    livingCoachCount: number;
    preferredMode: MotionCoachMode;
  };
}

export interface PerformanceBudgetReport {
  passesAll: boolean;
  checks: {
    pose: boolean;
    render: boolean;
    latency: boolean;
  };
  recommendations: string[];
}

function toCalendarDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayDifference(dateStrA: string, dateStrB: string): number {
  const msA = Date.parse(`${dateStrA}T00:00:00Z`);
  const msB = Date.parse(`${dateStrB}T00:00:00Z`);
  return Math.round((msB - msA) / (1000 * 60 * 60 * 24));
}

/**
 * Computes multi-session retention statistics, streaks, and Coach A/B preference.
 * (Fas I, Steg 85 & 86)
 */
export function computeRetentionSummary(
  history: readonly MotionWorkoutRecord[],
  now: Date = new Date(),
): MotionRetentionSummary {
  if (history.length === 0) {
    return {
      totalWorkouts: 0,
      totalReps: 0,
      totalXp: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastWorkoutDate: null,
      coachPreference: {
        repCounterCount: 0,
        livingCoachCount: 0,
        preferredMode: "living-coach",
      },
    };
  }

  let totalReps = 0;
  let totalXp = 0;
  let repCounterCount = 0;
  let livingCoachCount = 0;

  for (const record of history) {
    totalReps += record.totalReps;
    totalXp += record.xpEarned;
    if (record.coachMode === "rep-counter") {
      repCounterCount++;
    } else {
      livingCoachCount++;
    }
  }

  const preferredMode: MotionCoachMode =
    livingCoachCount >= repCounterCount ? "living-coach" : "rep-counter";

  // Calculate calendar-day streaks
  const uniqueDays = Array.from(
    new Set(history.map((record) => toCalendarDay(new Date(record.completedAt)))),
  ).sort();

  let longestStreak = 0;
  let runningStreak = 0;
  let prevDay: string | null = null;

  for (const day of uniqueDays) {
    if (!prevDay) {
      runningStreak = 1;
    } else {
      const diff = dayDifference(prevDay, day);
      if (diff === 1) {
        runningStreak++;
      } else if (diff > 1) {
        runningStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, runningStreak);
    prevDay = day;
  }

  const todayStr = toCalendarDay(now);
  const lastRecordedDay = uniqueDays[uniqueDays.length - 1];
  const diffFromToday = dayDifference(lastRecordedDay, todayStr);

  let currentStreak = 0;
  if (diffFromToday <= 1) {
    currentStreak = runningStreak;
  }

  return {
    totalWorkouts: history.length,
    totalReps,
    totalXp,
    currentStreakDays: currentStreak,
    longestStreakDays: longestStreak,
    lastWorkoutDate: history[history.length - 1].completedAt,
    coachPreference: {
      repCounterCount,
      livingCoachCount,
      preferredMode,
    },
  };
}

/**
 * Appends a workout session and returns an updated retention summary.
 */
export function recordWorkoutSession(
  history: MotionWorkoutRecord[],
  session: Omit<MotionWorkoutRecord, "id" | "completedAt">,
  timestamp: Date = new Date(),
): {
  updatedHistory: MotionWorkoutRecord[];
  summary: MotionRetentionSummary;
  isNewStreakDay: boolean;
} {
  const record: MotionWorkoutRecord = {
    ...session,
    id: `workout_${timestamp.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    completedAt: timestamp.toISOString(),
  };

  const updatedHistory = [...history, record];
  const summary = computeRetentionSummary(updatedHistory, timestamp);

  const prevSummary = computeRetentionSummary(history, timestamp);
  const isNewStreakDay = summary.currentStreakDays > prevSummary.currentStreakDays;

  return {
    updatedHistory,
    summary,
    isNewStreakDay,
  };
}

/**
 * Validates whether the current environment meets the runtime performance budget.
 * Standard budget: Pose >= 20 Hz, Render >= 30 FPS, Latency p95 <= 80 ms (local) or <= 120 ms (HDMI).
 */
export function evaluatePerformanceBudget(metrics: {
  poseHz: number;
  renderFps: number;
  p95PipelineLatencyMs: number;
  isHdmi?: boolean;
}): PerformanceBudgetReport {
  const latencyLimit = metrics.isHdmi ? 120 : 80;

  const poseOk = metrics.poseHz >= 20.0;
  const renderOk = metrics.renderFps >= 30.0;
  const latencyOk = metrics.p95PipelineLatencyMs <= latencyLimit;

  const recommendations: string[] = [];
  if (!poseOk) {
    recommendations.push(
      `Pose-frekvens under målet (uppmätt: ${metrics.poseHz.toFixed(1)} Hz, mål: >=20.0 Hz). Kontrollera GPU-acceleration eller välj 640x480.`,
    );
  }
  if (!renderOk) {
    recommendations.push(
      `Render-framerate under målet (uppmätt: ${metrics.renderFps.toFixed(1)} FPS, mål: >=30.0 FPS). Stäng bakgrundsapplikationer.`,
    );
  }
  if (!latencyOk) {
    recommendations.push(
      `P95-latens (${metrics.p95PipelineLatencyMs.toFixed(1)} ms) överstiger budgeten (${latencyLimit} ms). Kontrollera kameraupplösning och bufferkö.`,
    );
  }

  return {
    passesAll: poseOk && renderOk && latencyOk,
    checks: {
      pose: poseOk,
      render: renderOk,
      latency: latencyOk,
    },
    recommendations,
  };
}
