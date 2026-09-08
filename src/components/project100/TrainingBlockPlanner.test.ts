import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrainingBlockPlanner } from "./TrainingBlockPlanner";

describe("TrainingBlockPlanner", () => {
  it("renders remaining Core 24 slots with a conservative no-equipment default", () => {
    const html = renderToStaticMarkup(createElement(TrainingBlockPlanner, {
      missionId: "mission-1",
      missionType: "lower",
      onSaved: async () => undefined,
      requirements: [
        { movementPattern: "knee_dominant", remainingSets: 3, targetSets: 3, targetReps: 12 },
        { movementPattern: "hip_dominant", remainingSets: 3, targetSets: 3, targetReps: 10 },
        { movementPattern: "unilateral_lower", remainingSets: 0, targetSets: 3, targetReps: 10 },
        { movementPattern: "calf_ankle", remainingSets: 3, targetSets: 3, targetReps: 15 },
      ],
    }));

    expect(html).toContain("Planera nästa träningsblock");
    expect(html).toContain("Knäböj");
    expect(html).toContain("Höftlyft");
    expect(html).toContain("Motion Lab");
    expect(html).toContain("Logga set");
    expect(html).not.toContain("Unilateralt benarbete");
    expect(html).not.toContain("Ryggsäcksbelastning");
  });
});
