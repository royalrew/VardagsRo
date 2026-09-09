import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrainingBlockPlanner } from "./TrainingBlockPlanner";

describe("TrainingBlockPlanner", () => {
  it.each(["upper", "lower"] as const)("offers cycling before a new %s mission without requiring a camera", (missionType) => {
    const html = renderToStaticMarkup(createElement(TrainingBlockPlanner, {
      missionId: "mission-upper",
      missionType,
      onSaved: async () => undefined,
      requirements: [
        { movementPattern: "horizontal_push", remainingSets: 3, targetSets: 3, targetReps: 10 },
        { movementPattern: "horizontal_pull", remainingSets: 3, targetSets: 3, targetReps: 10 },
        { movementPattern: "vertical_push", remainingSets: 3, targetSets: 3, targetReps: 10 },
        { movementPattern: "vertical_pull", remainingSets: 3, targetSets: 3, targetReps: 10 },
      ],
    }));

    expect(html).toContain("Lugn spinning");
    expect(html).toContain("exercise=cycling");
    expect(html).toContain("camera=auto");
    expect(html).toContain("warmupMission=mission-upper");
    expect(html).toContain("Starta spinning med kamera");
    expect(html).toContain("Cykla utan kamera");
    expect(html).toContain("Jag är redan uppvärmd");
    expect(html).not.toContain('id="p100-next-training-step-title"');
  });

  it("renders remaining Core 24 slots with a conservative no-equipment default", () => {
    const html = renderToStaticMarkup(createElement(TrainingBlockPlanner, {
      missionId: "mission-1",
      missionType: "lower",
      onSaved: async () => undefined,
      requirements: [
        { movementPattern: "knee_dominant", remainingSets: 2, targetSets: 3, targetReps: 12 },
        { movementPattern: "hip_dominant", remainingSets: 3, targetSets: 3, targetReps: 10 },
        { movementPattern: "unilateral_lower", remainingSets: 0, targetSets: 3, targetReps: 10 },
        { movementPattern: "calf_ankle", remainingSets: 3, targetSets: 3, targetReps: 15 },
      ],
    }));

    expect(html).toContain("Nästa steg");
    expect(html).toContain("Steg 2 · Styrka");
    expect(html).toContain("Set 2 av 3");
    expect(html).not.toContain("Starta spinning med kamera");
    expect(html).toContain("Starta med kamera");
    expect(html).toContain("Visa hela planen och andra alternativ");
    expect(html).toContain("Knäböj");
    expect(html).toContain("Höftlyft");
    expect(html).toContain("Motion Lab");
    expect(html).toContain("Logga set");
    expect(html).not.toContain("Unilateralt benarbete");
    expect(html).not.toContain("Ryggsäcksbelastning");
  });
});
