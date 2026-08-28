import { describe, expect, it } from "vitest";

import {
  CAREER_XP_FOR_FULL_STAT,
  MONTHLY_FLOOR_ORE,
  MONTHLY_FREEDOM_ORE,
  SOLO_ACTION_KINDS,
  SOLO_ACTION_RULES,
  buildSoloSummary,
  levelFromXp,
  soloActionRule,
  soloHealthStat,
  soloStreak,
  xpToReachLevel,
  type SoloAction,
  type SoloActionKind,
  type SoloHealthDay,
} from "@/lib/solo";

const TODAY = "2026-08-28";
const THIS_WEEK = "2026-08-24";
const LAST_WEEK = "2026-08-17";
const TWO_WEEKS = "2026-08-10";
const THREE_WEEKS = "2026-08-03";
const FOUR_WEEKS = "2026-07-27";
const FIVE_WEEKS = "2026-07-20";

let sequence = 0;

function action(
  kind: SoloActionKind,
  occurredOn: string,
  amountOre: number | null = null,
): SoloAction {
  sequence += 1;
  return {
    id: `action-${sequence}`,
    kind,
    occurredOn,
    evidence: "Bevis",
    amountOre,
    xp: soloActionRule(kind).xp,
    createdAt: `${occurredOn}T18:00:00.000Z`,
  };
}

/** `count` outward actions inside the week that starts on `weekStart`. */
function week(weekStart: string, count: number): SoloAction[] {
  return Array.from({ length: count }, () =>
    action("outreach_sent", weekStart),
  );
}

function healthDay(
  date: string,
  overrides: Partial<SoloHealthDay> = {},
): SoloHealthDay {
  return {
    date,
    sleepHours: null,
    workouts: 0,
    weightKg: null,
    energy: null,
    dietHeld: null,
    note: null,
    ...overrides,
  };
}

function days(count: number, overrides: Partial<SoloHealthDay> = {}): SoloHealthDay[] {
  return Array.from({ length: count }, (_unused, index) =>
    healthDay(`2026-08-${String(28 - index).padStart(2, "0")}`, overrides),
  );
}

describe("the experience rules", () => {
  it("only rewards actions that have left the computer", () => {
    // Locked deliberately. Adding a kind for building, reading or planning
    // turns the ledger back into the thing it exists to break.
    expect(SOLO_ACTION_KINDS).toEqual([
      "made_visible",
      "shown_to_someone",
      "question_asked",
      "outreach_sent",
      "application_sent",
      "portfolio_published",
      "interview_held",
      "proposal_sent",
      "offer_received",
      "invoice_sent",
      "payment_received",
    ]);
  });

  it("fixes experience per kind so a weak week cannot be revalued", () => {
    for (const rule of SOLO_ACTION_RULES) {
      expect(rule.xp).toBeGreaterThan(0);
      expect(soloActionRule(rule.kind)).toBe(rule);
    }
  });

  it("requires an amount only where money actually changed hands", () => {
    expect(soloActionRule("payment_received").amount).toBe("required");
    expect(soloActionRule("application_sent").amount).toBe("none");
  });

  it("rejects an unknown kind rather than silently scoring zero", () => {
    expect(() => soloActionRule("code_written" as SoloActionKind)).toThrow();
  });
});

describe("the level curve", () => {
  it("costs more for each level", () => {
    expect(xpToReachLevel(1)).toBe(0);
    expect(xpToReachLevel(2)).toBe(100);
    expect(xpToReachLevel(3)).toBe(250);
    expect(xpToReachLevel(4)).toBe(450);
    expect(xpToReachLevel(10)).toBe(2_700);
  });

  it("lands exactly on the boundaries the curve defines", () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, into: 0, span: 100 });
    expect(levelFromXp(99)).toMatchObject({ level: 1, into: 99 });
    expect(levelFromXp(100)).toMatchObject({ level: 2, into: 0, span: 150 });
    expect(levelFromXp(249)).toMatchObject({ level: 2, into: 149 });
    expect(levelFromXp(250)).toMatchObject({ level: 3, into: 0 });
    expect(levelFromXp(2_699)).toMatchObject({ level: 9 });
    expect(levelFromXp(2_700)).toMatchObject({ level: 10, into: 0 });
  });

  it("never reports a level below one", () => {
    expect(levelFromXp(-500)).toMatchObject({ level: 1, into: 0 });
  });
});

describe("the weekly streak", () => {
  it("counts a week that has already met the quota", () => {
    expect(soloStreak(week(THIS_WEEK, 3), TODAY)).toMatchObject({
      weeks: 1,
      actionsThisWeek: 3,
    });
  });

  it("does not break a streak because the current week is still running", () => {
    const actions = [
      ...week(THIS_WEEK, 1),
      ...week(LAST_WEEK, 3),
      ...week(TWO_WEEKS, 3),
    ];
    expect(soloStreak(actions, TODAY)).toMatchObject({
      weeks: 2,
      actionsThisWeek: 1,
    });
  });

  it("forgives one missed week when the three before it held", () => {
    const actions = [
      ...week(THIS_WEEK, 3),
      // Last week missed.
      ...week(TWO_WEEKS, 3),
      ...week(THREE_WEEKS, 3),
      ...week(FOUR_WEEKS, 3),
    ];
    expect(soloStreak(actions, TODAY)).toMatchObject({
      weeks: 4,
      shieldUsed: true,
    });
  });

  it("does not forgive a miss that has no earned shield behind it", () => {
    const actions = [...week(THIS_WEEK, 3), ...week(TWO_WEEKS, 3)];
    expect(soloStreak(actions, TODAY)).toMatchObject({
      weeks: 1,
      shieldUsed: false,
    });
  });

  it("spends the shield once and then lets the streak end", () => {
    const actions = [
      ...week(THIS_WEEK, 3),
      // Two separate misses, each with three good weeks behind it.
      ...week(TWO_WEEKS, 3),
      ...week(THREE_WEEKS, 3),
      ...week(FOUR_WEEKS, 3),
      // Five weeks back missed as well.
    ];
    const streak = soloStreak([...actions, ...week(FIVE_WEEKS, 0)], TODAY);
    expect(streak).toMatchObject({ weeks: 4, shieldUsed: true });
  });

  it("reports a loaded shield after three clean weeks", () => {
    const actions = [
      ...week(THIS_WEEK, 3),
      ...week(LAST_WEEK, 3),
      ...week(TWO_WEEKS, 3),
      ...week(THREE_WEEKS, 3),
    ];
    expect(soloStreak(actions, TODAY)).toMatchObject({
      weeks: 4,
      shieldReady: true,
      shieldUsed: false,
    });
  });
});

describe("the health stat", () => {
  it("stays unknown rather than zero when too few days are logged", () => {
    expect(soloHealthStat(days(3, { sleepHours: 8 }), TODAY)).toBeNull();
  });

  it("scores sleep against the seven hour target", () => {
    expect(soloHealthStat(days(4, { sleepHours: 7 }), TODAY)).toBe(50);
    expect(soloHealthStat(days(4, { sleepHours: 4 }), TODAY)).toBe(0);
    expect(soloHealthStat(days(4, { sleepHours: 5.5 }), TODAY)).toBe(25);
  });

  it("averages only the measures that were actually logged", () => {
    // Sleep 100, workouts 0, energy 100, diet 100.
    const logged = days(4, {
      sleepHours: 7,
      workouts: 0,
      energy: 5,
      dietHeld: true,
    });
    expect(soloHealthStat(logged, TODAY)).toBe(75);
  });

  it("counts the share of days the halal diet held", () => {
    const logged = [
      healthDay("2026-08-28", { dietHeld: true }),
      healthDay("2026-08-27", { dietHeld: true }),
      healthDay("2026-08-26", { dietHeld: false }),
      healthDay("2026-08-25", { dietHeld: false }),
    ];
    // Workouts are always present, so the average is diet 50 with workouts 0.
    expect(soloHealthStat(logged, TODAY)).toBe(25);
  });

  it("ignores days that fell out of the two week window", () => {
    const stale = days(4, { sleepHours: 8 }).map((day, index) => ({
      ...day,
      date: `2026-08-${String(1 + index).padStart(2, "0")}`,
    }));
    expect(soloHealthStat(stale, TODAY)).toBeNull();
  });

  it("never lets weight move the score", () => {
    const light = days(4, { sleepHours: 7, weightKg: 80 });
    const heavy = days(4, { sleepHours: 7, weightKg: 110 });
    expect(soloHealthStat(light, TODAY)).toBe(soloHealthStat(heavy, TODAY));
  });
});

describe("the summary", () => {
  it("reports weight as a trend and not as a judgement", () => {
    const summary = buildSoloSummary({
      actions: [],
      healthDays: [
        healthDay("2026-08-28", { weightKg: 96.4 }),
        healthDay("2026-08-10", { weightKg: 98.9 }),
      ],
      today: TODAY,
    });
    expect(summary.weightKg).toBe(96.4);
    expect(summary.weightTrendKg).toBe(-2.5);
  });

  it("has no trend from a single weighing", () => {
    const summary = buildSoloSummary({
      actions: [],
      healthDays: [healthDay("2026-08-28", { weightKg: 96.4 })],
      today: TODAY,
    });
    expect(summary.weightKg).toBe(96.4);
    expect(summary.weightTrendKg).toBeNull();
  });

  it("counts only money actually received toward the boss", () => {
    const summary = buildSoloSummary({
      actions: [
        action("payment_received", "2026-08-20", 15_000_00),
        action("invoice_sent", "2026-08-26", 22_000_00),
        action("proposal_sent", "2026-08-27", 8_000_00),
      ],
      healthDays: [],
      today: TODAY,
    });
    expect(summary.incomeOre).toBe(15_000_00);
    expect(summary.pipelineOre).toBe(30_000_00);
    expect(summary.boss).toMatchObject({
      phase: 1,
      targetOre: MONTHLY_FLOOR_ORE,
      percent: 50,
    });
  });

  it("drops income that fell outside the thirty day window", () => {
    const summary = buildSoloSummary({
      actions: [action("payment_received", "2026-07-01", 40_000_00)],
      healthDays: [],
      today: TODAY,
    });
    expect(summary.incomeOre).toBe(0);
    expect(summary.stats.economy).toBe(0);
    // Experience is a lifetime total; the stat is what decays.
    expect(summary.totalXp).toBe(soloActionRule("payment_received").xp);
  });

  it("moves to the freedom phase once the floor is cleared", () => {
    const summary = buildSoloSummary({
      actions: [action("payment_received", "2026-08-20", 30_000_00)],
      healthDays: [],
      today: TODAY,
    });
    expect(summary.boss).toMatchObject({
      phase: 2,
      label: "Friheten",
      targetOre: MONTHLY_FREEDOM_ORE,
      percent: 60,
    });
  });

  it("fills the career stat from recent outward work only", () => {
    const five = Array.from({ length: 5 }, () =>
      action("interview_held", "2026-08-20"),
    );
    expect(five.reduce((sum, item) => sum + item.xp, 0)).toBe(
      CAREER_XP_FOR_FULL_STAT,
    );
    const summary = buildSoloSummary({
      actions: five,
      healthDays: [],
      today: TODAY,
    });
    expect(summary.stats.career).toBe(100);
  });
});
