import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkoutMemorySnapshot } from "@/lib/project100-workout-memory";
import { ActiveWorkoutRunner } from "../ActiveWorkoutRunner";

const mockSnapshot: WorkoutMemorySnapshot = {
  type: "session",
  startedAtMs: Date.now() - 60_000,
  updatedAtMs: Date.now(),
  templateId: "onboarding-strength",
  title: "Onboarding – Bas & Rörlighet",
  activityType: "strength_home",
  sessionDate: "2026-09-09",
  durationMinutes: "",
  location: "Hemma",
  effort: "",
  bodyBefore: "",
  bodyAfter: "",
  notes: "",
  exercises: [
    {
      id: "ex-1",
      name: "Handstående mot vägg",
      notes: "Stabil bål",
      sets: [
        {
          id: "s1-1",
          done: false,
          reps: "",
          weightKg: "",
          durationMinutes: "",
          durationSeconds: "20",
          distanceKm: "",
          rpe: "",
        },
        {
          id: "s1-2",
          done: false,
          reps: "",
          weightKg: "",
          durationMinutes: "",
          durationSeconds: "20",
          distanceKm: "",
          rpe: "",
        },
      ],
    },
    {
      id: "ex-2",
      name: "Armhävningar",
      notes: "",
      sets: [
        {
          id: "s2-1",
          done: false,
          reps: "8",
          weightKg: "",
          durationMinutes: "",
          durationSeconds: "",
          distanceKm: "",
          rpe: "",
        },
      ],
    },
  ],
};

describe("ActiveWorkoutRunner", () => {
  it("starts at set 1 with 0% progress and displays seconds cleanly without 0 minuter", () => {
    const html = renderToStaticMarkup(
      createElement(ActiveWorkoutRunner, {
        snapshot: mockSnapshot,
        onUpdateSnapshot: () => undefined,
        onPause: () => undefined,
        onFinish: async () => undefined,
        onClose: () => undefined,
      }),
    );

    // Title and structure
    expect(html).toContain("Onboarding – Bas &amp; Rörlighet");
    expect(html).toContain("Handstående mot vägg");
    expect(html).toContain("Set 1 av 2");

    // Hold target must display "20 sek", NEVER "0 min"
    expect(html).toContain("20 sek");
    expect(html).not.toContain("0 min");

    // Progress counter
    expect(html).toContain("0 av 3 set klara");
    expect(html).toContain("Börja med Handstående mot vägg");

    // Primary action button
    expect(html).toContain("Markera set klart");
  });

  it("resumes at the first uncompleted set when earlier sets are marked done", () => {
    const resumedSnapshot: WorkoutMemorySnapshot = {
      ...mockSnapshot,
      exercises: [
        {
          ...mockSnapshot.exercises[0],
          sets: [
            {
              ...mockSnapshot.exercises[0].sets[0],
              done: true,
              actualDurationSeconds: "20",
            },
            {
              ...mockSnapshot.exercises[0].sets[1],
              done: false,
            },
          ],
        },
        mockSnapshot.exercises[1],
      ],
    };

    const html = renderToStaticMarkup(
      createElement(ActiveWorkoutRunner, {
        snapshot: resumedSnapshot,
        onUpdateSnapshot: () => undefined,
        onPause: () => undefined,
        onFinish: async () => undefined,
        onClose: () => undefined,
      }),
    );

    // Resumed runner should be at Set 2
    expect(html).toContain("Set 2 av 2");
    expect(html).toContain("1 av 3 set klara");
    expect(html).toContain("Handstående mot vägg nästa");
  });

  it("navigates to summary when all sets are completed", () => {
    const allDoneSnapshot: WorkoutMemorySnapshot = {
      ...mockSnapshot,
      exercises: mockSnapshot.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({ ...s, done: true })),
      })),
    };

    const html = renderToStaticMarkup(
      createElement(ActiveWorkoutRunner, {
        snapshot: allDoneSnapshot,
        onUpdateSnapshot: () => undefined,
        onPause: () => undefined,
        onFinish: async () => undefined,
        onClose: () => undefined,
      }),
    );

    // Summary view should be active
    expect(html).toContain("Sammanfattning av utfört arbete");
    expect(html).toContain("3 av 3");
    expect(html).toContain("Spara till träningsloggen");
  });
});
