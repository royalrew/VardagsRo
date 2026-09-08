import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MotionMissionSyncPanel } from "./MotionMissionSyncPanel";

describe("MotionMissionSyncPanel", () => {
  it("shows the measured set and its one-time sync action", () => {
    const html = renderToStaticMarkup(createElement(MotionMissionSyncPanel, {
      launch: {
        missionId: "mission-1",
        familyId: "pushup",
        variationId: "pushup",
        exerciseId: "pushup",
        exerciseName: "Armhävning",
        movementPattern: "horizontal_push",
        environment: "home",
        targetReps: 10,
        targetDurationSeconds: null,
        weightKg: null,
        backpackCarryPosition: null,
      },
      activeExerciseId: "pushup",
      measuredReps: 8,
      measuredHoldSeconds: 0,
      trackingEnabled: true,
      cameraSetupProfile: null,
      onSetSaved: () => undefined,
    }));

    expect(html).toContain("Dagens uppdrag · exakt en gång");
    expect(html).toContain("8 / 10 reps");
    expect(html).toContain("Avsluta och spara set");
  });
});
