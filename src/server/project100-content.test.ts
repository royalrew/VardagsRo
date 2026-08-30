import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  interface Call {
    text: string;
    values: unknown[];
  }

  const calls: Call[] = [];
  const state = {
    projects: [] as {
      id: string;
      userId: string;
      title: string;
      hook: string | null;
      concept: string | null;
      script: string | null;
      status: string;
      targetPublishDate: string | null;
      publishedUrl: string | null;
      publishedAt: string | null;
      thumbnailIdeas: unknown[];
      shotlist: unknown[];
      createdAt: string;
      updatedAt: string;
    }[],
    media: [] as {
      id: string;
      userId: string;
      capturedOn: string;
      category: string;
      original_key: string;
      preview_key: string | null;
    }[],
    contentMedia: [] as {
      projectId: string;
      mediaId: string;
      userId: string;
      caption: string | null;
      position: number;
    }[],
  };

  function reset() {
    calls.length = 0;
    state.projects = [
      {
        id: "proj-1",
        userId: "user-test",
        title: "Vlogg #10",
        hook: "Hur jag tränade i veckan",
        concept: "Träning och kost runt jobb",
        script: "Intro...",
        status: "draft",
        targetPublishDate: "2026-09-01",
        publishedUrl: null,
        publishedAt: null,
        thumbnailIdeas: [],
        shotlist: [{ id: "s-1", title: "Gym intro", completed: false, note: null }],
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
      },
      {
        id: "proj-other",
        userId: "user-elsewhere",
        title: "Annan användares video",
        hook: null,
        concept: null,
        script: null,
        status: "idea",
        targetPublishDate: null,
        publishedUrl: null,
        publishedAt: null,
        thumbnailIdeas: [],
        shotlist: [],
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
      },
    ];

    state.media = [
      {
        id: "med-1",
        userId: "user-test",
        capturedOn: "2026-08-30",
        category: "body",
        original_key: "p100/user-test/body/med-1-orig.jpg",
        preview_key: "p100/user-test/body/med-1-prev.jpg",
      },
      {
        id: "med-other",
        userId: "user-elsewhere",
        capturedOn: "2026-08-30",
        category: "body",
        original_key: "p100/user-elsewhere/body/med-other-orig.jpg",
        preview_key: "p100/user-elsewhere/body/med-other-prev.jpg",
      },
    ];

    state.contentMedia = [
      {
        projectId: "proj-1",
        mediaId: "med-1",
        userId: "user-test",
        caption: "Startbild",
        position: 0,
      },
    ];
  }

  async function execute(text: string, values: unknown[]) {
    if (text.includes("from project100_content_projects") && text.includes("select")) {
      const userId = values[0] as string;
      if (text.includes("where id =")) {
        const id = values[0] as string;
        const uId = values[1] as string;
        return state.projects.filter((p) => p.id === id && p.userId === uId);
      }
      return state.projects
        .filter((p) => p.userId === userId)
        .map((p) => ({
          id: p.id,
          user_id: p.userId,
          title: p.title,
          hook: p.hook,
          concept: p.concept,
          script: p.script,
          status: p.status,
          target_publish_date: p.targetPublishDate,
          published_url: p.publishedUrl,
          published_at: p.publishedAt,
          thumbnail_ideas: p.thumbnailIdeas,
          shotlist: p.shotlist,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        }));
    }

    if (text.includes("from project100_content_media cm")) {
      const projId = values[0] as string;
      const userId = values[1] as string;
      return state.contentMedia
        .filter((cm) => cm.projectId === projId && cm.userId === userId)
        .map((cm) => ({
          media_id: cm.mediaId,
          caption: cm.caption,
          position: cm.position,
          captured_on: "2026-08-30",
          category: "body",
          original_key: "p100/user-test/body/med-1-orig.jpg",
          preview_key: "p100/user-test/body/med-1-prev.jpg",
        }));
    }

    if (text.includes("insert into project100_content_projects")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const title = values[2] as string;
      const hook = values[3] as string | null;
      const concept = values[4] as string | null;
      const script = values[5] as string | null;
      const status = values[6] as string;
      const targetPublishDate = values[7] as string | null;
      const entry = {
        id,
        userId,
        title,
        hook,
        concept,
        script,
        status,
        targetPublishDate,
        publishedUrl: null,
        publishedAt: null,
        thumbnailIdeas: [],
        shotlist: [],
        createdAt: "2026-08-30T12:00:00Z",
        updatedAt: "2026-08-30T12:00:00Z",
      };
      state.projects.push(entry);
      return [
        {
          id,
          user_id: userId,
          title,
          hook,
          concept,
          script,
          status,
          target_publish_date: targetPublishDate,
          published_url: null,
          published_at: null,
          thumbnail_ideas: [],
          shotlist: [],
          created_at: "2026-08-30T12:00:00Z",
          updated_at: "2026-08-30T12:00:00Z",
        },
      ];
    }

    if (text.includes("update project100_content_projects")) {
      const id = values[11] as string;
      const userId = values[12] as string;
      const proj = state.projects.find((p) => p.id === id && p.userId === userId);
      if (proj) {
        if (values[0] !== null) proj.title = values[0] as string;
        if (values[4] !== null) proj.status = values[4] as string;
        return [
          {
            id: proj.id,
            user_id: proj.userId,
            title: proj.title,
            hook: proj.hook,
            concept: proj.concept,
            script: proj.script,
            status: proj.status,
            target_publish_date: proj.targetPublishDate,
            published_url: proj.publishedUrl,
            published_at: proj.publishedAt,
            thumbnail_ideas: proj.thumbnailIdeas,
            shotlist: proj.shotlist,
            created_at: proj.createdAt,
            updated_at: "2026-08-30T12:05:00Z",
          },
        ];
      }
      return [];
    }

    if (text.includes("delete from project100_content_projects")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const index = state.projects.findIndex((p) => p.id === id && p.userId === userId);
      if (index >= 0) {
        state.projects.splice(index, 1);
        return [{ id }];
      }
      return [];
    }

    if (text.includes("from project100_media") && text.includes("select id")) {
      const mediaId = values[0] as string;
      const userId = values[1] as string;
      return state.media.filter((m) => m.id === mediaId && m.userId === userId);
    }

    if (text.includes("insert into project100_content_media")) {
      const projId = values[0] as string;
      const mediaId = values[1] as string;
      const userId = values[2] as string;
      const caption = values[3] as string | null;
      const position = values[4] as number;
      state.contentMedia.push({
        projectId: projId,
        mediaId,
        userId,
        caption,
        position,
      });
      return [{ project_id: projId }];
    }

    if (text.includes("delete from project100_content_media")) {
      const projId = values[0] as string;
      const mediaId = values[1] as string;
      const userId = values[2] as string;
      const idx = state.contentMedia.findIndex(
        (cm) => cm.projectId === projId && cm.mediaId === mediaId && cm.userId === userId,
      );
      if (idx >= 0) {
        state.contentMedia.splice(idx, 1);
        return [{ project_id: projId }];
      }
      return [];
    }

    if (text.includes("from project100_training_sessions")) {
      return [{ count: 3 }];
    }

    if (text.includes("from project100_body_measurements")) {
      return [{ value: 85.0 }, { value: 84.0 }];
    }

    if (text.includes("family_audit_log") || text.includes("insert into app_audit_logs")) {
      return [{ id: "audit-1" }];
    }

    throw new Error(`Unexpected query in test: ${text}`);
  }

  function createTag() {
    const fn = vi.fn((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
      if (!("raw" in strings)) return { list: [...strings] };
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values });
      return execute(text, values);
    });
    (fn as unknown as { json: (val: unknown) => string }).json = (val: unknown) => JSON.stringify(val);
    return fn;
  }

  const sql = createTag();
  reset();
  return { calls, reset, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
  openAIConfig: () => null,
}));
vi.mock("@/server/project100-media", () => ({
  loadProject100MediaLibrary: vi.fn(async () => ({ items: [], counts: {} })),
}));
vi.mock("@/server/storage", () => ({
  storageIsConfigured: () => true,
  signedProject100MediaUrl: vi.fn(async (_u, key) => `https://signed.test/${key}`),
}));

import {
  attachProject100ContentMedia,
  createProject100ContentProject,
  deleteProject100ContentProject,
  detachProject100ContentMedia,
  generateProject100ContentSuggestions,
  loadProject100ContentWorkspace,
  updateProject100ContentProject,
} from "@/server/project100-content";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("Project 100 Content Server", () => {
  beforeEach(() => {
    database.reset();
  });

  it("denies access to non-adult actors", async () => {
    await expect(loadProject100ContentWorkspace(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
  });

  it("loads only projects owned by the actor", async () => {
    const workspace = await loadProject100ContentWorkspace(TEST_ACTOR);
    expect(workspace.projects.length).toBe(1);
    expect(workspace.projects[0].id).toBe("proj-1");
    expect(workspace.activeProject?.id).toBe("proj-1");
    expect(workspace.activeProject?.media.length).toBe(1);
  });

  it("creates, updates, and deletes projects with actor isolation", async () => {
    const created = await createProject100ContentProject(TEST_ACTOR, {
      title: "Ny träningsvlogg",
      hook: "Kolla in marklyften",
      status: "idea",
    });
    expect(created.title).toBe("Ny träningsvlogg");
    expect(created.status).toBe("idea");

    const updated = await updateProject100ContentProject(TEST_ACTOR, created.id, {
      status: "filmed",
    });
    expect(updated.status).toBe("filmed");

    const deleted = await deleteProject100ContentProject(TEST_ACTOR, created.id);
    expect(deleted).toBe(true);

    // Cannot delete another user's project
    await expect(
      deleteProject100ContentProject(TEST_ACTOR, "proj-other"),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });
  });

  it("attaches and detaches media to/from projects safely", async () => {
    const attached = await attachProject100ContentMedia(TEST_ACTOR, "proj-1", {
      mediaId: "med-1",
      caption: "Uppvärmning",
    });
    expect(attached.mediaId).toBe("med-1");
    expect(attached.caption).toBe("Uppvärmning");

    const detached = await detachProject100ContentMedia(TEST_ACTOR, "proj-1", "med-1");
    expect(detached).toBe(true);

    // Cannot attach another user's media
    await expect(
      attachProject100ContentMedia(TEST_ACTOR, "proj-1", { mediaId: "med-other" }),
    ).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
      status: 404,
    });
  });

  it("generates editorial suggestions based on recent workouts and weight", async () => {
    const suggestions = await generateProject100ContentSuggestions(TEST_ACTOR);
    expect(suggestions.hook).toContain("genomförda träningspass");
    expect(suggestions.titleIdeas.length).toBeGreaterThanOrEqual(3);
  });
});
