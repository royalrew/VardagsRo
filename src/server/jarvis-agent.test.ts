import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/server/authorization-types";
import { TEST_ACTOR } from "../../test/actor-fixture";

const dependencies = vi.hoisted(() => ({
  loadDashboard: vi.fn(async () => ({
    events: [
      { id: "event-doc-1", title: "Tandläkartid", startsAt: "2026-09-15T10:00:00.000Z", documentId: "doc-1" },
      { id: "event-work-jimmy-today", title: "Jobb", startsAt: "2026-09-01T05:00:00.000Z", endsAt: "2026-09-01T14:00:00.000Z", personId: "person-1", category: "work" },
      { id: "event-work-hanni-today", title: "Jobb", startsAt: "2026-09-01T12:00:00.000Z", endsAt: "2026-09-01T19:15:00.000Z", personId: "person-hanni", category: "work" },
      { id: "event-work-jimmy-tomorrow", title: "Jobb", startsAt: "2026-09-02T05:00:00.000Z", endsAt: "2026-09-02T14:00:00.000Z", personId: "person-1", category: "work" },
      { id: "event-work-hanni-tomorrow", title: "Jobb", startsAt: "2026-09-02T12:00:00.000Z", endsAt: "2026-09-02T19:15:00.000Z", personId: "person-hanni", category: "work" },
    ],
    people: [
      { id: "person-1", name: "Jimmy", aliases: ["Pappa"], personType: "adult" },
      { id: "person-hanni", name: "Hanni", aliases: ["Mamma"], personType: "adult" },
      { id: "person-alma", name: "Alma", aliases: ["Lillasyster"], personType: "child" },
      { id: "person-shureym", name: "Shureym", aliases: ["Mellanbror"], personType: "child" },
      { id: "person-cuzeyr", name: "Cuzeyr", aliases: ["Storebror"], personType: "child" },
    ],
    tasks: [
      {
        id: "task-alma-1",
        personId: "person-alma",
        title: "Dammsuga lilla vardagsrummet",
        completedAt: null,
      },
      {
        id: "task-cuzeyr-1",
        personId: "person-cuzeyr",
        title: "Torka köksbänkar",
        completedAt: "2026-09-01T15:00:00.000Z",
      },
    ],
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
  saveManualEvent: vi.fn(async (_actor, input) => ({
    id: "event-101",
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    category: input.category,
  })),
  updateManualTask: vi.fn(async (_actor, id, input) => ({
    id,
    title: input.title || "Uppgift",
    dueAt: input.dueAt,
    completedAt: input.completedAt,
  })),
  updateManualEvent: vi.fn(async (_actor, id, input) => ({
    id,
    title: input.title || "Händelse",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  })),
  removeTask: vi.fn(async () => true),
  removeEvent: vi.fn(async () => true),
  readyClient: vi.fn(async () => vi.fn()),
  deleteProject100Memory: vi.fn(async () => true),
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
    meals: [{ id: "m-1", title: "Keso & bär", proteinG: 30, carbsG: 20, fatG: 5, kcal: 240 }],
    batches: [{ id: "b-1", name: "Köttfärssås", portionsLeft: 3 }],
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
      sessionDate: new Date().toISOString().slice(0, 10),
      exercises: [{ id: "ex-1", exerciseId: "e-1", name: "Knäböj", position: 0, notes: null, sets: [] }],
    },
  ]),
  loadProject100TrainingTemplates: vi.fn(async () => [
    {
      id: "tmpl-1",
      name: "Överkropp A",
      activityType: "strength_home",
      description: "Bröst och rygg",
      createdAt: "2026-08-26T18:00:00.000Z",
      exercises: [{ id: "ex-1", exerciseId: "e-1", name: "Armhävningar", position: 0, notes: null, sets: [] }],
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
  saveManualEvent: dependencies.saveManualEvent,
  updateManualTask: dependencies.updateManualTask,
  updateManualEvent: dependencies.updateManualEvent,
  removeTask: dependencies.removeTask,
  removeEvent: dependencies.removeEvent,
  readyClient: dependencies.readyClient,
}));
vi.mock("@/server/project100-jarvis", () => ({
  deleteProject100Memory: dependencies.deleteProject100Memory,
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
  loadProject100TrainingTemplates: dependencies.loadProject100TrainingTemplates,
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

  it("handles short morning brief phrasings ('Morgonbrief' and 'Vad händer idag?')", async () => {
    const res1 = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Morgonbrief",
      { personName: "Jimmy" },
    );
    expect(res1.executedActions).toContain("get_daily_briefing");

    const res2 = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vad händer idag?",
      { personName: "Jimmy" },
    );
    expect(res2.executedActions).toContain("get_daily_briefing");
  });

  it("handles evening briefing triggers ('Kvällsbrief' and 'Kvällsavstämning')", async () => {
    const res1 = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Kvällsbrief",
      { personName: "Jimmy" },
    );
    expect(res1.executedActions).toContain("get_daily_briefing");

    const res2 = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Kvällsavstämning",
      { personName: "Jimmy" },
    );
    expect(res2.executedActions).toContain("get_daily_briefing");
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

  it("handles daily training check ('🏋️‍♂️ Dagens Träning' / 'Vad ska jag träna idag?')", async () => {
    const jimmyActor: ActorContext = {
      ...TEST_ACTOR,
      personId: "person-1",
    };

    const res = await processJarvisAgentMessage(
      jimmyActor,
      "🏋️‍♂️ Dagens Träning",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadProject100TrainingSessions).toHaveBeenCalled();
    expect(res.executedActions).toContain("get_training_status");
    expect(res.text).toContain("Benpass");
    expect(res.text).toContain("07:00–16:00");
    expect(res.text).not.toContain("14:00–21:15");
    expect(res.text).not.toContain("05:00");
  });

  it("handles nutrition and protein check ('🥩 Protein & Mat')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "🥩 Protein & Mat",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadProject100NutritionDay).toHaveBeenCalled();
    expect(res.executedActions).toContain("get_nutrition_status");
    expect(res.text).toContain("Dagens Kost & Protein");
    expect(res.text).toContain("115g");
  });

  it("handles family schedule check ('📅 Familjens Schema')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "📅 Familjens Schema",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
  });

  it("handles kids chores query ('Vem städar vad?' / 'Barnens städområden')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vem städar vad?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.text).toContain("Lilla vardagsrummet");
    expect(res.text).toContain("Stora vardagsrummet");
    expect(res.text).toContain("Köket");
  });

  it("handles question if kids are finished with their chores ('Är barnen färdiga med sina ansvarsområden?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Är barnen färdiga med sina ansvarsområden?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_kids_chores_status");
    expect(res.text).toContain("Alma");
    expect(res.text).toContain("Cuzeyr");
    expect(res.text).toContain("Shureym");
  });

  it("handles single child chore question ('Är Alma klar med sitt städområde?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Är Alma klar med sitt städområde?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_kids_chores_status");
    expect(res.text).toContain("Alma");
    expect(res.text).toContain("Lilla vardagsrummet");
  });

  it("blocks child / viewer from accessing adult memory notes", async () => {
    const childActor: ActorContext = {
      ...TEST_ACTOR,
      role: "viewer",
      personId: "person-cuzeyr",
    };

    const res = await processJarvisAgentMessage(
      childActor,
      "Minne: vad är koden?",
      { personName: "Cuzeyr" },
    );

    expect(res.executedActions).not.toContain("search_memory");
    expect(res.executedActions).not.toContain("save_memory");
  });

  it("handles start time query ('När börjar jag imorgon?')", async () => {
    const jimmyActor: ActorContext = {
      ...TEST_ACTOR,
      personId: "person-1",
    };

    const res = await processJarvisAgentMessage(
      jimmyActor,
      "När börjar jag imorgon?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
    expect(res.text).toContain("Imorgon börjar du kl. 07:00 och jobbar till kl. 16:00");
  });

  it("handles work shift query ('När jobbar jag imorgon?')", async () => {
    const jimmyActor: ActorContext = {
      ...TEST_ACTOR,
      personId: "person-1",
    };

    const res = await processJarvisAgentMessage(
      jimmyActor,
      "När jobbar jag imorgon?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
    expect(res.text).toContain("Imorgon jobbar du 07:00–16:00");
  });

  it("handles end time query ('När slutar jag imorgon?')", async () => {
    const jimmyActor: ActorContext = {
      ...TEST_ACTOR,
      personId: "person-1",
    };

    const res = await processJarvisAgentMessage(
      jimmyActor,
      "När slutar jag imorgon?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
    expect(res.text).toContain("Imorgon slutar du kl. 16:00");
  });

  it("handles other family member work shift query ('När börjar Hanni imorgon?')", async () => {
    const jimmyActor: ActorContext = {
      ...TEST_ACTOR,
      personId: "person-1",
    };

    const res = await processJarvisAgentMessage(
      jimmyActor,
      "När börjar Hanni imorgon?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
    expect(res.text).toContain("Imorgon börjar Hanni kl. 14:00 och jobbar till kl. 21:15");
  });

  it("handles conversational greeting ('Hej')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Hej",
      { personName: "Jimmy" },
    );

    expect(res.text).toContain("Hur kan jag hjälpa dig?");
  });

  it("handles status check ('Hur är läget?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Hur är läget?",
      { personName: "Jimmy" },
    );

    expect(res.text).toContain("Bara bra tack");
  });

  it("handles polite gratitude ('Tack!')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Tack så mycket!",
      { personName: "Jimmy" },
    );

    expect(res.text).toContain("Det var så lite så");
  });

  it("handles capability guide ('Vem är du?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vem är du?",
      { personName: "Jimmy" },
    );

    expect(res.text).toContain("Jag är Jarvis");
    expect(res.text).toContain("Schema & Arbetstider");
    expect(res.text).toContain("Projekt 100 Träning");
  });

  it("handles daily activity planning ('Vad ska vi göra idag?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vad ska vi göra idag?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
    expect(res.text).toContain("dagens översikt och plan");
  });

  it("handles dinner and meal inspiration ('Vad ska vi äta idag?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vad ska vi äta idag?",
      { personName: "Jimmy" },
    );

    expect(res.executedActions).toContain("get_nutrition_status");
    expect(res.text).toContain("middagsförslag");
  });

  it("handles weekend overview ('Vad händer i helgen?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vad händer i helgen?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("check_schedule");
    expect(res.text).toContain("överblick för helgen");
    expect(res.text).toContain("Lördag");
    expect(res.text).toContain("Söndag");
  });

  it("handles historical day queries ('Vad gjorde jag den 1a september?')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Vad gjorde jag den 1a september?",
      { personName: "Jimmy" },
    );

    expect(dependencies.loadDashboard).toHaveBeenCalled();
    expect(res.executedActions).toContain("get_day_history");
    expect(res.text).toContain("Sammanfattning för 2026-09-01");
    expect(res.text).toContain("Arbetspass");
    expect(res.text).toContain("Kost & Protein");
  });

  it("handles adding calendar events ('Lägg till kalas på söndag kl 14:00')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Lägg till kalas på söndag kl 14:00",
      { personName: "Jimmy" },
    );

    expect(dependencies.saveManualEvent).toHaveBeenCalled();
    expect(res.executedActions).toContain("create_event");
    expect(res.text).toContain("Kalenderhändelse skapad");
    expect(res.text).toContain("kalas");
  });

  it("handles updating tasks/reminders ('Ändra påminnelsen om att handla till på lördag')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Ändra Torka köksbänkar till på lördag",
      { personName: "Jimmy" },
    );

    expect(dependencies.updateManualTask).toHaveBeenCalled();
    expect(res.executedActions).toContain("update_item");
    expect(res.text).toContain("Uppdaterade uppgiften");
  });

  it("handles deleting tasks/events ('Ta bort uppgiften Torka köksbänkar')", async () => {
    const res = await processJarvisAgentMessage(
      TEST_ACTOR,
      "Ta bort uppgiften Torka köksbänkar",
      { personName: "Jimmy" },
    );

    expect(dependencies.removeTask).toHaveBeenCalled();
    expect(res.executedActions).toContain("delete_item");
    expect(res.text).toContain("Tog bort uppgiften");
  });
});
