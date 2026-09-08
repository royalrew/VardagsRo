import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { assessProject100TrainingStimulus } from "@/lib/project100-training-stimulus";
import { TrainingStimulusPanel } from "./TrainingStimulusPanel";

describe("TrainingStimulusPanel", () => {
  it("shows evidence and uncertainty separately from plan coverage", () => {
    const assessment = assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [{
        movementPattern: "horizontal_push",
        purpose: "strength_hypertrophy",
        reps: 12,
        weightKg: null,
        durationSeconds: null,
        rpe: 8,
        observationLevel: "rep_counting",
        romConfidence: 0.76,
      }],
      priorWeeklySets: { horizontal_push: 2 },
    });
    const html = renderToStaticMarkup(createElement(TrainingStimulusPanel, { assessment }));

    expect(html).toContain("Muskelbyggande stimulans");
    expect(html).toContain("Separat från plantäckning");
    expect(html).toContain("12 reps");
    expect(html).toContain("RPE 8");
    expect(html).toContain("ROM-confidence 76%");
    expect(html).toContain("2 tidigare veckoset");
    expect(html).toContain("inte en garanti");
  });
});
