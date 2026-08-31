import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const state = {
    session: null as { user: { id: string } } | null,
    membership: null as Record<string, unknown> | null,
  };
  const sql = vi.fn(() => Promise.resolve(harness_membership()));
  function harness_membership() {
    return state.membership ? [state.membership] : [];
  }
  return { state, sql };
});

vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => harness.state.session } }),
}));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://permissions.test/database",
  demoFallbackAllowed: () => false,
  appBaseUrl: () => "http://localhost",
  isProductionRuntime: () => false,
  telegramConfig: () => null,
}));
vi.mock("@/server/database", () => ({
  readyClient: async () => harness.sql,
  loadDashboard: vi.fn(async () => ({ tasks: [], people: [], folders: [] })),
  saveManualTask: vi.fn(),
  saveManualEvent: vi.fn(),
  createPerson: vi.fn(),
  updateHouseholdName: vi.fn(),
  latestUndoableDeletion: vi.fn(async () => null),
  undoDeletion: vi.fn(async () => ({ label: "Träning", kind: "event" as const })),
  createHouseholdLogin: vi.fn(async () => ({
    email: "ny@exempel.se",
    personName: "Ida",
    role: "viewer" as const,
  })),
  listHouseholdLogins: vi.fn(async () => []),
}));
// Projekt 100 storage is covered in its own scope test; here the routes are
// only asked who they let through.
vi.mock("@/server/project100-training", () => ({
  loadProject100TrainingSessions: vi.fn(async () => []),
  loadProject100TrainingTemplates: vi.fn(async () => []),
  createProject100TrainingSession: vi.fn(async () => ({ id: "session-1" })),
  createProject100TrainingTemplate: vi.fn(async () => ({ id: "template-1" })),
  deleteProject100TrainingSession: vi.fn(async () => true),
  updateProject100TrainingSession: vi.fn(async () => ({ id: "session-1" })),
  archiveProject100TrainingTemplate: vi.fn(async () => true),
}));
vi.mock("@/server/project100-journal", () => ({
  loadProject100Journal: vi.fn(async () => ({
    today: "2026-08-29",
    from: "2025-08-29",
    to: "2026-08-29",
    query: null,
    entries: [],
    totalEntries: 0,
    excludedCount: 0,
  })),
  saveProject100JournalEntry: vi.fn(async () => ({
    writtenOn: "2026-08-26",
    body: "Kändes starkt",
    mood: null,
    energy: null,
    sleepHours: null,
    excludedFromAi: false,
    updatedAt: "2026-08-26T20:14:00.000Z",
  })),
  deleteProject100JournalEntry: vi.fn(async () => true),
}));
vi.mock("@/server/project100-body", () => ({
  loadProject100BodyJourney: vi.fn(async () => ({
    today: "2026-08-29",
    from: "2026-06-01",
    to: "2026-08-29",
    entries: [],
    goal: { weightGoalKg: 100, startWeightKg: 80, heightCm: null },
    weightHistory: [],
  })),
  saveProject100BodyEntry: vi.fn(async () => ({
    measuredOn: "2026-08-26",
    note: null,
    measurements: [],
  })),
  deleteProject100BodyEntry: vi.fn(async () => true),
  saveProject100Settings: vi.fn(async () => ({
    weightGoalKg: 100,
    startWeightKg: 80,
    heightCm: null,
  })),
}));
vi.mock("@/server/project100-media", () => ({
  loadProject100MediaLibrary: vi.fn(async () => ({
    items: [],
    counts: { body: 0, food: 0, training: 0, content: 0 },
    urlExpiresInSeconds: 300,
    storageConfigured: true,
  })),
  loadProject100SessionOptions: vi.fn(async () => []),
  createProject100Media: vi.fn(async () => ({ id: "media-1" })),
  deleteProject100Media: vi.fn(async () => true),
  signedProject100MediaOriginalUrl: vi.fn(async () => ({
    url: "https://signed.test/original",
    expiresInSeconds: 300,
  })),
}));
vi.mock("@/server/project100-nutrition", () => ({
  loadProject100NutritionView: vi.fn(async () => ({
    day: "2026-08-26",
    meals: [],
    batches: [],
    supplements: [],
  })),
  saveProject100Food: vi.fn(async () => ({ id: "food-1" })),
  saveProject100Batch: vi.fn(async () => ({ id: "batch-1" })),
  logProject100Meal: vi.fn(async () => ({ id: "meal-1" })),
  deleteProject100Meal: vi.fn(async () => true),
  saveProject100Supplement: vi.fn(async () => ({ id: "supplement-1" })),
  archiveProject100Supplement: vi.fn(async () => true),
  saveProject100ProteinTarget: vi.fn(async () => 190),
  loadProject100Recipes: vi.fn(async () => []),
  saveProject100Recipe: vi.fn(async () => ({ id: "recipe-1" })),
  updateProject100Recipe: vi.fn(async () => ({ id: "recipe-1" })),
  saveProject100RecipeFromMeal: vi.fn(async () => ({ id: "recipe-1" })),
  saveProject100RecipeFromBatch: vi.fn(async () => ({ id: "recipe-1" })),
  archiveProject100Recipe: vi.fn(async () => true),
  cookBatchFromRecipe: vi.fn(async () => ({ id: "batch-1" })),
  updateProject100PantryStock: vi.fn(async () => ({ id: "food-1" })),
  saveProject100MealPlan: vi.fn(async () => ({ id: "plan-1" })),
  deleteProject100MealPlan: vi.fn(async () => true),
  loadProject100MealPlanWeek: vi.fn(async () => ({
    weekStart: "2026-08-31",
    weekEnd: "2026-09-06",
    timeZone: "Europe/Stockholm",
    days: [],
    recipes: [],
    batches: [],
    foods: [],
    shoppingList: { items: [], totalGramsToBuy: 0 },
  })),
}));

vi.mock("@/server/project100-strength", () => ({
  saveProject100ExerciseMuscleGroups: vi.fn(async () => ["chest"]),
}));
vi.mock("@/server/project100-insights", () => ({
  loadProject100Insights: vi.fn(async () => ({})),
}));
vi.mock("@/server/project100-jarvis", () => ({
  loadProject100JarvisWorkspace: vi.fn(async () => ({ conversations: [], memories: [] })),
  createProject100Conversation: vi.fn(async () => ({ id: "conv-1", title: "Test" })),
  deleteProject100Conversation: vi.fn(async () => true),
  sendProject100JarvisMessage: vi.fn(async () => ({ conversationId: "conv-1", userMessage: {}, assistantMessage: {} })),
  createProject100Memory: vi.fn(async () => ({ id: "mem-1" })),
  updateProject100Memory: vi.fn(async () => ({ id: "mem-1" })),
  deleteProject100Memory: vi.fn(async () => true),
}));
vi.mock("@/server/project100-content", () => ({
  loadProject100ContentWorkspace: vi.fn(async () => ({ projects: [], activeProject: null, availableMedia: [] })),
  createProject100ContentProject: vi.fn(async () => ({ id: "proj-1", title: "Test" })),
  updateProject100ContentProject: vi.fn(async () => ({ id: "proj-1", title: "Test" })),
  deleteProject100ContentProject: vi.fn(async () => true),
  attachProject100ContentMedia: vi.fn(async () => ({ mediaId: "med-1" })),
  detachProject100ContentMedia: vi.fn(async () => true),
  generateProject100ContentSuggestions: vi.fn(async () => ({ hook: "Här är veckan" })),
}));
vi.mock("@/server/jarvis-gaps", () => ({
  listJarvisCapabilityGaps: vi.fn(async () => []),
  updateJarvisCapabilityGapStatus: vi.fn(async () => ({ id: "gap-1", status: "implemented" })),
}));
vi.mock("@/server/audio-synthesis", () => ({
  synthesizeJarvisSpeech: vi.fn(async () => Buffer.from("audio-mock-bytes")),
}));
vi.mock("@/server/jarvis-briefing", () => ({
  generateMorningBriefing: vi.fn(async () => ({ text: "Morgonöversikt", date: "2026-08-31" })),
  generateEveningBriefing: vi.fn(async () => ({ text: "Kvällsavstämning", date: "2026-08-31" })),
}));

import { PATCH as householdPatch } from "@/app/api/household/route";
import { GET as loginsGet } from "@/app/api/logins/route";
import { POST as undoPost } from "@/app/api/undo/route";
import { POST as createLogin } from "@/app/api/people/[id]/login/route";
import { POST as peoplePost } from "@/app/api/people/route";
import { GET as tasksGet, POST as tasksPost } from "@/app/api/tasks/route";
import {
  GET as trainingSessionsGet,
  POST as trainingSessionsPost,
} from "@/app/api/project100/training/sessions/route";
import {
  DELETE as trainingSessionDelete,
  PATCH as trainingSessionPatch,
} from "@/app/api/project100/training/sessions/[id]/route";
import { POST as trainingTemplatesPost } from "@/app/api/project100/training/templates/route";
import { PATCH as trainingExerciseMusclesPatch } from "@/app/api/project100/training/exercises/[id]/muscles/route";
import { GET as insightsGet } from "@/app/api/project100/insights/route";
import { GET as journalGet, POST as journalPost } from "@/app/api/project100/journal/route";
import { DELETE as journalDelete } from "@/app/api/project100/journal/[date]/route";
import { GET as bodyGet, POST as bodyPost } from "@/app/api/project100/body/route";
import { DELETE as bodyDelete } from "@/app/api/project100/body/[date]/route";
import { PATCH as settingsPatch } from "@/app/api/project100/settings/route";
import { GET as mediaGet, POST as mediaPost } from "@/app/api/project100/media/route";
import { DELETE as mediaDelete } from "@/app/api/project100/media/[id]/route";
import { GET as mediaUrlGet } from "@/app/api/project100/media/[id]/url/route";
import { POST as nutritionBatchesPost } from "@/app/api/project100/nutrition/batches/route";
import { POST as nutritionFoodsPost } from "@/app/api/project100/nutrition/foods/route";
import {
  GET as nutritionMealsGet,
  POST as nutritionMealsPost,
} from "@/app/api/project100/nutrition/meals/route";
import { DELETE as nutritionMealDelete } from "@/app/api/project100/nutrition/meals/[id]/route";
import { POST as nutritionSupplementsPost } from "@/app/api/project100/nutrition/supplements/route";
import { DELETE as nutritionSupplementDelete } from "@/app/api/project100/nutrition/supplements/[id]/route";
import { PATCH as nutritionTargetPatch } from "@/app/api/project100/nutrition/target/route";
import {
  GET as nutritionRecipesGet,
  POST as nutritionRecipesPost,
} from "@/app/api/project100/nutrition/recipes/route";
import {
  DELETE as nutritionRecipeDelete,
  PATCH as nutritionRecipePatch,
} from "@/app/api/project100/nutrition/recipes/[id]/route";
import { POST as nutritionRecipeFromMealPost } from "@/app/api/project100/nutrition/recipes/from-meal/route";
import { POST as nutritionRecipeFromBatchPost } from "@/app/api/project100/nutrition/recipes/from-batch/route";
import { POST as nutritionCookBatchPost } from "@/app/api/project100/nutrition/recipes/[id]/cook-batch/route";
import { PATCH as nutritionPantryPatch } from "@/app/api/project100/nutrition/pantry/route";
import {
  GET as nutritionPlanGet,
  POST as nutritionPlanPost,
} from "@/app/api/project100/nutrition/plan/route";
import { DELETE as nutritionPlanDelete } from "@/app/api/project100/nutrition/plan/[id]/route";
import {
  GET as jarvisConversationsGet,
  POST as jarvisConversationsPost,
} from "@/app/api/project100/jarvis/conversations/route";
import { DELETE as jarvisConversationDelete } from "@/app/api/project100/jarvis/conversations/[id]/route";
import { POST as jarvisMessagePost } from "@/app/api/project100/jarvis/messages/route";
import {
  GET as jarvisMemoriesGet,
  POST as jarvisMemoriesPost,
} from "@/app/api/project100/jarvis/memories/route";
import {
  DELETE as jarvisMemoryDelete,
  PATCH as jarvisMemoryPatch,
} from "@/app/api/project100/jarvis/memories/[id]/route";
import {
  GET as contentProjectsGet,
  POST as contentProjectsPost,
} from "@/app/api/project100/content/projects/route";
import {
  DELETE as contentProjectDelete,
  GET as contentProjectGet,
  PATCH as contentProjectPatch,
} from "@/app/api/project100/content/projects/[id]/route";
import { POST as contentMediaPost } from "@/app/api/project100/content/projects/[id]/media/route";
import { DELETE as contentMediaDelete } from "@/app/api/project100/content/projects/[id]/media/[mediaId]/route";
import { POST as contentSuggestionsPost } from "@/app/api/project100/content/suggestions/route";
import { GET as jarvisGapsGet } from "@/app/api/project100/jarvis/gaps/route";
import { PATCH as jarvisGapsPatch } from "@/app/api/project100/jarvis/gaps/[id]/route";
import { POST as jarvisSpeakPost } from "@/app/api/project100/jarvis/speak/route";
import {
  GET as jarvisBriefingGet,
  POST as jarvisBriefingPost,
} from "@/app/api/project100/jarvis/briefing/route";

function membership(
  role: "owner" | "adult" | "viewer",
  personType: "adult" | "child" = "adult",
) {
  return {
    membership_id: "membership-1",
    user_id: "user-1",
    household_id: "household-real",
    person_id: "person-1",
    role,
    person_type: personType,
  };
}

function jsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function jsonPatch(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("routes refuse anyone without a verified session", () => {
  beforeEach(() => {
    harness.state.session = null;
    harness.state.membership = null;
  });

  it("answers 401 on a read instead of returning empty data", async () => {
    const response = await tasksGet(new Request("http://localhost/api/tasks"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "NOT_AUTHENTICATED" });
  });

  it("answers 401 on a write", async () => {
    const response = await tasksPost(
      jsonPost("http://localhost/api/tasks", {
        personId: "person-1",
        title: "Ta med idrottskläder",
        kind: "bring",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("refuses a signed-in account that belongs to no household", async () => {
    harness.state.session = { user: { id: "user-drifting" } };

    const response = await tasksGet(new Request("http://localhost/api/tasks"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "NO_HOUSEHOLD_MEMBERSHIP" });
  });
});

describe("roles decide what a member may change", () => {
  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
  });

  it("keeps a viewer from undoing, since they could not have deleted either", async () => {
    harness.state.membership = membership("viewer");

    const response = await undoPost(jsonPost("http://localhost/api/undo", { id: "1" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("lets an adult undo their own deletion", async () => {
    harness.state.membership = membership("adult");

    const response = await undoPost(jsonPost("http://localhost/api/undo", { id: "1" }));

    expect(response.status).toBe(200);
  });

  it("keeps a viewer from writing while still letting them read", async () => {
    harness.state.membership = membership("viewer");

    await expect(tasksGet(new Request("http://localhost/api/tasks"))).resolves.toMatchObject({
      status: 200,
    });

    const write = await tasksPost(
      jsonPost("http://localhost/api/tasks", {
        personId: "person-1",
        title: "Ta med idrottskläder",
        kind: "bring",
      }),
    );

    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("reserves handing out access to the owner", async () => {
    // Giving someone a login is not an ordinary edit: it decides who can see the
    // household's calendar and documents at all.
    harness.state.membership = membership("adult");

    const created = await createLogin(
      jsonPost("http://localhost/api/people/person-1/login", {
        personId: "person-1",
        email: "ny@exempel.se",
        password: "ett tillrackligt langt",
        role: "viewer",
      }),
      { params: Promise.resolve({ id: "person-1" }) },
    );
    const listed = await loginsGet(new Request("http://localhost/api/logins"));

    expect(created.status).toBe(403);
    expect(listed.status).toBe(403);
  });

  it("lets the owner hand out a login", async () => {
    harness.state.membership = membership("owner");

    const created = await createLogin(
      jsonPost("http://localhost/api/people/person-1/login", {
        personId: "person-1",
        email: "ny@exempel.se",
        password: "ett tillrackligt langt",
        role: "viewer",
      }),
      { params: Promise.resolve({ id: "person-1" }) },
    );

    expect(created.status).toBe(201);
  });

  it("reserves family composition and the household name for the owner", async () => {
    harness.state.membership = membership("adult");

    const person = await peoplePost(
      jsonPost("http://localhost/api/people", {
        name: "Ida",
        role: "Dotter",
        personType: "child",
      }),
    );
    const household = await householdPatch(
      jsonPatch("http://localhost/api/household", { name: "Familjen Zickaris" }),
    );

    expect(person.status).toBe(403);
    expect(await person.json()).toMatchObject({ code: "OWNER_REQUIRED" });
    expect(household.status).toBe(403);
  });
});

describe("cross-site writes", () => {
  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("refuses a write that arrives from another site", async () => {
    const response = await tasksPost(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://elak.example",
        },
        body: JSON.stringify({ personId: "person-1", title: "Hej", kind: "bring" }),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("Projekt 100 is a private adult workspace", () => {
  const sessionsUrl = "http://localhost/api/project100/training/sessions";

  function trainingSession() {
    return {
      title: "Helkropp hemma",
      activityType: "strength_home",
      status: "completed",
      sessionDate: "2026-08-26",
      exercises: [{ name: "Marklyft", sets: [{ reps: 8, weightKg: 60 }] }],
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it tells anyone that training data exists", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    const read = await trainingSessionsGet(new Request(sessionsUrl));
    const write = await trainingSessionsPost(jsonPost(sessionsUrl, trainingSession()));

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it("keeps a child in the household out of the adult workspace", async () => {
    // A child may read the family calendar. Body, weight and training are not
    // household data and stay closed even for a signed-in family member.
    harness.state.membership = membership("viewer", "child");

    const read = await trainingSessionsGet(new Request(sessionsUrl));

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
  });

  it("lets a read-only adult look without letting them log", async () => {
    harness.state.membership = membership("viewer");

    const read = await trainingSessionsGet(new Request(sessionsUrl));
    const write = await trainingSessionsPost(jsonPost(sessionsUrl, trainingSession()));

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses a training write that arrives from another site", async () => {
    const response = await trainingSessionsPost(
      new Request(sessionsUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://elak.example",
        },
        body: JSON.stringify(trainingSession()),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses a filter it does not understand instead of ignoring it", async () => {
    // An unread `?userId=` must never look like it was honoured.
    const response = await trainingSessionsGet(
      new Request(`${sessionsUrl}?userId=someone-else`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("refuses an id that tries to walk out of its own route", async () => {
    const response = await trainingSessionDelete(
      new Request(`${sessionsUrl}/x`, { method: "DELETE", headers: { origin: "http://localhost" } }),
      { params: Promise.resolve({ id: "../templates/template-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("keeps a read-only adult from closing a planned pass", async () => {
    const move = {
      action: "move",
      sessionDate: "2026-08-28",
      plannedStartAt: null,
      plannedEndAt: null,
    };
    const patch = (): Request =>
      new Request("http://localhost/api/project100/training/sessions/session-1", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify(move),
      });

    harness.state.membership = membership("viewer");
    const viewer = await trainingSessionPatch(patch(), {
      params: Promise.resolve({ id: "session-1" }),
    });

    harness.state.membership = membership("adult");
    const adult = await trainingSessionPatch(patch(), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(viewer.status).toBe(403);
    expect(await viewer.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
    expect(adult.status).toBe(200);
  });

  it("holds a template to the same gates as a session", async () => {
    harness.state.membership = membership("viewer", "child");
    const child = await trainingTemplatesPost(
      jsonPost("http://localhost/api/project100/training/templates", {
        name: "30 min helkropp",
        activityType: "strength_home",
        exercises: [{ name: "Marklyft", sets: [{ reps: 12 }] }],
      }),
    );

    harness.state.membership = membership("adult");
    const adult = await trainingTemplatesPost(
      jsonPost("http://localhost/api/project100/training/templates", {
        name: "30 min helkropp",
        activityType: "strength_home",
        exercises: [{ name: "Marklyft", sets: [{ reps: 12 }] }],
      }),
    );

    expect(child.status).toBe(403);
    expect(adult.status).toBe(201);
  });

  it("holds exercise muscle groups behind authentication, the adult gate and write access", async () => {
    const request = () =>
      jsonPatch(
        "http://localhost/api/project100/training/exercises/exercise-1/muscles",
        { muscleGroups: ["chest", "triceps"] },
      );
    const call = (origin = "http://localhost") => {
      const original = request();
      const routed =
        origin === "http://localhost"
          ? original
          : new Request(original.url, {
              method: original.method,
              headers: { "content-type": "application/json", origin },
              body: JSON.stringify({ muscleGroups: ["chest", "triceps"] }),
            });
      return trainingExerciseMusclesPatch(routed, {
        params: Promise.resolve({ id: "exercise-1" }),
      });
    };

    harness.state.session = null;
    harness.state.membership = null;
    const anonymous = await call();

    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    const child = await call();

    harness.state.membership = membership("viewer");
    const viewer = await call();

    harness.state.membership = membership("adult");
    const adult = await call();
    const crossSite = await call("https://elak.example");

    expect(anonymous.status).toBe(401);
    expect(child.status).toBe(403);
    expect(viewer.status).toBe(403);
    expect(adult.status).toBe(200);
    expect(crossSite.status).toBe(403);
  });
});

describe("Projekt 100 media is gated like the rest of the workspace", () => {
  const mediaUrl = "http://localhost/api/project100/media";

  function imageForm(): FormData {
    const form = new FormData();
    form.set("category", "body");
    form.set("capturedOn", "2026-08-26");
    form.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "bild.jpg", {
        type: "image/jpeg",
      }),
    );
    return form;
  }

  function upload(origin = "http://localhost"): Request {
    return new Request(mediaUrl, {
      method: "POST",
      headers: { origin },
      body: imageForm(),
    });
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it admits that a picture library exists", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    expect((await mediaGet(new Request(mediaUrl))).status).toBe(401);
    expect((await mediaPost(upload())).status).toBe(401);
  });

  it("keeps a child out of the picture library", async () => {
    harness.state.membership = membership("viewer", "child");

    const read = await mediaGet(new Request(mediaUrl));

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
  });

  it("keeps a read-only adult from adding pictures", async () => {
    harness.state.membership = membership("viewer");

    expect((await mediaGet(new Request(mediaUrl))).status).toBe(200);
    const write = await mediaPost(upload());
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses an upload posted from another site", async () => {
    expect((await mediaPost(upload("https://elak.example"))).status).toBe(403);
  });

  it("refuses a filter it does not understand", async () => {
    const response = await mediaGet(new Request(`${mediaUrl}?userId=someone-else`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("requires a real image, not just a form that says so", async () => {
    const response = await mediaPost(
      new Request(mediaUrl, {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ category: "body", capturedOn: "2026-08-26" }),
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_MULTIPART_REQUIRED" });
  });

  it("gates the signed full-size address and the deletion the same way", async () => {
    harness.state.membership = membership("viewer", "child");
    const childOpen = await mediaUrlGet(new Request(`${mediaUrl}/media-1/url`), {
      params: Promise.resolve({ id: "media-1" }),
    });

    harness.state.membership = membership("viewer");
    const viewerDelete = await mediaDelete(
      new Request(`${mediaUrl}/media-1`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ id: "media-1" }) },
    );

    expect(childOpen.status).toBe(403);
    expect(await childOpen.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(viewerDelete.status).toBe(403);
  });
});

describe("Projekt 100 body data is the most private of all", () => {
  const bodyUrl = "http://localhost/api/project100/body";

  function measurement() {
    return {
      measuredOn: "2026-08-26",
      note: null,
      measurements: [{ metric: "weight", label: null, unit: "kg", value: 83.4 }],
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it admits that a weight was ever logged", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    expect((await bodyGet(new Request(bodyUrl))).status).toBe(401);
    expect((await bodyPost(jsonPost(bodyUrl, measurement()))).status).toBe(401);
  });

  it("keeps a child out of weight, measurements and the goal", async () => {
    harness.state.membership = membership("viewer", "child");

    const read = await bodyGet(new Request(bodyUrl));
    const goal = await settingsPatch(
      jsonPatch("http://localhost/api/project100/settings", {
        weightGoalKg: 100,
        startWeightKg: 80,
        heightCm: null,
      }),
    );

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(goal.status).toBe(403);
  });

  it("keeps a read-only adult from writing a measurement", async () => {
    harness.state.membership = membership("viewer");

    expect((await bodyGet(new Request(bodyUrl))).status).toBe(200);
    const write = await bodyPost(jsonPost(bodyUrl, measurement()));
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses a filter it does not understand", async () => {
    const response = await bodyGet(new Request(`${bodyUrl}?userId=someone-else`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("refuses a day that is not a real date", async () => {
    const response = await bodyDelete(
      new Request(`${bodyUrl}/2026-02-30`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ date: "2026-02-30" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a measurement posted from another site", async () => {
    const response = await bodyPost(
      new Request(bodyUrl, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://elak.example" },
        body: JSON.stringify(measurement()),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("Projekt 100 nutrition stays inside the private adult workspace", () => {
  const nutritionUrl = "http://localhost/api/project100/nutrition";
  const mealsUrl = `${nutritionUrl}/meals`;
  const targetUrl = `${nutritionUrl}/target`;

  function food() {
    return {
      name: "Kyckling",
      proteinPer100g: 23,
      carbsPer100g: 0,
      fatPer100g: 2,
      kcalPer100g: 110,
      isStaple: false,
      stapleTargetGrams: null,
    };
  }

  function batch() {
    return {
      name: "Veckolada",
      cookedOn: "2026-08-26",
      portionsTotal: 6,
      note: null,
      items: [{ foodId: "food-1", grams: 1_000 }],
    };
  }

  function meal() {
    return {
      source: "manual",
      title: "Lunch",
      eatenOn: "2026-08-26",
      eatenAtMinute: 720,
      mealType: "lunch",
      proteinG: 42,
      carbsG: 65,
      fatG: 14,
      kcal: 560,
      hungerBefore: 3,
      fullnessAfter: 4,
      note: null,
      mediaId: null,
    };
  }

  function supplement() {
    return {
      name: "Kreatin",
      kind: "creatine",
      doseAmount: 5,
      doseUnit: "g",
      purpose: "Daglig mangd",
      timingMatters: false,
      timingNote: null,
    };
  }

  function recipe() {
    return {
      name: "Kyckling och ris",
      description: null,
      servingsDefault: 4,
      isFavorite: true,
      instructions: null,
      items: [{ foodId: "food-1", grams: 800 }],
    };
  }

  function mealPlan() {
    return {
      plannedDate: "2026-08-31",
      plannedMinute: 720,
      mealType: "lunch",
      source: "recipe",
      recipeId: "recipe-1",
      batchId: null,
      title: "Kyckling och ris",
      portions: 2,
      isCooked: false,
      note: null,
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 across every nutrition route before exposing private food data", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    const responses = await Promise.all([
      nutritionMealsGet(new Request(mealsUrl)),
      nutritionMealsPost(jsonPost(mealsUrl, meal())),
      nutritionFoodsPost(jsonPost(`${nutritionUrl}/foods`, food())),
      nutritionBatchesPost(jsonPost(`${nutritionUrl}/batches`, batch())),
      nutritionSupplementsPost(jsonPost(`${nutritionUrl}/supplements`, supplement())),
      nutritionTargetPatch(jsonPatch(targetUrl, { proteinTargetG: 190 })),
      nutritionRecipesGet(new Request(`${nutritionUrl}/recipes`)),
      nutritionRecipesPost(jsonPost(`${nutritionUrl}/recipes`, recipe())),
      nutritionRecipePatch(
        jsonPatch(`${nutritionUrl}/recipes/recipe-1`, recipe()),
        { params: Promise.resolve({ id: "recipe-1" }) },
      ),
      nutritionRecipeDelete(
        new Request(`${nutritionUrl}/recipes/recipe-1`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id: "recipe-1" }) },
      ),
      nutritionRecipeFromMealPost(
        jsonPost(`${nutritionUrl}/recipes/from-meal`, {
          mealId: "meal-1",
          name: "Favoritlunch",
          description: null,
          isFavorite: true,
        }),
      ),
      nutritionRecipeFromBatchPost(
        jsonPost(`${nutritionUrl}/recipes/from-batch`, {
          batchId: "batch-1",
          name: "Veckolåda",
          description: null,
          isFavorite: true,
        }),
      ),
      nutritionCookBatchPost(
        jsonPost(`${nutritionUrl}/recipes/recipe-1/cook-batch`, {
          name: "Veckolådor",
          cookedOn: "2026-08-30",
          portionsTotal: 6,
          note: null,
        }),
        { params: Promise.resolve({ id: "recipe-1" }) },
      ),
      nutritionPantryPatch(
        jsonPatch(`${nutritionUrl}/pantry`, { foodId: "food-1", inStockGrams: 800 }),
      ),
      nutritionPlanGet(new Request(`${nutritionUrl}/plan?vecka=2026-08-31`)),
      nutritionPlanPost(jsonPost(`${nutritionUrl}/plan`, mealPlan())),
      nutritionPlanDelete(
        new Request(`${nutritionUrl}/plan/plan-1`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id: "plan-1" }) },
      ),
      nutritionMealDelete(
        new Request(`${mealsUrl}/meal-1`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id: "meal-1" }) },
      ),
      nutritionSupplementDelete(
        new Request(`${nutritionUrl}/supplements/supplement-1`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id: "supplement-1" }) },
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: responses.length }, () => 401),
    );
  });

  it("keeps a child out while letting an adult prepare a batch", async () => {
    harness.state.membership = membership("viewer", "child");

    const childRead = await nutritionMealsGet(new Request(mealsUrl));
    const childWrite = await nutritionBatchesPost(
      jsonPost(`${nutritionUrl}/batches`, batch()),
    );

    harness.state.membership = membership("adult");
    const adultWrite = await nutritionBatchesPost(
      jsonPost(`${nutritionUrl}/batches`, batch()),
    );

    expect(childRead.status).toBe(403);
    expect(await childRead.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(childWrite.status).toBe(403);
    expect(await childWrite.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(adultWrite.status).toBe(201);
  });

  it("keeps a child out of the recipe bank and meal planner", async () => {
    harness.state.membership = membership("viewer", "child");

    const responses = await Promise.all([
      nutritionRecipesGet(new Request(`${nutritionUrl}/recipes`)),
      nutritionPlanGet(new Request(`${nutritionUrl}/plan?vecka=2026-08-31`)),
      nutritionRecipesPost(jsonPost(`${nutritionUrl}/recipes`, recipe())),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    for (const response of responses) {
      expect(await response.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    }
  });

  it("lets a read-only adult see the day without letting them add supplements", async () => {
    harness.state.membership = membership("viewer");

    const read = await nutritionMealsGet(new Request(mealsUrl));
    const write = await nutritionSupplementsPost(
      jsonPost(`${nutritionUrl}/supplements`, supplement()),
    );

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("keeps every new recipe, pantry and planning mutation behind the write gate", async () => {
    harness.state.membership = membership("viewer");

    const reads = await Promise.all([
      nutritionRecipesGet(new Request(`${nutritionUrl}/recipes`)),
      nutritionPlanGet(new Request(`${nutritionUrl}/plan?vecka=2026-08-31`)),
    ]);
    const writes = await Promise.all([
      nutritionRecipesPost(jsonPost(`${nutritionUrl}/recipes`, recipe())),
      nutritionRecipePatch(
        jsonPatch(`${nutritionUrl}/recipes/recipe-1`, recipe()),
        { params: Promise.resolve({ id: "recipe-1" }) },
      ),
      nutritionRecipeDelete(
        new Request(`${nutritionUrl}/recipes/recipe-1`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id: "recipe-1" }) },
      ),
      nutritionRecipeFromMealPost(
        jsonPost(`${nutritionUrl}/recipes/from-meal`, {
          mealId: "meal-1",
          name: "Favoritlunch",
          description: null,
          isFavorite: true,
        }),
      ),
      nutritionRecipeFromBatchPost(
        jsonPost(`${nutritionUrl}/recipes/from-batch`, {
          batchId: "batch-1",
          name: "Veckolåda",
          description: null,
          isFavorite: true,
        }),
      ),
      nutritionCookBatchPost(
        jsonPost(`${nutritionUrl}/recipes/recipe-1/cook-batch`, {
          name: "Veckolådor",
          cookedOn: "2026-08-30",
          portionsTotal: 6,
          note: null,
        }),
        { params: Promise.resolve({ id: "recipe-1" }) },
      ),
      nutritionPantryPatch(
        jsonPatch(`${nutritionUrl}/pantry`, { foodId: "food-1", inStockGrams: 800 }),
      ),
      nutritionPlanPost(jsonPost(`${nutritionUrl}/plan`, mealPlan())),
      nutritionPlanDelete(
        new Request(`${nutritionUrl}/plan/plan-1`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id: "plan-1" }) },
      ),
    ]);

    expect(reads.map((response) => response.status)).toEqual([200, 200]);
    expect(writes.map((response) => response.status)).toEqual(
      Array.from({ length: writes.length }, () => 403),
    );
    for (const response of writes) {
      expect(await response.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
    }
  });

  it("holds the protein override behind both the adult and mutation gates", async () => {
    harness.state.membership = membership("viewer", "child");
    const child = await nutritionTargetPatch(
      jsonPatch(targetUrl, { proteinTargetG: 190 }),
    );

    harness.state.membership = membership("viewer");
    const viewer = await nutritionTargetPatch(
      jsonPatch(targetUrl, { proteinTargetG: 190 }),
    );

    harness.state.membership = membership("adult");
    const adult = await nutritionTargetPatch(
      jsonPatch(targetUrl, { proteinTargetG: 190 }),
    );

    expect(child.status).toBe(403);
    expect(await child.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(viewer.status).toBe(403);
    expect(await viewer.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
    expect(adult.status).toBe(200);
  });

  it("refuses nutrition writes that arrive from another site", async () => {
    const response = await nutritionFoodsPost(
      new Request(`${nutritionUrl}/foods`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://elak.example",
        },
        body: JSON.stringify(food()),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses a cross-site protein override", async () => {
    const response = await nutritionTargetPatch(
      new Request(targetUrl, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://elak.example",
        },
        body: JSON.stringify({ proteinTargetG: 190 }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses a meal-day filter it does not understand", async () => {
    const response = await nutritionMealsGet(
      new Request(`${mealsUrl}?userId=someone-else`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("accepts only a real calendar date as the planning week", async () => {
    const unknown = await nutritionPlanGet(
      new Request(`${nutritionUrl}/plan?userId=someone-else`),
    );
    const invalid = await nutritionPlanGet(
      new Request(`${nutritionUrl}/plan?vecka=2026-02-31`),
    );

    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts route-safe ids and rejects path-shaped ids on both delete routes", async () => {
    const deleteMeal = (id: string) =>
      nutritionMealDelete(
        new Request(`${mealsUrl}/${id}`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id }) },
      );
    const deleteSupplement = (id: string) =>
      nutritionSupplementDelete(
        new Request(`${nutritionUrl}/supplements/${id}`, {
          method: "DELETE",
          headers: { origin: "http://localhost" },
        }),
        { params: Promise.resolve({ id }) },
      );

    const unsafeMeal = await deleteMeal("../batches/batch-1");
    const unsafeSupplement = await deleteSupplement("../supplement-1");
    const safeMeal = await deleteMeal("meal-1");
    const safeSupplement = await deleteSupplement("supplement_1");

    expect(unsafeMeal.status).toBe(400);
    expect(await unsafeMeal.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(unsafeSupplement.status).toBe(400);
    expect(await unsafeSupplement.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(safeMeal.status).toBe(200);
    expect(safeSupplement.status).toBe(200);
  });
});

describe("The diary is the most closed door in the workspace", () => {
  const journalUrl = "http://localhost/api/project100/journal";

  function written() {
    return {
      writtenOn: "2026-08-26",
      body: "Kändes starkt idag",
      mood: 4,
      energy: 3,
      sleepHours: 7.5,
      excludedFromAi: true,
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it admits that a diary exists", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    expect((await journalGet(new Request(journalUrl))).status).toBe(401);
    expect((await journalPost(jsonPost(journalUrl, written()))).status).toBe(401);
  });

  it("keeps a child in the household out of an adult's writing", async () => {
    harness.state.membership = membership("viewer", "child");

    const read = await journalGet(new Request(journalUrl));

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
  });

  it("keeps a read-only adult from writing in it", async () => {
    harness.state.membership = membership("viewer");

    expect((await journalGet(new Request(journalUrl))).status).toBe(200);
    const write = await journalPost(jsonPost(journalUrl, written()));
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses a filter it does not understand", async () => {
    const response = await journalGet(new Request(`${journalUrl}?userId=someone-else`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("refuses an entry with neither writing nor a check-in in it", async () => {
    const response = await journalPost(
      jsonPost(journalUrl, {
        writtenOn: "2026-08-26",
        body: null,
        mood: null,
        energy: null,
        sleepHours: null,
        excludedFromAi: false,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a day that is not a real date", async () => {
    const response = await journalDelete(
      new Request(`${journalUrl}/2026-13-01`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ date: "2026-13-01" }) },
    );

    expect(response.status).toBe(400);
  });

  it("refuses writing posted from another site", async () => {
    const response = await journalPost(
      new Request(journalUrl, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://elak.example" },
        body: JSON.stringify(written()),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("Projekt 100 insights is held behind the adult gate", () => {
  const insightsUrl = "http://localhost/api/project100/insights?period=30d";

  it("answers 401 for anonymous and 403 for a child, 200 for an adult", async () => {
    harness.state.session = null;
    harness.state.membership = null;
    expect((await insightsGet(new Request(insightsUrl))).status).toBe(401);

    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    expect((await insightsGet(new Request(insightsUrl))).status).toBe(403);

    harness.state.membership = membership("adult");
    expect((await insightsGet(new Request(insightsUrl))).status).toBe(200);
  });
});

describe("Projekt 100 Jarvis is held behind the adult gate and requires CSRF on writes", () => {
  const convUrl = "http://localhost/api/project100/jarvis/conversations";
  const msgUrl = "http://localhost/api/project100/jarvis/messages";
  const memUrl = "http://localhost/api/project100/jarvis/memories";

  it("guards conversations", async () => {
    harness.state.session = null;
    harness.state.membership = null;
    expect((await jarvisConversationsGet(new Request(convUrl))).status).toBe(401);

    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    expect((await jarvisConversationsGet(new Request(convUrl))).status).toBe(403);

    harness.state.membership = membership("adult");
    expect((await jarvisConversationsGet(new Request(convUrl))).status).toBe(200);
  });

  it("guards messages", async () => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    const child = await jarvisMessagePost(
      jsonPost(msgUrl, { content: "Hur går det?" }),
    );
    expect(child.status).toBe(403);

    harness.state.membership = membership("adult");
    const adult = await jarvisMessagePost(
      jsonPost(msgUrl, { content: "Hur går det?" }),
    );
    expect(adult.status).toBe(200);
  });

  it("guards memories", async () => {
    harness.state.session = null;
    harness.state.membership = null;
    expect((await jarvisMemoriesGet(new Request(memUrl))).status).toBe(401);

    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("adult");
    expect((await jarvisMemoriesGet(new Request(memUrl))).status).toBe(200);

    const created = await jarvisMemoriesPost(
      jsonPost(memUrl, {
        kind: "learning",
        category: "recovery",
        content: "Träna inte sent",
      }),
    );
    expect(created.status).toBe(201);
  });
});

describe("Projekt 100 Content is held behind the adult gate and requires CSRF on writes", () => {
  const projectsUrl = "http://localhost/api/project100/content/projects";
  const itemUrl = "http://localhost/api/project100/content/projects/proj-1";
  const mediaUrl = "http://localhost/api/project100/content/projects/proj-1/media";
  const suggestionsUrl = "http://localhost/api/project100/content/suggestions";

  it("guards project listings", async () => {
    harness.state.session = null;
    harness.state.membership = null;
    expect((await contentProjectsGet(new Request(projectsUrl))).status).toBe(401);

    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    expect((await contentProjectsGet(new Request(projectsUrl))).status).toBe(403);

    harness.state.membership = membership("adult");
    expect((await contentProjectsGet(new Request(projectsUrl))).status).toBe(200);
  });

  it("guards project creation", async () => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    const child = await contentProjectsPost(
      jsonPost(projectsUrl, { title: "Vlogg #1" }),
    );
    expect(child.status).toBe(403);

    harness.state.membership = membership("adult");
    const adult = await contentProjectsPost(
      jsonPost(projectsUrl, { title: "Vlogg #1" }),
    );
    expect(adult.status).toBe(201);
  });

  it("guards project media attachment", async () => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    const child = await contentMediaPost(
      jsonPost(mediaUrl, { mediaId: "med-1" }),
      { params: Promise.resolve({ id: "proj-1" }) },
    );
    expect(child.status).toBe(403);

    harness.state.membership = membership("adult");
    const adult = await contentMediaPost(
      jsonPost(mediaUrl, { mediaId: "med-1" }),
      { params: Promise.resolve({ id: "proj-1" }) },
    );
    expect(adult.status).toBe(201);
  });

  it("guards content suggestions", async () => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");
    const child = await contentSuggestionsPost(
      jsonPost(suggestionsUrl, {}),
    );
    expect(child.status).toBe(403);

    harness.state.membership = membership("adult");
    const adult = await contentSuggestionsPost(
      jsonPost(suggestionsUrl, {}),
    );
    expect(adult.status).toBe(200);
  });

  it("guards jarvis capability gaps list and status update", async () => {
    const gapsUrl = "http://localhost/api/project100/jarvis/gaps";
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");

    const childGet = await jarvisGapsGet(new Request(gapsUrl));
    expect(childGet.status).toBe(403);

    const childPatch = await jarvisGapsPatch(
      jsonPatch(`${gapsUrl}/gap-1`, { status: "implemented" }),
      { params: Promise.resolve({ id: "gap-1" }) },
    );
    expect(childPatch.status).toBe(403);

    harness.state.membership = membership("adult");
    const adultGet = await jarvisGapsGet(new Request(gapsUrl));
    expect(adultGet.status).toBe(200);

    const adultPatch = await jarvisGapsPatch(
      jsonPatch(`${gapsUrl}/gap-1`, { status: "implemented" }),
      { params: Promise.resolve({ id: "gap-1" }) },
    );
    expect(adultPatch.status).toBe(200);
  });

  it("guards jarvis speak speech synthesis", async () => {
    const speakUrl = "http://localhost/api/project100/jarvis/speak";
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");

    const child = await jarvisSpeakPost(
      jsonPost(speakUrl, { text: "God kväll Jimmy!" }),
    );
    expect(child.status).toBe(403);

    harness.state.membership = membership("adult");
    const adult = await jarvisSpeakPost(
      jsonPost(speakUrl, { text: "God kväll Jimmy!" }),
    );
    expect(adult.status).toBe(200);
  });

  it("guards jarvis daily briefings (GET and POST)", async () => {
    const briefingUrl = "http://localhost/api/project100/jarvis/briefing";
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("viewer", "child");

    const childGet = await jarvisBriefingGet(
      new Request(`${briefingUrl}?type=morning`),
    );
    expect(childGet.status).toBe(403);

    const childPost = await jarvisBriefingPost(
      jsonPost(briefingUrl, { type: "morning" }),
    );
    expect(childPost.status).toBe(403);

    harness.state.membership = membership("adult");
    const adultGet = await jarvisBriefingGet(
      new Request(`${briefingUrl}?type=morning`),
    );
    expect(adultGet.status).toBe(200);

    const adultPost = await jarvisBriefingPost(
      jsonPost(briefingUrl, { type: "evening" }),
    );
    expect(adultPost.status).toBe(200);
  });
});
