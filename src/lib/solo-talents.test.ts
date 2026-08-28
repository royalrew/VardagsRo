import { describe, expect, it } from "vitest";

import {
  buildSoloSummary,
  soloActionRule,
  type SoloAction,
  type SoloActionKind,
  type SoloHealthDay,
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

function context(actions: SoloAction[] = [], healthDays: SoloHealthDay[] = []) {
  const summary = buildSoloSummary({ actions, healthDays, today: TODAY });
  return {
    summary,
    nodes: buildSoloTalents({ actions, healthDays, summary, today: TODAY }),
  };
}

function tree(
  actions: SoloAction[] = [],
  healthDays: SoloHealthDay[] = [],
): SoloTalentNode[] {
  return context(actions, healthDays).nodes;
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
  const logged = Array.from({ length: 7 }, (_unused, index) => ({
    date: `2026-08-${String(28 - index).padStart(2, "0")}`,
    sleepHours: 7,
    workouts: 1,
    weightKg: null,
    energy: 4,
    dietHeld: true,
    note: null,
  }));

  it("needs seven logged days out of the last fourteen", () => {
    const nodes = tree([], logged);
    expect(node(nodes, "rhythm")).toMatchObject({
      state: "unlocked",
      progress: 7,
    });
    expect(node(nodes, "rested").state).toBe("unlocked");
    expect(node(nodes, "strong")).toMatchObject({
      state: "available",
      progress: 7,
      target: 24,
    });
  });

  it("does not count days that fell outside the window", () => {
    const stale = logged.map((day, index) => ({
      ...day,
      date: `2026-07-${String(10 + index).padStart(2, "0")}`,
    }));
    const nodes = tree([], stale);
    expect(node(nodes, "rhythm")).toMatchObject({
      state: "available",
      progress: 0,
    });
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
