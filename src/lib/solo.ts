import {
  addCalendarDateDays,
  calendarDateDifference,
  startOfCalendarWeek,
} from "@/lib/dates";

/**
 * Solo mode is one adult's own progress toward leaving a job, kept separate
 * from the household's shared data.
 *
 * The whole design rests on a single rule: experience is only ever granted for
 * something that has left this computer and that another human could see. There
 * is deliberately no action kind for building this system, reading, planning or
 * researching. A ledger that rewards preparation measures enthusiasm; this one
 * measures reach.
 */

export type SoloTrack = "career" | "economy";

export type SoloActionKind =
  | "made_visible"
  | "shown_to_someone"
  | "question_asked"
  | "outreach_sent"
  | "application_sent"
  | "portfolio_published"
  | "interview_held"
  | "proposal_sent"
  | "offer_received"
  | "invoice_sent"
  | "payment_received";

export interface SoloActionRule {
  kind: SoloActionKind;
  track: SoloTrack;
  label: string;
  /** What the evidence field has to be able to show. */
  evidenceHint: string;
  xp: number;
  amount: "required" | "optional" | "none";
}

/**
 * Experience is fixed per kind rather than chosen when logging, so a bad week
 * cannot be rewritten into a good one by inflating what the same act was worth.
 */
export const SOLO_ACTION_RULES: readonly SoloActionRule[] = [
  // The first three exist because the ladder used to start at "contact a
  // stranger", which is not a first step for someone who has never sold
  // anything. These leave the computer and are checkable, but none of them
  // requires anyone to answer, so none of them can be refused.
  {
    kind: "made_visible",
    track: "career",
    label: "Gjort dig synlig",
    evidenceHint: "Länken som är publik nu och inte var det i går",
    xp: 20,
    amount: "none",
  },
  {
    kind: "shown_to_someone",
    track: "career",
    label: "Visat för någon du känner",
    evidenceHint: "Vem du visade det för",
    xp: 25,
    amount: "none",
  },
  {
    kind: "question_asked",
    track: "career",
    label: "Ställt en fråga",
    evidenceHint: "Vem du frågade och vad du undrade",
    xp: 35,
    amount: "none",
  },
  {
    kind: "outreach_sent",
    track: "career",
    label: "Kontaktat någon",
    evidenceHint: "Vem, var: mejl, DM eller samtal som gick iväg",
    xp: 30,
    amount: "none",
  },
  {
    kind: "application_sent",
    track: "career",
    label: "Skickat ansökan",
    evidenceHint: "Tjänst och företag, gärna länk till annonsen",
    xp: 50,
    amount: "none",
  },
  {
    kind: "portfolio_published",
    track: "career",
    label: "Publicerat något",
    evidenceHint: "Publik länk: repo, inlägg, demo eller artikel",
    xp: 75,
    amount: "none",
  },
  {
    kind: "interview_held",
    track: "career",
    label: "Genomfört intervju",
    evidenceHint: "Företag och datum för samtalet",
    xp: 150,
    amount: "none",
  },
  {
    kind: "proposal_sent",
    track: "economy",
    label: "Skickat offert",
    evidenceHint: "Mottagare och vad offerten gäller",
    xp: 120,
    amount: "optional",
  },
  {
    kind: "offer_received",
    track: "career",
    label: "Fått erbjudande",
    evidenceHint: "Företag och vad de erbjuder",
    xp: 400,
    amount: "optional",
  },
  {
    kind: "invoice_sent",
    track: "economy",
    label: "Skickat faktura",
    evidenceHint: "Kund och fakturanummer",
    xp: 200,
    amount: "optional",
  },
  {
    kind: "payment_received",
    track: "economy",
    label: "Fått betalt",
    evidenceHint: "Kund och vad betalningen avser",
    xp: 300,
    amount: "required",
  },
] as const;

const RULES_BY_KIND = new Map<SoloActionKind, SoloActionRule>(
  SOLO_ACTION_RULES.map((rule) => [rule.kind, rule]),
);

export const SOLO_ACTION_KINDS = SOLO_ACTION_RULES.map((rule) => rule.kind);

export function soloActionRule(kind: SoloActionKind): SoloActionRule {
  const rule = RULES_BY_KIND.get(kind);
  if (!rule) throw new Error(`Okänd handling: ${kind}`);
  return rule;
}

/**
 * Named on purpose. These are the activities that feel like progress and are
 * the reason a decade of experience has produced no income, so the interface
 * says out loud that they are worth nothing here.
 */
export const SOLO_ZERO_XP_ACTIVITIES: readonly string[] = [
  "Bygga vidare på Vardagsro",
  "Läsa dokumentation eller titta på tutorials",
  "Planera, skissa eller välja teknik",
  "Uppdatera CV utan att skicka det",
  "Starta ett nytt sidoprojekt",
] as const;

export interface SoloAction {
  id: string;
  kind: SoloActionKind;
  /** Calendar date in the household timezone, as YYYY-MM-DD. */
  occurredOn: string;
  evidence: string;
  amountOre: number | null;
  xp: number;
  createdAt: string;
}

export interface SoloHealthDay {
  /** Calendar date in the household timezone, as YYYY-MM-DD. */
  date: string;
  sleepHours: number | null;
  workouts: number;
  weightKg: number | null;
  /** Self-rated energy in the evening, 1 to 5. */
  energy: number | null;
  /** Whether the day's eating held. Halal: no pork, ever. */
  dietHeld: boolean | null;
  note: string | null;
}

/** Ören, so money never passes through a float. */
export const MONTHLY_FLOOR_ORE = 30_000_00;

/**
 * Taking out the same 30 000 kr from your own company costs employer fees,
 * holiday, pension and empty weeks. Phase two is what the invoicing has to
 * reach for the freedom to be real rather than nominal.
 */
export const MONTHLY_FREEDOM_ORE = 50_000_00;

export const INCOME_WINDOW_DAYS = 30;
export const CAREER_WINDOW_DAYS = 30;
export const HEALTH_WINDOW_DAYS = 14;
export const WEIGHT_WINDOW_DAYS = 30;

/** Outward actions per week that keep the streak alive. */
export const WEEKLY_QUOTA = 3;

/** Career experience within the window that counts as a full career stat. */
export const CAREER_XP_FOR_FULL_STAT = 750;

const SLEEP_FLOOR_HOURS = 4;
const SLEEP_TARGET_HOURS = 7;
const WEEKLY_WORKOUT_TARGET = 3;
const MIN_HEALTH_DAYS_FOR_STAT = 4;

const BASE_LEVEL_COST = 100;
const LEVEL_COST_STEP = 50;

/**
 * Total experience needed to stand at `level`. Closed form of the rising cost
 * 100, 150, 200, ... so the curve stays cheap to evaluate at any level.
 */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return (
    BASE_LEVEL_COST * (level - 1) +
    (LEVEL_COST_STEP * (level - 1) * (level - 2)) / 2
  );
}

export interface SoloLevel {
  level: number;
  /** Experience earned inside the current level. */
  into: number;
  /** Experience the current level costs in total. */
  span: number;
  /** Total experience at which the next level begins. */
  nextLevelAt: number;
}

/**
 * Inverts the curve directly and then corrects, because the square root can
 * land a hair below an exact level boundary and quietly cost a level.
 */
export function levelFromXp(totalXp: number): SoloLevel {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = Math.max(
    1,
    Math.floor((-1 + Math.sqrt(9 + (4 * xp) / (LEVEL_COST_STEP / 2))) / 2),
  );
  while (xpToReachLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpToReachLevel(level) > xp) level -= 1;

  const start = xpToReachLevel(level);
  const nextLevelAt = xpToReachLevel(level + 1);
  return {
    level,
    into: xp - start,
    span: nextLevelAt - start,
    nextLevelAt,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function withinDays(
  occurredOn: string,
  today: string,
  days: number,
): boolean {
  const age = calendarDateDifference(occurredOn, today);
  return age >= 0 && age < days;
}

export interface SoloStats {
  career: number;
  economy: number;
  /** Null while too few days are logged to say anything honest. */
  health: number | null;
}

export interface SoloStreak {
  weeks: number;
  quota: number;
  actionsThisWeek: number;
  shieldUsed: boolean;
  shieldReady: boolean;
}

export interface SoloBoss {
  phase: 1 | 2;
  label: string;
  description: string;
  targetOre: number;
  incomeOre: number;
  percent: number;
}

export interface SoloQuest {
  id: string;
  title: string;
  detail: string;
}

export interface SoloSummary {
  totalXp: number;
  level: SoloLevel;
  stats: SoloStats;
  streak: SoloStreak;
  boss: SoloBoss;
  /** Received, last 30 days. */
  incomeOre: number;
  /** Sent but not yet paid: proposals and invoices, last 30 days. */
  pipelineOre: number;
  weightKg: number | null;
  weightTrendKg: number | null;
  actionsInWindow: number;
}

function weekCounts(actions: readonly SoloAction[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const action of actions) {
    const week = startOfCalendarWeek(action.occurredOn);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}

/**
 * Weeks, never days. Shift work and five children make a daily streak a machine
 * for producing failure, and a streak that punishes an ordinary bad week is
 * abandoned before it can do any good.
 *
 * One missed week is forgiven if the three before it all held, and only once
 * per streak. The current week is never counted as missed while it is still
 * running.
 */
export function soloStreak(
  actions: readonly SoloAction[],
  today: string,
): SoloStreak {
  const counts = weekCounts(actions);
  const currentWeek = startOfCalendarWeek(today);
  const met = (weeksBack: number): boolean =>
    (counts.get(addCalendarDateDays(currentWeek, -7 * weeksBack)) ?? 0) >=
    WEEKLY_QUOTA;

  let weeks = met(0) ? 1 : 0;
  let shieldUsed = false;
  for (let index = 1; index < 260; index += 1) {
    if (met(index)) {
      weeks += 1;
      continue;
    }
    if (!shieldUsed && met(index + 1) && met(index + 2) && met(index + 3)) {
      shieldUsed = true;
      continue;
    }
    break;
  }

  return {
    weeks,
    quota: WEEKLY_QUOTA,
    actionsThisWeek: counts.get(currentWeek) ?? 0,
    shieldUsed,
    shieldReady: !shieldUsed && met(1) && met(2) && met(3),
  };
}

function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Health is scored from the last two weeks only, so the number describes how
 * you are living now rather than how you once lived. Weight is deliberately
 * absent from the score and reported as a trend instead: a single number moving
 * the wrong way for good reasons should not cost you a stat.
 */
export function soloHealthStat(
  days: readonly SoloHealthDay[],
  today: string,
): number | null {
  const window = days.filter((day) =>
    withinDays(day.date, today, HEALTH_WINDOW_DAYS),
  );
  if (window.length < MIN_HEALTH_DAYS_FOR_STAT) return null;

  const sleep = averageOf(
    window
      .filter((day) => day.sleepHours !== null)
      .map((day) =>
        clampPercent(
          (((day.sleepHours as number) - SLEEP_FLOOR_HOURS) /
            (SLEEP_TARGET_HOURS - SLEEP_FLOOR_HOURS)) *
            100,
        ),
      ),
  );

  const workoutTarget = (WEEKLY_WORKOUT_TARGET * HEALTH_WINDOW_DAYS) / 7;
  const workouts = clampPercent(
    (window.reduce((total, day) => total + day.workouts, 0) / workoutTarget) *
      100,
  );

  const energy = averageOf(
    window
      .filter((day) => day.energy !== null)
      .map((day) => (((day.energy as number) - 1) / 4) * 100),
  );

  const dietDays = window.filter((day) => day.dietHeld !== null);
  const diet =
    dietDays.length === 0
      ? null
      : (dietDays.filter((day) => day.dietHeld === true).length /
          dietDays.length) *
        100;

  const scores = [sleep, workouts, energy, diet].filter(
    (score): score is number => score !== null,
  );
  if (scores.length === 0) return null;
  return clampPercent(averageOf(scores) as number);
}

function weightTrend(
  days: readonly SoloHealthDay[],
  today: string,
): { latest: number | null; trend: number | null } {
  const weighed = days
    .filter(
      (day) =>
        day.weightKg !== null &&
        withinDays(day.date, today, WEIGHT_WINDOW_DAYS),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  if (weighed.length === 0) return { latest: null, trend: null };

  const latest = weighed[weighed.length - 1].weightKg as number;
  if (weighed.length === 1) return { latest, trend: null };
  const first = weighed[0].weightKg as number;
  return { latest, trend: Math.round((latest - first) * 10) / 10 };
}

/**
 * The single place that turns a ledger into a scoreboard. Pure and total: the
 * same rows on the same day always produce the same summary, so nothing here
 * can drift, and no model is ever allowed to talk a number upward.
 */
export function buildSoloSummary(input: {
  actions: readonly SoloAction[];
  healthDays: readonly SoloHealthDay[];
  today: string;
}): SoloSummary {
  const { actions, healthDays, today } = input;

  const totalXp = actions.reduce((total, action) => total + action.xp, 0);

  const careerXp = actions
    .filter(
      (action) =>
        soloActionRule(action.kind).track === "career" &&
        withinDays(action.occurredOn, today, CAREER_WINDOW_DAYS),
    )
    .reduce((total, action) => total + action.xp, 0);

  const inIncomeWindow = actions.filter((action) =>
    withinDays(action.occurredOn, today, INCOME_WINDOW_DAYS),
  );
  const incomeOre = inIncomeWindow
    .filter((action) => action.kind === "payment_received")
    .reduce((total, action) => total + (action.amountOre ?? 0), 0);
  const pipelineOre = inIncomeWindow
    .filter(
      (action) =>
        action.kind === "proposal_sent" || action.kind === "invoice_sent",
    )
    .reduce((total, action) => total + (action.amountOre ?? 0), 0);

  const phase: 1 | 2 = incomeOre >= MONTHLY_FLOOR_ORE ? 2 : 1;
  const targetOre = phase === 1 ? MONTHLY_FLOOR_ORE : MONTHLY_FREEDOM_ORE;
  const streak = soloStreak(actions, today);
  const weight = weightTrend(healthDays, today);

  return {
    totalXp,
    level: levelFromXp(totalXp),
    stats: {
      career: clampPercent((careerXp / CAREER_XP_FOR_FULL_STAT) * 100),
      economy: clampPercent((incomeOre / MONTHLY_FLOOR_ORE) * 100),
      health: soloHealthStat(healthDays, today),
    },
    streak,
    boss: {
      phase,
      label: phase === 1 ? "Golvet" : "Friheten",
      description:
        phase === 1
          ? "30 000 kr på en månad utanför hemvården. Då kan du sluta."
          : "50 000 kr fakturerat på en månad. Då bär det egna arbetet lön, semester och pension.",
      targetOre,
      incomeOre,
      percent: clampPercent((incomeOre / targetOre) * 100),
    },
    incomeOre,
    pipelineOre,
    weightKg: weight.latest,
    weightTrendKg: weight.trend,
    actionsInWindow: inIncomeWindow.length,
  };
}
