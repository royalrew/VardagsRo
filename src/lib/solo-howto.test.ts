import { describe, expect, it } from "vitest";

import { SOLO_TALENT_HOWTO } from "@/lib/solo-howto";
import { SOLO_TALENTS, buildSoloTalents } from "@/lib/solo-talents";
import { buildSoloSummary } from "@/lib/solo";

describe("the practical guide", () => {
  it("covers every node in the tree", () => {
    // A node that says what is required and never what to do is a scoreboard
    // entry, not a step. Shipping one without a guide should fail here.
    for (const talent of SOLO_TALENTS) {
      const steps = SOLO_TALENT_HOWTO[talent.id];
      expect(steps, `${talent.id} saknar vägledning`).toBeDefined();
      expect(steps.length, talent.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("guides nothing that is not in the tree", () => {
    const ids = new Set(SOLO_TALENTS.map((talent) => talent.id));
    for (const id of Object.keys(SOLO_TALENT_HOWTO)) {
      expect(ids.has(id), `${id} finns inte som nod`).toBe(true);
    }
  });

  it("says something concrete in every step", () => {
    for (const [id, steps] of Object.entries(SOLO_TALENT_HOWTO)) {
      for (const step of steps) {
        expect(step.trim().length, id).toBeGreaterThan(25);
        // A finished sentence, not a fragment. A question mark ends one too.
        expect(step.trim(), `${id}: ${step}`).toMatch(/[.?!]$/);
      }
    }
  });

  it("reaches the browser attached to the node", () => {
    const summary = buildSoloSummary({
      actions: [],
      healthDays: [],
      today: "2026-08-28",
    });
    const nodes = buildSoloTalents({
      actions: [],
      healthDays: [],
      settings: { weightGoalKg: null },
      summary,
      today: "2026-08-28",
    });
    for (const node of nodes) {
      expect(node.how.length, node.id).toBeGreaterThanOrEqual(2);
    }
  });
});
