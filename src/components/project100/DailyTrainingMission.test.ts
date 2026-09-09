import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { assessProject100TrainingStimulus } from "@/lib/project100-training-stimulus";
import { DailyTrainingMission, type DailyMissionView } from "./DailyTrainingMission";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function mission(status: DailyMissionView["status"]): DailyMissionView {
  return {
    id: "mission-1",
    title: "Överkropp",
    missionType: "upper",
    status,
    sessionDate: "2026-09-09",
    durationSeconds: 0,
    coverage: {
      percentage: 0,
      completedTargetSets: 0,
      targetSets: 3,
      requirements: [{
        movementPattern: "horizontal_push",
        label: "Press",
        targetSets: 3,
        targetReps: 10,
        completedSets: 0,
        remainingSets: 3,
      }],
    },
    stimulus: assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [],
      priorWeeklySets: {},
    }),
    dataGaps: [],
    blocks: [],
  };
}

describe("DailyTrainingMission", () => {
  it("lets an open pass be abandoned or restarted", () => {
    const html = renderToStaticMarkup(createElement(DailyTrainingMission, {
      today: "2026-09-09",
      initialMission: mission("in_progress"),
    }));
    expect(html).toContain("Avbryt eller börja om");
    expect(html).toContain("Avsluta passet");
  });

  it("lets a completed choice be cleared for a new pass", () => {
    const html = renderToStaticMarkup(createElement(DailyTrainingMission, {
      today: "2026-09-09",
      initialMission: mission("completed"),
    }));
    expect(html).toContain("Börja om eller välj nytt pass");
  });
});
