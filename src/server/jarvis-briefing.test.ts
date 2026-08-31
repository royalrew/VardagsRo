import { describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";
import {
  generateEveningBriefing,
  generateMorningBriefing,
} from "@/server/jarvis-briefing";

const dependencies = vi.hoisted(() => ({
  loadDashboard: vi.fn(async () => ({
    events: [
      {
        id: "work-event-1",
        title: "Arbetspass Dag",
        startsAt: "2026-08-31T07:00:00.000Z",
        endsAt: "2026-08-31T16:00:00.000Z",
        allDay: false,
        category: "work" as const,
        personId: "person-nora",
      },
      {
        id: "school-event-1",
        title: "Idrottsdag",
        startsAt: "2026-08-31T09:00:00.000Z",
        endsAt: "2026-08-31T14:00:00.000Z",
        allDay: false,
        category: "school" as const,
        personId: "person-child",
      },
    ],
    people: [
      { id: "person-nora", name: "Jimmy", aliases: ["Pappa"] },
      { id: "person-hanni", name: "Hanni", aliases: ["Mamma"] },
      { id: "person-child", name: "Barnet", aliases: [] },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Packa idrottskläder och gympaskor",
        dueAt: "2026-08-31T08:00:00.000Z",
        completedAt: null,
        kind: "bring" as const,
      },
    ],
    documents: [],
    folders: [],
  })),
  loadProject100TrainingSessions: vi.fn(async () => [
    {
      id: "session-1",
      title: "Underkropp & Ben",
      activityType: "strength_home" as const,
      status: "planned" as "planned" | "in_progress" | "completed" | "skipped",
      sessionDate: "2026-08-31",
      durationSeconds: 3600,
    },
  ]),
  loadProject100NutritionDay: vi.fn(async () => ({
    eaten: { proteinG: 35, carbsG: 60, fatG: 15, kcal: 500 },
    target: { overrideGrams: null, lowGrams: 160, highGrams: 200 },
    batches: [
      {
        id: "batch-1",
        title: "Kyckling & rislådor",
        portionsLeft: 3,
        portionsTotal: 4,
      },
    ],
  })),
  loadProject100Journal: vi.fn(async () => ({
    entries: [],
    totalEntries: 0,
    excludedCount: 0,
  })),
}));

vi.mock("@/server/database", () => ({
  loadDashboard: dependencies.loadDashboard,
}));

vi.mock("@/server/project100-training", () => ({
  loadProject100TrainingSessions: dependencies.loadProject100TrainingSessions,
}));

vi.mock("@/server/project100-nutrition", () => ({
  loadProject100NutritionDay: dependencies.loadProject100NutritionDay,
}));

vi.mock("@/server/project100-journal", () => ({
  loadProject100Journal: dependencies.loadProject100Journal,
}));

describe("Jarvis Briefing Service", () => {
  describe("generateMorningBriefing", () => {
    it("generates structured morning briefing with work shift, school events, training window, protein and tasks", async () => {
      const briefing = await generateMorningBriefing(TEST_ACTOR, {
        date: "2026-08-31",
        callerName: "Jimmy",
      });

      expect(briefing.date).toBe("2026-08-31");
      expect(briefing.workShift?.type).toBe("day");
      expect(briefing.text).toContain("God morgon Jimmy");
      expect(briefing.text).toContain("Du (Jimmy) jobbar Arbetspass Dag");
      expect(briefing.text).toContain("Idrottsdag");
      expect(briefing.text).toContain("Underkropp & Ben");
      expect(briefing.text).toContain("160g protein");
      expect(briefing.text).toContain("Packa idrottskläder");
    });

    it("correctly indicates caller is free when only spouse has a work shift", async () => {
      dependencies.loadDashboard.mockResolvedValueOnce({
        events: [
          {
            id: "work-event-hanni",
            title: "Jobb",
            startsAt: "2026-08-31T14:00:00.000Z",
            endsAt: "2026-08-31T21:00:00.000Z",
            allDay: false,
            category: "work" as const,
            personId: "person-hanni",
          },
        ],
        people: [
          { id: "person-nora", name: "Jimmy", aliases: ["Pappa"] },
          { id: "person-hanni", name: "Hanni", aliases: ["Mamma"] },
        ],
        tasks: [],
        documents: [],
        folders: [],
      });

      const briefing = await generateMorningBriefing(TEST_ACTOR, {
        date: "2026-08-31",
        callerName: "Jimmy",
      });

      expect(briefing.workShift).toBeNull();
      expect(briefing.text).toContain("Du (Jimmy) är ledig idag!");
      expect(briefing.text).toContain("Hanni jobbar");
    });
  });

  describe("generateEveningBriefing", () => {
    it("generates structured evening debrief with training results, protein progress and journal status", async () => {
      // Simulate completed session and higher protein
      dependencies.loadProject100TrainingSessions.mockResolvedValueOnce([
        {
          id: "session-1",
          title: "Underkropp & Ben",
          activityType: "strength_home" as const,
          status: "completed" as const,
          sessionDate: "2026-08-31",
          durationSeconds: 3600,
        },
      ]);
      dependencies.loadProject100NutritionDay.mockResolvedValueOnce({
        eaten: { proteinG: 145, carbsG: 200, fatG: 50, kcal: 1850 },
        target: { overrideGrams: null, lowGrams: 160, highGrams: 200 },
        batches: [],
      });

      const briefing = await generateEveningBriefing(TEST_ACTOR, {
        date: "2026-08-31",
        callerName: "Jimmy",
      });

      expect(briefing.date).toBe("2026-08-31");
      expect(briefing.completedSessionsCount).toBe(1);
      expect(briefing.proteinRemainingG).toBe(15);
      expect(briefing.text).toContain("God kväll Jimmy");
      expect(briefing.text).toContain("Underkropp & Ben");
      expect(briefing.text).toContain("145g");
      expect(briefing.text).toContain("15g kvar");
    });
  });
});
