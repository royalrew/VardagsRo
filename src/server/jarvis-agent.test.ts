import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const dependencies = vi.hoisted(() => ({
  loadDashboard: vi.fn(async () => ({
    events: [
      { id: "event-doc-1", title: "Tandläkartid", startsAt: "2026-09-15T10:00:00.000Z", documentId: "doc-1" },
    ],
    people: [{ id: "person-1", name: "Jimmy", aliases: ["Pappa"] }],
    tasks: [],
    documents: [
      {
        id: "doc-1",
        title: "Kallelse Folktandvården",
        filename: "kallelse.pdf",
        summary: "Årlig undersökning och tandhygienist den 15 september.",
        personId: "person-1",
        folderId: "folder-health",
        status: "confirmed" as const,
        uploadedAt: "2026-08-25T10:00:00.000Z",
        periodLabel: "2026",
        eventsCount: 1,
        tasksCount: 0,
      },
    ],
    folders: [
      { id: "folder-health", name: "🏥 Kallelser & Vård", parentId: null },
    ],
  })),
  saveManualTask: vi.fn(async (_actor, input) => ({
    id: "task-101",
    title: input.title,
    dueAt: input.dueAt,
  })),
  saveProject100JournalEntry: vi.fn(),
  loadProject100Journal: vi.fn(async () => ({ entries: [], totalEntries: 0, excludedCount: 0 })),
  loadProject100BodyJourney: vi.fn(async (_actor, filter) => ({
    today: filter?.to || "2026-08-31",
    from: filter?.from || "2026-08-01",
    to: filter?.to || "2026-08-31",
    entries: [{ measuredOn: filter?.to || "2026-08-31", note: null, measurements: [{ metric: "waist", label: null, unit: "cm" as const, value: 84 }] }],
    goal: { weightGoalKg: 100, startWeightKg: 78, heightCm: 182 },
    weightHistory: [{ measuredOn: "2026-08-20", value: 80.2 }],
  })),
  saveProject100BodyEntry: vi.fn(async () => ({ measuredOn: "2026-08-30", measurements: [], note: null })),
  loadProject100NutritionDay: vi.fn(async () => ({
    eaten: { proteinG: 115, carbsG: 200, fatG: 50, kcal: 1800 },
    target: { overrideGrams: null, lowGrams: 160, highGrams: 200 },
  })),
  logProject100Meal: vi.fn(async () => ({ id: "meal-101", title: "Proteinshake", proteinG: 35 })),
  createProject100TrainingSession: vi.fn(async (_actor, input) => ({
    id: "session-101",
    title: input.title,
    activityType: input.activityType,
    status: input.status,
    sessionDate: input.sessionDate,
  })),
  loadProject100TrainingSessions: vi.fn(async () => [
    {
      id: "session-planned-1",
      title: "Benpass",
      activityType: "strength_gym",
      status: "planned",
      sessionDate: "2026-08-30",
      exercises: [],
    },
  ]),
  updateProject100TrainingSession: vi.fn(async () => ({
    id: "session-planned-1",
    title: "Benpass",
    status: "completed",
  })),
  createProject100ContentProject: vi.fn(async () => ({ id: "proj-101", title: "Test" })),
  logJarvisCapabilityGap: vi.fn(async () => ({ id: "gap-101" })),
  handleMemoryTextIntent: vi.fn(async () => ({
    handled: true,
    replyText: '✅ Sparat under 🏢 Jobb:\n"Koden till inkontinensförrådet är 2214"',
    isStore: true,
    memoryId: "mem-101",
  })),
  openAIConfig: vi.fn(() => null), // Fallback mode in unit tests
}));

vi.mock("@/server/database", () => ({
  loadDashboard: dependencies.loadDashboard,
  saveManualTask: dependencies.saveManualTask,
}));
vi.mock("@/server/project100-journal", () => ({
  loadProject100Journal: dependencies.loadProject100Journal,
  saveProject100JournalEntry: dependencies.saveProject100JournalEntry,
}));
vi.mock("@/server/project100-body", () => ({
  loadProject100BodyJourney: dependencies.loadProject100BodyJourney,
  saveProject100BodyEntry: dependencies.saveProject100BodyEntry,
}));
vi.mock("@/server/project100-nutrition", () => ({
  loadProject100NutritionDay: dependencies.loadProject100NutritionDay,
  logProject100Meal: dependencies.logProject100Meal,
}));
vi.mock("@/server/project100-training", () => ({
  createProject100TrainingSession: dependencies.createProject100TrainingSession,
  loadProject100TrainingSessions: dependencies.loadProject100TrainingSessions,
  updateProject100TrainingSession: dependencies.updateProject100TrainingSession,
}));
vi.mock("@/server/project100-content", () => ({
  createProject100ContentProject: dependencies.createProject100ContentProject,
}));
vi.mock("@/server/jarvis-gaps", () => ({
  logJarvisCapabilityGap: dependencies.logJarvisCapabilityGap,
}));
vi.mock("@/server/project100-memory-assistant", () => ({
  handleMemoryTextIntent: dependencies.handleMemoryTextIntent,
}));
vi.mock("@/server/config", () => ({
  openAIConfig: dependencies.openAIConfig,
}));

import { processJarvisAgentMessage } from "@/server/jarvis-agent";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("jarvis-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks non-adult actors", async () => {
    await expect(
      processJarvisAgentMessage(CHILD, "Hej Jarvis!"),
    ).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
  });

  it("responds personally to greetings with time of day and caller name", async () => {
    const res = await processJarvisAgentMessage(TEST_ACTOR, "Hej Jarvis!", {
      personName: "Jimmy",
    });
    expect(res.text).toMatch(/(God morgon|Hej|God kväll|God natt) Jimmy!/);
    expect(res.text).toContain("Hur kan jag hjälpa dig?");
  });

  it("handles multi-action schedule check and task creation simultaneously", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Kan du kolla om jag jobbar kväll den 25e september och lägga in att jag vill boka en fin restaurang?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(dependencies.saveManualTask).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        title: "Boka en fin restaurang",
        dueAt: expect.stringContaining("2026-09-25"),
      }),
    );
    expect(res.executedActions).toContain("check_schedule");
    expect(res.executedActions).toContain("create_task");
    expect(res.text).toContain("25 september");
    expect(res.text).toContain("ledig");
    expect(res.text).toContain("Boka en fin restaurang");
  });

  it("handles memory commands", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Jobb - Koden till inkontinensförrådet är 2214",
    );
    expect(dependencies.handleMemoryTextIntent).toHaveBeenCalled();
    expect(res.executedActions).toContain("save_memory");
    expect(res.text).toContain("Sparat under 🏢 Jobb");
  });

  it("logs unhandled queries to capability gaps backlog", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "När ska bilen besiktigas?",
      { channel: "telegram", personName: "Jimmy" },
    );
    expect(dependencies.logJarvisCapabilityGap).toHaveBeenCalledWith(
      TEST_ACTOR,
      "När ska bilen besiktigas?",
      "telegram",
      expect.objectContaining({ detectedIntent: "unhandled_query" }),
    );
    expect(res.executedActions).toContain("log_missing_capability");
    expect(res.text).toContain("utvecklingslista");
  });

  it("handles weight micro-updates with atomic patch and merge", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "jag vägde mig nu och det var 80,5 kg",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadProject100BodyJourney).toHaveBeenCalled();
    expect(dependencies.saveProject100BodyEntry).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        measuredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        measurements: expect.arrayContaining([
          expect.objectContaining({ metric: "waist", value: 84 }),
          expect.objectContaining({ metric: "weight", value: 80.5, unit: "kg" }),
        ]),
      }),
    );
    expect(res.executedActions).toContain("log_body_measurement");
    expect(res.text).toContain("80.5 kg");
    expect(res.text).toContain("19.5 kg kvar till målet");
  });

  it("handles protein micro-updates and calculates daily progress", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Drack precis en proteinshake med 35g protein",
      { personName: "Jimmy" },
    );

    expect(dependencies.logProject100Meal).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        title: "Proteinshake",
        proteinG: 35,
        source: "manual",
      }),
    );
    expect(res.executedActions).toContain("log_quick_nutrition");
    expect(res.text).toContain("35g protein");
    expect(res.text).toContain("115g av ditt mål");
  });

  it("handles spontaneous workout micro-updates (running 5 km)", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Sprang 5 km på 28 min",
      { personName: "Jimmy" },
    );

    expect(dependencies.createProject100TrainingSession).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        title: "Löpning 5 km",
        activityType: "running",
        status: "completed",
        durationSeconds: 1680,
      }),
    );
    expect(res.executedActions).toContain("log_quick_workout");
    expect(res.text).toContain("Löpning 5 km");
  });

  it("searches uploaded documents for dentist appointments and summaries", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vad står det i kallelsen från tandläkaren?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalledWith(TEST_ACTOR);
    expect(res.executedActions).toContain("search_documents");
    expect(res.text).toContain("Folktandvården");
    expect(res.text).toContain("15 september");
  });

  it("handles morning briefing trigger ('God morgon Jarvis! Vad har vi idag?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "God morgon Jarvis! Vad har vi idag?",
      { personName: "Jimmy" },
    );

    expect(res.executedActions).toContain("get_daily_briefing");
    expect(res.text).toContain("morgonöversikt");
  });

  it("handles contextual reminder ('Påminn mig att jag skall storhandla på fredag efter jobbet')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Påminn mig att jag skall storhandla på fredag efter jobbet",
      { personName: "Jimmy" },
    );

    expect(dependencies.saveManualTask).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        title: "Storhandla",
      }),
    );
    expect(res.executedActions).toContain("create_task");
    expect(res.text).toContain("Storhandla");
    expect(res.text).toContain("fredag");
  });
});
