import { addCalendarDateDays, startOfCalendarWeek } from "@/lib/dates";
import type { Project100TrainingSession } from "@/lib/project100-training";

export type BenchmarkCategory = "strength" | "running";

export interface BenchmarkThreshold {
  level: string;
  minVal: number; // For strength: min reps or min seconds; for running: max seconds
  description?: string;
}

export interface Project100BenchmarkEvaluation {
  id: string;
  name: string;
  category: BenchmarkCategory;
  unit: "reps" | "seconds" | "time";
  bestValue: number | null;
  formattedBest: string | null;
  currentLevel: string;
  nextLevel: string | null;
  nextRequirement: number | null;
  formattedNextRequirement: string | null;
  remainingToNext: number | null;
  formattedRemaining: string | null;
  achievedOn: string | null;
  achievedSessionId: string | null;
  recentEntries: Array<{
    date: string;
    value: number;
    formatted: string;
    sessionId: string;
  }>;
}

export interface RunningAnalytics {
  distanceKmThisWeek: number;
  durationMinutesThisWeek: number;
  averagePaceFormatted: string | null;
  totalRunningSessionsThisWeek: number;
  latestSession: {
    id: string;
    date: string;
    title: string;
    distanceKm: number;
    durationMinutes: number;
    paceFormatted: string;
  } | null;
  best5k: {
    timeSeconds: number;
    formattedTime: string;
    paceFormatted: string;
    date: string;
    distanceKm: number;
    sessionId: string;
  } | null;
  best10k: {
    timeSeconds: number;
    formattedTime: string;
    paceFormatted: string;
    date: string;
    distanceKm: number;
    sessionId: string;
  } | null;
}

// ==========================================
// PACE & TIME HELPERS
// ==========================================

/** Parses a time string (e.g. "29:42", "1:15:30", "45", "45 min") to total seconds */
export function parseDurationToSeconds(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return input > 0 ? Math.round(input) : null;

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Check hh:mm:ss or mm:ss
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => parseFloat(p.trim()));
    if (parts.some((p) => isNaN(p))) return null;
    if (parts.length === 3) {
      return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
    if (parts.length === 2) {
      return Math.round(parts[0] * 60 + parts[1]);
    }
  }

  // Check pure numbers or "X min"
  const cleanNumber = parseFloat(trimmed.replace(",", ".").replace(/[^0-9.]/g, ""));
  if (isNaN(cleanNumber) || cleanNumber <= 0) return null;

  if (trimmed.includes("sek") || trimmed.includes("s")) {
    return Math.round(cleanNumber);
  }
  if (trimmed.includes("h") || trimmed.includes("tim")) {
    return Math.round(cleanNumber * 3600);
  }
  // Default plain numeric input to minutes if >= 1 and no unit
  return Math.round(cleanNumber * 60);
}

/** Parses distance string (e.g. "5.02", "5,02", "5.02 km") to meters */
export function parseDistanceToMeters(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return input > 0 ? Math.round(input) : null;

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const cleanNumber = parseFloat(trimmed.replace(",", ".").replace(/[^0-9.]/g, ""));
  if (isNaN(cleanNumber) || cleanNumber <= 0) return null;

  if (trimmed.includes("m") && !trimmed.includes("km")) {
    return Math.round(cleanNumber);
  }
  // Default to km
  return Math.round(cleanNumber * 1000);
}

/** Formats seconds into MM:SS or HH:MM:SS */
export function formatDurationTime(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Calculates pace from meters and seconds.
 * Returns pace in min/km format (e.g. "5:55 min/km").
 */
export function calculatePace(
  distanceMeters: number | null | undefined,
  durationSeconds: number | null | undefined,
): { paceSecondsPerKm: number | null; formattedPace: string } {
  if (!distanceMeters || distanceMeters <= 0 || !durationSeconds || durationSeconds <= 0) {
    return { paceSecondsPerKm: null, formattedPace: "—" };
  }

  const distanceKm = distanceMeters / 1000;
  const paceSecondsPerKm = durationSeconds / distanceKm;
  const paceMinutes = Math.floor(paceSecondsPerKm / 60);
  const paceRemainingSeconds = Math.round(paceSecondsPerKm % 60);

  // If remaining seconds round to 60, handle overflow
  const adjustedMinutes = paceRemainingSeconds === 60 ? paceMinutes + 1 : paceMinutes;
  const adjustedSeconds = paceRemainingSeconds === 60 ? 0 : paceRemainingSeconds;

  const formattedPace = `${adjustedMinutes}:${adjustedSeconds.toString().padStart(2, "0")} min/km`;
  return { paceSecondsPerKm, formattedPace };
}

// ==========================================
// BENCHMARK DEFINITIONS
// ==========================================

interface StrengthBenchmarkDef {
  id: string;
  name: string;
  unit: "reps" | "seconds";
  aliases: string[];
  thresholds: Array<{ level: string; minVal: number }>;
}

const STRENGTH_BENCHMARK_DEFS: StrengthBenchmarkDef[] = [
  {
    id: "pushups",
    name: "Armhävningar",
    unit: "reps",
    aliases: ["armhävningar", "armhävning", "push-up", "push-ups", "pushup", "pushups"],
    thresholds: [
      { level: "Nybörjare", minVal: 0 },
      { level: "Grundtränad", minVal: 10 },
      { level: "Vältränad", minVal: 20 },
      { level: "Stark", minVal: 30 },
      { level: "Mycket stark", minVal: 40 },
      { level: "Avancerad kroppsvikt", minVal: 50 },
    ],
  },
  {
    id: "pullups",
    name: "Pull-ups",
    unit: "reps",
    aliases: ["pull-ups", "pull-up", "pullups", "pullup", "chins", "chin-ups", "chin-up"],
    thresholds: [
      { level: "Nybörjare", minVal: 0 },
      { level: "Grundtränad", minVal: 1 },
      { level: "Vältränad", minVal: 5 },
      { level: "Stark", minVal: 10 },
      { level: "Mycket stark", minVal: 15 },
      { level: "Avancerad", minVal: 20 },
    ],
  },
  {
    id: "dips",
    name: "Dips",
    unit: "reps",
    aliases: ["dips", "dip", "bar dips", "ring dips"],
    thresholds: [
      { level: "Nybörjare", minVal: 0 },
      { level: "Grundtränad", minVal: 5 },
      { level: "Vältränad", minVal: 10 },
      { level: "Stark", minVal: 20 },
      { level: "Mycket stark", minVal: 30 },
    ],
  },
  {
    id: "plank",
    name: "Plankan",
    unit: "seconds",
    aliases: ["planka", "plankan", "plank"],
    thresholds: [
      { level: "Nybörjare", minVal: 0 },
      { level: "Grundtränad", minVal: 45 },
      { level: "Vältränad", minVal: 90 },
      { level: "Stark", minVal: 120 },
      { level: "Mycket stark", minVal: 180 },
    ],
  },
  {
    id: "deadhang",
    name: "Dead hang",
    unit: "seconds",
    aliases: ["dead hang", "dead-hang", "deadhang", "häng", "hängande"],
    thresholds: [
      { level: "Nybörjare", minVal: 0 },
      { level: "Grundtränad", minVal: 20 },
      { level: "Vältränad", minVal: 40 },
      { level: "Stark", minVal: 60 },
      { level: "Mycket stark", minVal: 90 },
    ],
  },
];

interface RunningBenchmarkDef {
  id: string;
  name: string;
  targetMeters: number;
  minToleranceMeters: number;
  maxToleranceMeters: number;
  // For running: maxSeconds represents strictly UNDER that threshold
  thresholds: Array<{ level: string; maxSeconds: number; label: string }>;
}

const RUNNING_BENCHMARK_DEFS: RunningBenchmarkDef[] = [
  {
    id: "running_5k",
    name: "5 km Löpning",
    targetMeters: 5000,
    minToleranceMeters: 4900,
    maxToleranceMeters: 5100,
    thresholds: [
      { level: "Nybörjare", maxSeconds: Infinity, label: "35:00+" },
      { level: "Grundtränad", maxSeconds: 35 * 60, label: "Sub 35:00" },
      { level: "Vältränad", maxSeconds: 30 * 60, label: "Sub 30:00" },
      { level: "Stark kondition", maxSeconds: 25 * 60, label: "Sub 25:00" },
      { level: "Mycket vältränad", maxSeconds: 22 * 60, label: "Sub 22:00" },
      { level: "Avancerad motionär", maxSeconds: 20 * 60, label: "Sub 20:00" },
    ],
  },
  {
    id: "running_10k",
    name: "10 km Löpning",
    targetMeters: 10000,
    minToleranceMeters: 9800,
    maxToleranceMeters: 10200,
    thresholds: [
      { level: "Nybörjare", maxSeconds: Infinity, label: "70:00+" },
      { level: "Grundtränad", maxSeconds: 70 * 60, label: "Sub 70:00" },
      { level: "Vältränad", maxSeconds: 60 * 60, label: "Sub 60:00" },
      { level: "Stark", maxSeconds: 50 * 60, label: "Sub 50:00" },
      { level: "Mycket vältränad", maxSeconds: 45 * 60, label: "Sub 45:00" },
      { level: "Avancerad motionär", maxSeconds: 40 * 60, label: "Sub 40:00" },
    ],
  },
];

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function matchesStrengthAlias(exerciseName: string, aliases: string[]): boolean {
  const norm = normalizeExerciseName(exerciseName);
  return aliases.some((alias) => {
    const normAlias = normalizeExerciseName(alias);
    return norm === normAlias || norm.includes(normAlias);
  });
}

// ==========================================
// EVALUATION ENGINE
// ==========================================

export function evaluateProject100Benchmarks(
  sessions: Project100TrainingSession[],
): Project100BenchmarkEvaluation[] {
  const completedSessions = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const results: Project100BenchmarkEvaluation[] = [];

  // 1. Evaluate Strength Benchmarks
  for (const def of STRENGTH_BENCHMARK_DEFS) {
    let bestVal: number | null = null;
    let achievedOn: string | null = null;
    let achievedSessionId: string | null = null;
    const entries: Array<{ date: string; value: number; formatted: string; sessionId: string }> = [];

    for (const session of completedSessions) {
      for (const ex of session.exercises) {
        if (!matchesStrengthAlias(ex.name, def.aliases)) continue;

        for (const set of ex.sets) {
          if (!set.completed || !set.actual) continue;

          let val: number | null = null;
          if (def.unit === "reps" && set.actual.reps !== null && set.actual.reps > 0) {
            val = set.actual.reps;
          } else if (def.unit === "seconds") {
            val = set.actual.durationSeconds ?? (set.actual.reps ? set.actual.reps : null);
          }

          if (val !== null && val > 0) {
            const formatted = def.unit === "seconds" ? formatDurationTime(val) : `${val} reps`;
            entries.push({
              date: session.sessionDate,
              value: val,
              formatted,
              sessionId: session.id,
            });

            if (bestVal === null || val > bestVal) {
              bestVal = val;
              achievedOn = session.sessionDate;
              achievedSessionId = session.id;
            }
          }
        }
      }
    }

    // Determine level
    let currentLevel = "Nybörjare";
    let nextLevel: string | null = null;
    let nextRequirement: number | null = null;
    let remainingToNext: number | null = null;

    const val = bestVal ?? 0;
    for (let i = def.thresholds.length - 1; i >= 0; i--) {
      if (val >= def.thresholds[i].minVal) {
        currentLevel = def.thresholds[i].level;
        if (i < def.thresholds.length - 1) {
          nextLevel = def.thresholds[i + 1].level;
          nextRequirement = def.thresholds[i + 1].minVal;
          remainingToNext = nextRequirement - val;
        }
        break;
      }
    }

    const formattedBest =
      bestVal !== null
        ? def.unit === "seconds"
          ? formatDurationTime(bestVal)
          : `${bestVal} reps`
        : "—";

    const formattedNextRequirement =
      nextRequirement !== null
        ? def.unit === "seconds"
          ? formatDurationTime(nextRequirement)
          : `${nextRequirement} reps`
        : null;

    const formattedRemaining =
      remainingToNext !== null && remainingToNext > 0
        ? def.unit === "seconds"
          ? `${remainingToNext} sek`
          : `${remainingToNext} reps`
        : null;

    results.push({
      id: def.id,
      name: def.name,
      category: "strength",
      unit: def.unit,
      bestValue: bestVal,
      formattedBest,
      currentLevel,
      nextLevel,
      nextRequirement,
      formattedNextRequirement,
      remainingToNext,
      formattedRemaining,
      achievedOn,
      achievedSessionId,
      recentEntries: entries.slice(-5).reverse(),
    });
  }

  // 2. Evaluate Running Benchmarks (5 km & 10 km)
  for (const def of RUNNING_BENCHMARK_DEFS) {
    let bestSeconds: number | null = null;
    let achievedOn: string | null = null;
    let achievedSessionId: string | null = null;
    const entries: Array<{ date: string; value: number; formatted: string; sessionId: string }> = [];

    for (const session of completedSessions) {
      if (session.activityType !== "running") continue;

      // Extract distance & duration from session level or set level
      let totalMeters = 0;
      let totalSeconds = session.durationSeconds ?? 0;

      for (const ex of session.exercises) {
        for (const set of ex.sets) {
          if (set.completed && set.actual) {
            totalMeters += set.actual.distanceMeters ?? 0;
            if (!session.durationSeconds && set.actual.durationSeconds) {
              totalSeconds += set.actual.durationSeconds;
            }
          }
        }
      }

      if (
        totalMeters >= def.minToleranceMeters &&
        totalMeters <= def.maxToleranceMeters &&
        totalSeconds > 0
      ) {
        entries.push({
          date: session.sessionDate,
          value: totalSeconds,
          formatted: formatDurationTime(totalSeconds),
          sessionId: session.id,
        });

        if (bestSeconds === null || totalSeconds < bestSeconds) {
          bestSeconds = totalSeconds;
          achievedOn = session.sessionDate;
          achievedSessionId = session.id;
        }
      }
    }

    // Determine level for running (strictly faster than threshold)
    let currentLevel = "Nybörjare";
    let nextLevel: string | null = null;
    let nextRequirement: number | null = null;
    let remainingToNext: number | null = null;

    if (bestSeconds !== null) {
      // Find the best achieved level
      for (let i = def.thresholds.length - 1; i >= 1; i--) {
        if (bestSeconds < def.thresholds[i].maxSeconds) {
          currentLevel = def.thresholds[i].level;
          if (i < def.thresholds.length - 1) {
            nextLevel = def.thresholds[i + 1].level;
            nextRequirement = def.thresholds[i + 1].maxSeconds;
            remainingToNext = bestSeconds - nextRequirement;
          }
          break;
        }
      }
      if (currentLevel === "Nybörjare") {
        nextLevel = def.thresholds[1].level;
        nextRequirement = def.thresholds[1].maxSeconds;
        remainingToNext = bestSeconds - nextRequirement;
      }
    } else {
      nextLevel = def.thresholds[1]?.level ?? "Grundtränad";
      nextRequirement = def.thresholds[1]?.maxSeconds ?? 35 * 60;
    }

    const formattedBest = bestSeconds !== null ? formatDurationTime(bestSeconds) : "—";
    const formattedNextRequirement =
      nextRequirement !== null ? `Sub ${formatDurationTime(nextRequirement)}` : null;
    const formattedRemaining =
      remainingToNext !== null && remainingToNext > 0 ? formatDurationTime(remainingToNext) : null;

    results.push({
      id: def.id,
      name: def.name,
      category: "running",
      unit: "time",
      bestValue: bestSeconds,
      formattedBest,
      currentLevel,
      nextLevel,
      nextRequirement,
      formattedNextRequirement,
      remainingToNext,
      formattedRemaining,
      achievedOn,
      achievedSessionId,
      recentEntries: entries.slice(-5).reverse(),
    });
  }

  return results;
}

// ==========================================
// RUNNING ANALYTICS
// ==========================================

export function buildRunningAnalytics(
  sessions: Project100TrainingSession[],
  today: string,
): RunningAnalytics {
  const weekStart = startOfCalendarWeek(today);
  const weekEnd = addCalendarDateDays(weekStart, 7);

  const completedRunning = sessions
    .filter((s) => s.status === "completed" && s.activityType === "running")
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

  const thisWeekRunning = completedRunning.filter(
    (s) => s.sessionDate >= weekStart && s.sessionDate < weekEnd,
  );

  let weekDistanceMeters = 0;
  let weekDurationSeconds = 0;

  for (const s of thisWeekRunning) {
    let sessionMeters = 0;
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (set.completed && set.actual) {
          sessionMeters += set.actual.distanceMeters ?? 0;
        }
      }
    }
    weekDistanceMeters += sessionMeters;
    weekDurationSeconds += s.durationSeconds ?? 0;
  }

  const { formattedPace: averagePaceFormatted } = calculatePace(
    weekDistanceMeters,
    weekDurationSeconds,
  );

  // Latest session
  let latestSession: RunningAnalytics["latestSession"] = null;
  if (completedRunning.length > 0) {
    const s = completedRunning[0];
    let sMeters = 0;
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (set.completed && set.actual) {
          sMeters += set.actual.distanceMeters ?? 0;
        }
      }
    }
    const sSeconds = s.durationSeconds ?? 0;
    const { formattedPace } = calculatePace(sMeters, sSeconds);
    latestSession = {
      id: s.id,
      date: s.sessionDate,
      title: s.title,
      distanceKm: Math.round((sMeters / 1000) * 100) / 100,
      durationMinutes: Math.round(sSeconds / 60),
      paceFormatted: formattedPace,
    };
  }

  // Best 5k & 10k
  const benchmarks = evaluateProject100Benchmarks(sessions);
  const b5k = benchmarks.find((b) => b.id === "running_5k");
  const b10k = benchmarks.find((b) => b.id === "running_10k");

  const best5k: RunningAnalytics["best5k"] =
    b5k && b5k.bestValue !== null && b5k.achievedOn && b5k.achievedSessionId
      ? {
          timeSeconds: b5k.bestValue,
          formattedTime: formatDurationTime(b5k.bestValue),
          paceFormatted: calculatePace(5000, b5k.bestValue).formattedPace,
          date: b5k.achievedOn,
          distanceKm: 5.0,
          sessionId: b5k.achievedSessionId,
        }
      : null;

  const best10k: RunningAnalytics["best10k"] =
    b10k && b10k.bestValue !== null && b10k.achievedOn && b10k.achievedSessionId
      ? {
          timeSeconds: b10k.bestValue,
          formattedTime: formatDurationTime(b10k.bestValue),
          paceFormatted: calculatePace(10000, b10k.bestValue).formattedPace,
          date: b10k.achievedOn,
          distanceKm: 10.0,
          sessionId: b10k.achievedSessionId,
        }
      : null;

  return {
    distanceKmThisWeek: Math.round((weekDistanceMeters / 1000) * 10) / 10,
    durationMinutesThisWeek: Math.round(weekDurationSeconds / 60),
    averagePaceFormatted: averagePaceFormatted !== "—" ? averagePaceFormatted : null,
    totalRunningSessionsThisWeek: thisWeekRunning.length,
    latestSession,
    best5k,
    best10k,
  };
}
