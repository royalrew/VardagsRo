import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock } from "../../../../test/actor-fixture";

import type { DashboardData } from "@/lib/types";

const dependencies = vi.hoisted(() => ({
  demoFallbackAllowed: vi.fn(() => true),
  hasUnresolvedFamilyReference: vi.fn(() => false),
  loadDashboard: vi.fn(),
  planQuestionWithAI: vi.fn(),
}));

vi.mock("@/server/ai", () => ({
  hasUnresolvedFamilyReference: dependencies.hasUnresolvedFamilyReference,
  planQuestionWithAI: dependencies.planQuestionWithAI,
}));
vi.mock("@/server/config", () => ({
  demoFallbackAllowed: dependencies.demoFallbackAllowed,
  appBaseUrl: () => "http://localhost",
  isProductionRuntime: () => false,
}));
vi.mock("@/server/database", () => ({ loadDashboard: dependencies.loadDashboard }));
vi.mock("@/server/actor", () => actorModuleMock());

import { POST } from "@/app/api/ask/route";

const context: Pick<
  DashboardData,
  "people" | "events" | "tasks" | "documents" | "currentPersonId" | "timezone"
> = {
  people: [
    {
      id: "person-ida",
      householdId: "household-1",
      name: "Ida",
      role: "Barn",
      personType: "child",
      aliases: ["ida"],
      initials: "I",
      color: "#111111",
      tint: "#eeeeee",
    },
  ],
  events: [],
  tasks: [
    {
      id: "task-form",
      householdId: "household-1",
      personId: "person-ida",
      documentId: "document-school",
      title: "Samtyckesblanketten",
      kind: "form",
      dueAt: "2026-08-24T14:30:00.000Z",
      completedAt: null,
      notes: null,
      reviewStatus: "confirmed",
      confidence: 0.98,
      sourceExcerpt: "Blanketten lämnas senast 24 augusti.",
    },
  ],
  documents: [
    {
      id: "document-school",
      householdId: "household-1",
      title: "Veckobrev från skolan",
      filename: "veckobrev.pdf",
      mimeType: "application/pdf",
      documentType: "Veckobrev",
      personId: "person-ida",
      folderId: null,
      status: "confirmed",
      uploadedAt: "2026-08-20T12:00:00.000Z",
      periodLabel: "Vecka 35",
      summary: "Information från skolan.",
      storageKey: null,
      hash: "test",
      eventsCount: 0,
      tasksCount: 1,
    },
  ],
  currentPersonId: "person-ida",
  timezone: "Europe/Stockholm",
};

describe("POST /api/ask task questions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.demoFallbackAllowed.mockReturnValue(true);
  });

  it("answers a structured task before calling the AI calendar planner", async () => {
    const response = await POST(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: "När ska blanketten lämnas?",
          context,
        }),
      }),
    );
    const answer = await response.json();

    expect(response.status).toBe(200);
    expect(answer).toMatchObject({
      hasEnoughData: true,
      matchedEventIds: [],
      matchedTaskIds: ["task-form"],
      sources: [
        {
          id: "task-form",
          documentId: "document-school",
          kind: "task",
          eventId: null,
          taskId: "task-form",
          title: "Veckobrev från skolan",
        },
      ],
    });
    expect(answer.text).toContain("Samtyckesblanketten");
    expect(dependencies.planQuestionWithAI).not.toHaveBeenCalled();
    expect(dependencies.loadDashboard).not.toHaveBeenCalled();
  });
});
