import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/server/authorization-types";
import { TEST_ACTOR } from "../../test/actor-fixture";

const dependencies = vi.hoisted(() => {
  const todayStr = new Date().toISOString().slice(0, 10);

  return {
    loadProject100TrainingSessions: vi.fn(async () => [
      {
        id: "session-today-planned",
        title: "Överkropp",
        activityType: "strength_home" as const,
        status: "planned" as const,
        sessionDate: todayStr,
        sourceTemplateId: "tpl-upper",
        plannedStartAt: null,
        plannedEndAt: null,
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        location: null,
        effort: null,
        bodyBefore: null,
        bodyAfter: null,
        notes: null,
        exercises: [
          {
            exerciseId: "ex-1",
            name: "Armhävningar",
            notes: null,
            sets: [
              {
                id: "set-1",
                position: 0,
                completed: false,
                target: { reps: 10, weightKg: 0, durationSeconds: null, distanceMeters: null, rpe: 7 },
                actual: null,
              },
            ],
          },
          {
            exerciseId: "ex-2",
            name: "Pull-ups",
            notes: null,
            sets: [
              {
                id: "set-2",
                position: 0,
                completed: false,
                target: { reps: 5, weightKg: 0, durationSeconds: null, distanceMeters: null, rpe: 8 },
                actual: null,
              },
            ],
          },
        ],
      },
      {
        id: "session-past-run",
        title: "Löpning 5 km",
        activityType: "running" as const,
        status: "completed" as const,
        sessionDate: "2026-08-20",
        sourceTemplateId: null,
        plannedStartAt: null,
        plannedEndAt: null,
        startedAt: null,
        endedAt: null,
        durationSeconds: 1680, // 28:00
        location: null,
        effort: 8,
        bodyBefore: null,
        bodyAfter: null,
        notes: null,
        exercises: [
          {
            exerciseId: "ex-run",
            name: "Löpning",
            notes: null,
            sets: [
              {
                id: "set-run-1",
                position: 0,
                completed: true,
                target: null,
                actual: { reps: null, weightKg: null, durationSeconds: 1680, distanceMeters: 5000, rpe: 8 },
              },
            ],
          },
        ],
      },
    ]),
    createProject100TrainingSession: vi.fn(async (_actor, input) => ({
      id: "session-created-1",
      title: input.title,
      activityType: input.activityType,
      status: input.status,
      sessionDate: input.sessionDate,
      durationSeconds: input.durationSeconds,
      effort: input.effort,
      notes: input.notes,
      exercises: input.exercises,
    })),
    updateProject100TrainingSession: vi.fn(async (_actor, id, input) => ({
      id,
      title: "Överkropp",
      activityType: "strength_home" as const,
      status: "completed" as const,
      sessionDate: input.sessionDate,
    })),
    loadProject100NutritionDay: vi.fn(async () => ({
      today: todayStr,
      target: { overrideGrams: 160, lowGrams: 150, highGrams: 180 },
      loggedProteinGrams: 70,
      targetProteinGrams: 160,
      meals: [],
    })),
    logProject100Meal: vi.fn(async () => ({
      id: "meal-1",
      title: "Proteinshake",
      proteinGrams: 35,
      dayTotalProteinG: 105,
      targetProteinG: 160,
      remainingG: 55,
    })),
    loadDashboard: vi.fn(async () => ({
      events: [],
      people: [
        { id: "person-1", name: "Jimmy", aliases: ["Pappa"], personType: "adult" },
      ],
      tasks: [],
      documents: [],
      folders: [],
    })),
  };
});

vi.mock("@/server/project100-training", () => ({
  loadProject100TrainingSessions: dependencies.loadProject100TrainingSessions,
  createProject100TrainingSession: dependencies.createProject100TrainingSession,
  updateProject100TrainingSession: dependencies.updateProject100TrainingSession,
  loadProject100TrainingTemplates: vi.fn(async () => []),
}));

vi.mock("@/server/project100-nutrition", () => ({
  loadProject100NutritionDay: dependencies.loadProject100NutritionDay,
  logProject100Meal: dependencies.logProject100Meal,
}));

vi.mock("@/server/database", () => ({
  loadDashboard: dependencies.loadDashboard,
  readyClient: vi.fn(async () => vi.fn()),
  saveManualTask: vi.fn(),
  saveManualEvent: vi.fn(),
  updateManualTask: vi.fn(),
  updateManualEvent: vi.fn(),
  removeTask: vi.fn(),
  removeEvent: vi.fn(),
}));

vi.mock("@/server/config", () => ({
  openAIConfig: () => null,
}));

import { processJarvisAgentMessage } from "@/server/jarvis-agent";

describe("Jarvis Training & Conversational Interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 'Vad ska jag träna idag?' with today's planned session and exercise list", async () => {
    const result = await processJarvisAgentMessage(TEST_ACTOR, "Vad ska jag träna idag?");

    expect(result.text).toContain("Överkropp");
    expect(result.executedActions).toContain("get_training_status");
  });

  it("answers 'Hur ligger jag till i mina benchmarks?' with PB and levels", async () => {
    const result = await processJarvisAgentMessage(TEST_ACTOR, "Hur ligger jag till i mina benchmarks?");

    expect(result.text).toContain("5 km Löpning");
    expect(result.text).toContain("28:00");
    expect(result.text).toContain("Armhävningar");
    expect(result.executedActions).toContain("check_benchmarks");
  });

  it("logs spontaneous running when saying 'Sprang 5.1 km på 29 minuter'", async () => {
    const result = await processJarvisAgentMessage(TEST_ACTOR, "Sprang 5.1 km på 29 minuter");

    expect(result.text).toContain("5.1 km");
    expect(result.text).toContain("29 min");
    expect(dependencies.createProject100TrainingSession).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        title: "Löpning 5.1 km",
        activityType: "running",
        status: "completed",
        durationSeconds: 1740,
        exercises: [
          expect.objectContaining({
            name: "Löpning",
            sets: [
              expect.objectContaining({
                distanceMeters: 5100,
                durationSeconds: 1740,
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("logs spontaneous strength when saying 'Gjorde 30 armhävningar'", async () => {
    const result = await processJarvisAgentMessage(TEST_ACTOR, "Gjorde 30 armhävningar");

    expect(result.text).toContain("30 armhävningar");
    expect(dependencies.createProject100TrainingSession).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        title: "Hemmapass Armhävningar",
        activityType: "strength_home",
        status: "completed",
        exercises: [
          expect.objectContaining({
            name: "Armhävningar",
            sets: [
              expect.objectContaining({
                reps: 30,
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("logs protein nutrition when saying 'Tog en proteinshake på 35g protein'", async () => {
    const result = await processJarvisAgentMessage(TEST_ACTOR, "Tog en proteinshake på 35g protein");

    expect(result.text).toContain("35g protein");
    expect(dependencies.logProject100Meal).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        proteinG: 35,
        title: "Proteinshake",
      }),
    );
  });
});
