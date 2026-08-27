import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock, TEST_ACTOR } from "../../../../test/actor-fixture";
import type { FamilyTask } from "@/lib/types";

const database = vi.hoisted(() => ({
  loadDashboard: vi.fn(),
  removeTask: vi.fn(),
  saveManualTask: vi.fn(),
  updateTaskCompletion: vi.fn(),
}));

vi.mock("@/server/database", () => database);
vi.mock("@/server/actor", () => actorModuleMock());

import { DELETE, PATCH } from "@/app/api/tasks/[id]/route";
import { GET, POST } from "@/app/api/tasks/route";

const task: FamilyTask = {
  id: "task-1",
  householdId: "household-demo",
  personId: "person-nora",
  documentId: null,
  title: "Ta med idrottskläder",
  kind: "bring",
  dueAt: "2026-08-25T06:00:00.000Z",
  completedAt: null,
  notes: null,
  reviewStatus: "confirmed",
  confidence: 1,
  sourceExcerpt: null,
};

describe("task API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists dashboard tasks", async () => {
    database.loadDashboard.mockResolvedValue({ tasks: [task] });
    const response = await GET(new Request("http://localhost/api/tasks"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tasks: [task] });
  });

  it("creates a validated household task", async () => {
    database.saveManualTask.mockResolvedValue(task);
    const response = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personId: "person-nora",
          title: "Ta med idrottskläder",
          kind: "bring",
          dueAt: "2026-08-25T08:00:00+02:00",
          notes: null,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ task });
    expect(database.saveManualTask).toHaveBeenCalledOnce();
  });

  it("rejects an invalid task without touching the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personId: "person-nora",
          title: "Ta med idrottskläder",
          kind: "bring",
          dueAt: "på tisdag",
          notes: null,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(database.saveManualTask).not.toHaveBeenCalled();
  });

  it("marks a task complete through the narrow PATCH contract", async () => {
    const completed = { ...task, completedAt: "2026-08-21T18:00:00.000Z" };
    database.updateTaskCompletion.mockResolvedValue(completed);
    const response = await PATCH(
      new Request("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: true }),
      }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task: completed });
    expect(database.updateTaskCompletion).toHaveBeenCalledWith(TEST_ACTOR, "task-1", true);
  });

  it("returns 404 for a task outside the active household", async () => {
    database.updateTaskCompletion.mockResolvedValue(null);
    const response = await PATCH(
      new Request("http://localhost/api/tasks/task-other", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: false }),
      }),
      { params: Promise.resolve({ id: "task-other" }) },
    );
    expect(response.status).toBe(404);
  });

  it("deletes a validated task id", async () => {
    database.removeTask.mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "task-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, id: "task-1" });
    expect(database.removeTask).toHaveBeenCalledWith(TEST_ACTOR, "task-1");
  });
});
