import type { ExerciseType } from "./motion-exercises";

export interface MotionAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export interface MotionGamificationState {
  xp: number;
  level: number;
  title: string;
  streakDays: number;
  lastActiveDate: string | null;
  lifetimeWorkouts: number;
  lifetimeReps: number;
  unlockedAchievements: readonly MotionAchievement[];
}

export interface WorkoutGamificationPayload {
  completedSets: number;
  totalReps: number;
  averageFormScore: number;
  exercisesUsed: readonly ExerciseType[];
  now?: string;
}

export interface XpBreakdown {
  baseSetsXp: number;
  completionBonusXp: number;
  formBonusXp: number;
  streakBonusXp: number;
  totalXp: number;
}

export const LEVEL_TIERS: readonly { minXp: number; level: number; title: string }[] = [
  { minXp: 0, level: 1, title: "Rekryt" },
  { minXp: 500, level: 2, title: "Väktare" },
  { minXp: 1500, level: 3, title: "Kämpe" },
  { minXp: 3000, level: 4, title: "Mästare" },
  { minXp: 5500, level: 5, title: "Legend" },
];

export const ALL_ACHIEVEMENTS: readonly MotionAchievement[] = [
  {
    id: "first_rep",
    name: "Första steget",
    description: "Genomför din allra första träningsrepetition framför kameran.",
    icon: "🌱",
    unlockedAt: null,
  },
  {
    id: "perfect_form",
    name: "Kirurgisk precision",
    description: "Genomför ett set med minst 95 % i teknik- och djupbetyg.",
    icon: "🎯",
    unlockedAt: null,
  },
  {
    id: "streak_3",
    name: "Uthållighet",
    description: "Träna 3 dagar i rad.",
    icon: "🔥",
    unlockedAt: null,
  },
  {
    id: "century_club",
    name: "100-Klubben",
    description: "Samla ihop över 100 repetitioner totalt.",
    icon: "💯",
    unlockedAt: null,
  },
  {
    id: "full_body",
    name: "Helkroppsmästare",
    description: "Träna alla fem basövningar: Knäböj, Armhävningar, Utfall, Jacks och Planka.",
    icon: "👑",
    unlockedAt: null,
  },
];

export function createDefaultGamificationState(): MotionGamificationState {
  return {
    xp: 0,
    level: 1,
    title: "Rekryt",
    streakDays: 0,
    lastActiveDate: null,
    lifetimeWorkouts: 0,
    lifetimeReps: 0,
    unlockedAchievements: [],
  };
}

export function calculateWorkoutXp(params: {
  completedSets: number;
  totalReps: number;
  averageFormScore: number;
  streakDays: number;
}): XpBreakdown {
  const baseSetsXp = params.completedSets * 50;
  const completionBonusXp = params.completedSets > 0 ? 150 : 0;
  const formBonusXp = params.averageFormScore >= 90 ? 20 : 0;
  const subtotal = baseSetsXp + completionBonusXp + formBonusXp;

  const streakMultiplier = Math.min(0.5, params.streakDays * 0.05);
  const streakBonusXp = Math.round(subtotal * streakMultiplier);

  return {
    baseSetsXp,
    completionBonusXp,
    formBonusXp,
    streakBonusXp,
    totalXp: subtotal + streakBonusXp,
  };
}

export function getLevelAndTitle(xp: number): { level: number; title: string } {
  let highest = LEVEL_TIERS[0] ?? { level: 1, title: "Rekryt" };
  for (const tier of LEVEL_TIERS) {
    if (xp >= tier.minXp) {
      highest = tier;
    }
  }
  return { level: highest.level, title: highest.title };
}

export function evaluateAchievements(
  state: MotionGamificationState,
  payload: WorkoutGamificationPayload,
  nowIso: string,
): readonly MotionAchievement[] {
  const alreadyUnlocked = new Set(state.unlockedAchievements.map((a) => a.id));
  const newUnlocked: MotionAchievement[] = [...state.unlockedAchievements];

  const totalReps = state.lifetimeReps + payload.totalReps;

  for (const ach of ALL_ACHIEVEMENTS) {
    if (alreadyUnlocked.has(ach.id)) continue;

    let qualifies = false;
    if (ach.id === "first_rep" && totalReps >= 1) {
      qualifies = true;
    } else if (ach.id === "perfect_form" && payload.averageFormScore >= 95) {
      qualifies = true;
    } else if (ach.id === "streak_3" && state.streakDays >= 3) {
      qualifies = true;
    } else if (ach.id === "century_club" && totalReps >= 100) {
      qualifies = true;
    } else if (ach.id === "full_body") {
      const allFive: ExerciseType[] = ["squat", "pushup", "lunge", "jumping-jacks", "plank"];
      const usedSet = new Set(payload.exercisesUsed);
      if (allFive.every((e) => usedSet.has(e))) {
        qualifies = true;
      }
    }

    if (qualifies) {
      newUnlocked.push({ ...ach, unlockedAt: nowIso });
    }
  }

  return newUnlocked;
}

export function recordWorkoutGamification(
  state: MotionGamificationState,
  payload: WorkoutGamificationPayload,
): MotionGamificationState {
  const nowIso = payload.now ?? new Date().toISOString();
  const today = nowIso.slice(0, 10);

  let streakDays = state.streakDays;
  if (state.lastActiveDate) {
    const lastDate = new Date(state.lastActiveDate);
    const currDate = new Date(today);
    const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / 86400000);
    if (diffDays === 1) {
      streakDays += 1;
    } else if (diffDays > 1) {
      streakDays = 1;
    }
  } else {
    streakDays = 1;
  }

  const xpBreakdown = calculateWorkoutXp({
    completedSets: payload.completedSets,
    totalReps: payload.totalReps,
    averageFormScore: payload.averageFormScore,
    streakDays,
  });

  const nextXp = state.xp + xpBreakdown.totalXp;
  const { level, title } = getLevelAndTitle(nextXp);

  const updatedState: MotionGamificationState = {
    ...state,
    streakDays,
    lastActiveDate: today,
    lifetimeWorkouts: state.lifetimeWorkouts + 1,
    lifetimeReps: state.lifetimeReps + payload.totalReps,
  };

  const unlockedAchievements = evaluateAchievements(updatedState, payload, nowIso);

  return {
    ...updatedState,
    xp: nextXp,
    level,
    title,
    unlockedAchievements,
  };
}
