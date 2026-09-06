import { describe, expect, it } from "vitest";

import {
  buildSoloSummary,
  soloActionRule,
  type SoloAction,
  type SoloActionKind,
  type SoloHealthDay,
  type SoloSettings,
} from "@/lib/solo";
import {
  SOLO_TALENTS,
  buildSoloQuests,
  buildSoloTalents,
  unlockedTalentCount,
  type SoloTalentNode,
} from "@/lib/solo-talents";

const TODAY = "2026-08-28";

let sequence = 0;

function action(
  kind: SoloActionKind,
  occurredOn = "2026-08-26",
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

const NO_GOAL: SoloSettings = { weightGoalKg: null };

function context(
  actions: SoloAction[] = [],
  healthDays: SoloHealthDay[] = [],
  settings: SoloSettings = NO_GOAL,
) {
  const summary = buildSoloSummary({ actions, healthDays, today: TODAY });
  return {
    summary,
    nodes: buildSoloTalents({
      actions,
      healthDays,
      settings,
      summary,
      today: TODAY,
    }),
  };
}

function tree(
  actions: SoloAction[] = [],
  healthDays: SoloHealthDay[] = [],
  settings: SoloSettings = NO_GOAL,
): SoloTalentNode[] {
  return context(actions, healthDays, settings).nodes;
}

/** `count` days back from today, each one overridden the same way. */
function healthDays(
  count: number,
  overrides: Partial<SoloHealthDay> = {},
  startOffset = 0,
): SoloHealthDay[] {
  return Array.from({ length: count }, (_unused, index) => ({
    date: dayBack(index + startOffset),
    sleepHours: null,
    workouts: 0,
    weightKg: null,
    energy: null,
    dietHeld: null,
    mobility: null,
    note: null,
    ...overrides,
  }));
}

function dayBack(days: number): string {
  const base = Date.UTC(2026, 7, 28) - days * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

function node(nodes: SoloTalentNode[], id: string): SoloTalentNode {
  const found = nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Noden ${id} saknas`);
  return found;
}

describe("the shape of the tree", () => {
  it("has unique node ids", () => {
    const ids = SOLO_TALENTS.map((talent) => talent.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only ever requires a node that exists in the same branch", () => {
    const byId = new Map(SOLO_TALENTS.map((talent) => [talent.id, talent]));
    for (const talent of SOLO_TALENTS) {
      if (talent.requires === null) continue;
      const parent = byId.get(talent.requires);
      expect(parent, `${talent.id} kräver ${talent.requires}`).toBeDefined();
      expect(parent?.branch).toBe(talent.branch);
      expect(parent?.tier).toBeLessThan(talent.tier);
    }
  });

  it("gives every branch a root that needs nothing first", () => {
    for (const branch of ["visibility", "own_feet", "endurance"] as const) {
      const roots = SOLO_TALENTS.filter(
        (talent) => talent.branch === branch && talent.requires === null,
      );
      expect(roots.length).toBeGreaterThan(0);
    }
  });

  it("opens the career branch with something nobody can refuse", () => {
    // The first rung must not need courage, a reply, or anyone's permission.
    // Contacting a stranger sits four rungs up for a reason.
    const first = SOLO_TALENTS.find(
      (talent) => talent.branch === "visibility" && talent.tier === 1,
    );
    expect(first?.id).toBe("visible");
    const contact = SOLO_TALENTS.find(
      (talent) => talent.id === "first_contact",
    );
    expect(contact?.tier).toBeGreaterThan(3);
  });
});

describe("opening a node", () => {
  it("starts with nothing unlocked and only the roots reachable", () => {
    const nodes = tree();
    expect(unlockedTalentCount(nodes)).toBe(0);
    expect(node(nodes, "visible").state).toBe("available");
    expect(node(nodes, "reach").state).toBe("available");
    expect(node(nodes, "rhythm").state).toBe("available");
    expect(node(nodes, "case_published").state).toBe("locked");
    expect(node(nodes, "freedom").state).toBe("locked");
  });

  it("opens the first rung from a single public link", () => {
    const nodes = tree([action("made_visible")]);
    expect(node(nodes, "visible")).toMatchObject({
      state: "unlocked",
      progress: 1,
    });
    expect(node(nodes, "case_published").state).toBe("available");
  });

  it("walks the courage ladder one rung at a time", () => {
    const nodes = tree([
      action("made_visible"),
      action("portfolio_published"),
      action("shown_to_someone"),
    ]);
    expect(node(nodes, "shown").state).toBe("unlocked");
    expect(node(nodes, "asked").state).toBe("available");
    // Contacting someone about work is still two rungs away.
    expect(node(nodes, "first_contact").state).toBe("locked");
  });

  it("shows partial progress on a node that is still shut", () => {
    const nodes = tree([
      action("outreach_sent"),
      action("application_sent"),
      action("application_sent"),
    ]);
    expect(node(nodes, "applicant")).toMatchObject({
      progress: 2,
      target: 3,
    });
  });

  it("lets reality outrank the map when a rung is skipped", () => {
    // An interview that arrived without the rungs below it still happened.
    const nodes = tree([action("interview_held")]);
    expect(node(nodes, "in_the_room").state).toBe("unlocked");
    expect(node(nodes, "applicant").state).toBe("locked");
    expect(node(nodes, "wanted").state).toBe("available");
  });

  it("counts the same outreach toward both branches that need it", () => {
    const nodes = tree(
      Array.from({ length: 5 }, () => action("outreach_sent")),
    );
    expect(node(nodes, "reach")).toMatchObject({
      state: "unlocked",
      progress: 5,
    });
    expect(node(nodes, "first_contact").state).toBe("unlocked");
  });
});

describe("the two ways of being visible", () => {
  const opened = [action("made_visible"), action("portfolio_published")];

  it("forks into reaching out and being found", () => {
    const nodes = tree(opened);
    expect(node(nodes, "shown").state).toBe("available");
    expect(node(nodes, "profile").state).toBe("available");
  });

  it("wants a second public place before the inbound path opens", () => {
    expect(node(tree(opened), "profile")).toMatchObject({
      progress: 1,
      target: 2,
    });
    const nodes = tree([...opened, action("made_visible")]);
    expect(node(nodes, "profile").state).toBe("unlocked");
    expect(node(nodes, "voice").state).toBe("available");
  });

  it("rewards repetition rather than one perfect post", () => {
    const posting = Array.from({ length: 4 }, () =>
      action("portfolio_published", "2026-08-20"),
    );
    expect(node(tree([...opened, ...posting]), "voice")).toMatchObject({
      state: "unlocked",
      progress: 5,
    });
  });

  it("forgets publishing that fell outside the thirty day window", () => {
    const old = Array.from({ length: 4 }, () =>
      action("portfolio_published", "2026-06-01"),
    );
    // Reach decays. Four posts last spring is not a voice today.
    expect(node(tree([...opened, ...old]), "voice").progress).toBe(1);
  });

  it("cannot open the inbound node without someone else moving first", () => {
    const loud = [
      ...opened,
      ...Array.from({ length: 8 }, () =>
        action("portfolio_published", "2026-08-20"),
      ),
      action("outreach_sent"),
      action("application_sent"),
    ];
    expect(node(tree(loud), "recognised")).toMatchObject({
      state: "available",
      progress: 0,
    });

    const answered = [...loud, action("inbound_received")];
    expect(node(tree(answered), "recognised").state).toBe("unlocked");
  });

  it("pays the inbound kind more than anything you can do alone", () => {
    const alone = ["outreach_sent", "application_sent", "portfolio_published"];
    for (const kind of alone) {
      expect(soloActionRule("inbound_received").xp).toBeGreaterThan(
        soloActionRule(kind as SoloActionKind).xp,
      );
    }
  });
});

describe("the money nodes", () => {
  it("keeps the floor shut below thirty thousand", () => {
    const nodes = tree([action("payment_received", "2026-08-20", 29_999_00)]);
    expect(node(nodes, "floor")).toMatchObject({
      state: "available",
      progress: 29_999_00,
      unit: "ore",
    });
    expect(node(nodes, "first_krona").state).toBe("unlocked");
  });

  it("opens the floor exactly at the target", () => {
    const nodes = tree([action("payment_received", "2026-08-20", 30_000_00)]);
    expect(node(nodes, "floor").state).toBe("unlocked");
    expect(node(nodes, "freedom").state).toBe("available");
  });

  it("closes the floor again when the money falls out of the window", () => {
    // Thirty days without income is not freedom, and the tree has to say so.
    const nodes = tree([action("payment_received", "2026-06-01", 60_000_00)]);
    expect(node(nodes, "floor").state).toBe("available");
    expect(node(nodes, "floor").progress).toBe(0);
    expect(node(nodes, "first_krona").state).toBe("unlocked");
  });
});

describe("the endurance branch", () => {
  it("opens on logging alone, not on performance", () => {
    const nodes = tree([], healthDays(7, { sleepHours: 7 }));
    expect(node(nodes, "rhythm")).toMatchObject({
      state: "unlocked",
      progress: 7,
    });
    expect(node(nodes, "moving").state).toBe("available");
  });

  it("counts every session the same, however short", () => {
    // Fifteen minutes on the mat is a session. So is a walk. The failure this
    // guards against is "tiden räcker inte till", not a lack of ambition.
    const nodes = tree([], healthDays(8, { workouts: 1 }));
    expect(node(nodes, "moving")).toMatchObject({
      state: "unlocked",
      progress: 8,
      target: 8,
    });
  });

  it("counts sessions over thirty days rather than per week", () => {
    // Eight sessions clustered in one good week still opens the node: no two
    // weeks look alike on a shift schedule.
    const nodes = tree([], healthDays(4, { workouts: 2 }));
    expect(node(nodes, "moving").progress).toBe(8);
  });

  it("counts nights of sleep instead of an average", () => {
    const mixed = [
      ...healthDays(7, { sleepHours: 7 }),
      ...healthDays(7, { sleepHours: 3 }, 7),
    ];
    // A single broken night must not erase two good weeks.
    expect(node(tree([], mixed), "sleeping")).toMatchObject({
      state: "unlocked",
      progress: 7,
    });
    expect(
      node(tree([], healthDays(14, { sleepHours: 6 })), "sleeping").progress,
    ).toBe(0);
  });

  it("tracks the evenings there was anything left", () => {
    const nodes = tree([], healthDays(7, { energy: 3 }));
    expect(node(nodes, "energy_kept")).toMatchObject({
      state: "unlocked",
      progress: 7,
    });
    expect(
      node(tree([], healthDays(7, { energy: 2 })), "energy_kept").progress,
    ).toBe(0);
  });

  it("keeps the comeback shut while training never stopped", () => {
    const nodes = tree([], healthDays(10, { workouts: 1 }));
    expect(node(nodes, "moving").state).toBe("unlocked");
    expect(node(nodes, "comeback")).toMatchObject({
      state: "available",
      progress: 0,
    });
  });

  it("rewards coming back after a break of a week or more", () => {
    // The only node that cannot be earned without first falling off.
    const withGap = [
      ...healthDays(4, { workouts: 1 }),
      ...healthDays(8, { workouts: 1 }, 14),
    ];
    expect(node(tree([], withGap), "comeback")).toMatchObject({
      state: "unlocked",
      progress: 1,
    });
  });

  it("counts back care apart from training", () => {
    const nodes = tree([], healthDays(10, { workouts: 1, mobility: true }));
    expect(node(nodes, "back_care")).toMatchObject({
      state: "unlocked",
      progress: 10,
    });
    // A day of training with no mobility work does not count toward the back.
    expect(
      node(tree([], healthDays(10, { workouts: 1 })), "back_care").progress,
    ).toBe(0);
  });

  it("stays shut on weight until a goal has been set", () => {
    const weighed = [
      ...healthDays(1, { weightKg: 96 }),
      ...healthDays(1, { weightKg: 99 }, 20),
    ];
    expect(node(tree([], weighed), "direction").progress).toBe(0);
  });

  it("opens when the distance to the goal has shrunk", () => {
    const losing = [
      ...healthDays(1, { weightKg: 96 }),
      ...healthDays(1, { weightKg: 99 }, 20),
    ];
    const goal: SoloSettings = { weightGoalKg: 90 };
    expect(node(tree([], losing, goal), "direction")).toMatchObject({
      state: "unlocked",
      progress: 1,
    });
  });

  it("reads the same when the goal is to gain", () => {
    const gaining = [
      ...healthDays(1, { weightKg: 72 }),
      ...healthDays(1, { weightKg: 69 }, 20),
    ];
    const goal: SoloSettings = { weightGoalKg: 78 };
    expect(node(tree([], gaining, goal), "direction").progress).toBe(1);
  });

  it("does not punish a scale that stood still", () => {
    // Logged enough days for the branch root to be open, so the node is
    // genuinely reachable and its shut state says something about the weight
    // rather than about the logging.
    const flat = [
      ...healthDays(1, { weightKg: 96 }),
      ...healthDays(6, {}, 1),
      ...healthDays(1, { weightKg: 96 }, 20),
    ];
    const goal: SoloSettings = { weightGoalKg: 90 };
    const nodes = tree([], flat, goal);
    expect(node(nodes, "rhythm").state).toBe("unlocked");
    expect(node(nodes, "direction")).toMatchObject({
      state: "available",
      progress: 0,
    });
  });

  it("measures a quarter with the gaps included", () => {
    const spread = [
      ...healthDays(12, { workouts: 1 }),
      ...healthDays(12, { workouts: 1 }, 60),
    ];
    expect(node(tree([], spread), "durable")).toMatchObject({ progress: 24 });
  });
});

describe("what to do next", () => {
  it("asks a beginner for the smallest possible thing", () => {
    const { nodes, summary } = context();
    const quests = buildSoloQuests(nodes, summary);

    expect(quests[0]).toMatchObject({
      id: "next-visible",
      title: "Gör en profil eller ett repo publikt",
    });
    // Never day one. That was the step that felt like a wall.
    expect(quests.some((quest) => quest.title.includes("ansökning"))).toBe(
      false,
    );
  });

  it("moves to the next rung as soon as the last one opens", () => {
    const { nodes, summary } = context([action("made_visible")]);
    const quests = buildSoloQuests(nodes, summary);
    expect(quests[0]).toMatchObject({ id: "next-case_published" });
  });

  it("offers a health step and the week alongside the career step", () => {
    const { nodes, summary } = context();
    const quests = buildSoloQuests(nodes, summary);

    expect(quests).toHaveLength(3);
    expect(quests.map((quest) => quest.id)).toEqual([
      "next-visible",
      "next-rhythm",
      "weekly-quota",
    ]);
  });

  it("stops asking for the week once the quota is met", () => {
    const { nodes, summary } = context([
      action("made_visible", "2026-08-24"),
      action("shown_to_someone", "2026-08-25"),
      action("question_asked", "2026-08-26"),
    ]);
    const quests = buildSoloQuests(nodes, summary);
    expect(quests.map((quest) => quest.id)).not.toContain("weekly-quota");
  });

  it("never offers more than three steps at once", () => {
    const { nodes, summary } = context();
    expect(buildSoloQuests(nodes, summary).length).toBeLessThanOrEqual(3);
  });
});
