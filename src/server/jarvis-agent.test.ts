import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const dependencies = vi.hoisted(() => ({
  loadDashboard: vi.fn(async () => ({
    events: [],
    people: [],
    tasks: [],
  })),
  saveManualTask: vi.fn(async (_actor, input) => ({
    id: "task-101",
    title: input.title,
    dueAt: input.dueAt,
  })),
  saveProject100JournalEntry: vi.fn(),
  createProject100ContentProject: vi.fn(async () => ({ id: "proj-101", title: "Test" })),
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
  saveProject100JournalEntry: dependencies.saveProject100JournalEntry,
}));
vi.mock("@/server/project100-content", () => ({
  createProject100ContentProject: dependencies.createProject100ContentProject,
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
        dueAt: "2026-09-25",
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
});
