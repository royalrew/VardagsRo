import {
  buildDeterministicContentSuggestion,
  type EditorContextData,
  type EditorSuggestion,
  type Project100AttachedMedia,
  type Project100ContentProject,
  type Project100ContentStatus,
  type Project100ContentWorkspace,
  type Project100ShotlistItem,
  type Project100ThumbnailIdea,
} from "@/lib/project100-content";
import type { ActorContext } from "@/server/authorization-types";
import { openAIConfig } from "@/server/config";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { recordAudit } from "@/server/audit";
import { assertProject100Adult } from "@/server/project100";
import { loadProject100MediaLibrary } from "@/server/project100-media";
import { signedProject100MediaUrl, storageIsConfigured } from "@/server/storage";
import type {
  AttachMediaInput,
  CreateContentProjectInput,
  UpdateContentProjectInput,
} from "@/server/project100-content-schemas";

const URL_TTL_SECONDS = 300;

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  hook: string | null;
  concept: string | null;
  script: string | null;
  status: Project100ContentStatus;
  target_publish_date: string | null;
  published_url: string | null;
  published_at: string | null;
  thumbnail_ideas: Project100ThumbnailIdea[] | string;
  shotlist: Project100ShotlistItem[] | string;
  created_at: string;
  updated_at: string;
}

interface AttachedMediaRow {
  media_id: string;
  caption: string | null;
  position: number;
  captured_on: string;
  category: string;
  original_key: string;
  preview_key: string | null;
}

function parseJsonArray<T>(val: T[] | string | null | undefined): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

async function signPreviewUrl(
  userId: string,
  previewKey: string | null,
  originalKey: string,
): Promise<string | null> {
  if (!storageIsConfigured()) return null;
  const key = previewKey ?? originalKey;
  try {
    return await signedProject100MediaUrl(userId, key, URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

function mapProjectRow(
  row: ProjectRow,
  media: Project100AttachedMedia[] = [],
): Project100ContentProject {
  return {
    id: row.id,
    title: row.title,
    hook: row.hook,
    concept: row.concept,
    script: row.script,
    status: row.status,
    targetPublishDate: row.target_publish_date,
    publishedUrl: row.published_url,
    publishedAt: row.published_at,
    thumbnailIdeas: parseJsonArray<Project100ThumbnailIdea>(row.thumbnail_ideas),
    shotlist: parseJsonArray<Project100ShotlistItem>(row.shotlist),
    media,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadProject100ContentWorkspace(
  actor: ActorContext,
  projectId?: string | null,
): Promise<Project100ContentWorkspace> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const [projectRows, library] = await Promise.all([
    sql<ProjectRow[]>`
      select id, user_id, title, hook, concept, script, status,
             target_publish_date, published_url,
             to_char(published_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as published_at,
             thumbnail_ideas, shotlist,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
             to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from project100_content_projects
      where user_id = ${actor.userId}
      order by
        case status
          when 'idea' then 1
          when 'draft' then 2
          when 'filmed' then 3
          when 'edited' then 4
          when 'published' then 5
          else 6
        end,
        updated_at desc
    `,
    loadProject100MediaLibrary(actor, { category: null, limit: 40 }),
  ]);

  const activeProjectRow = projectId
    ? projectRows.find((p) => p.id === projectId) ?? null
    : projectRows[0] ?? null;

  let activeProject: Project100ContentProject | null = null;

  if (activeProjectRow) {
    const attachedRows = await sql<AttachedMediaRow[]>`
      select cm.media_id, cm.caption, cm.position,
             m.captured_on, m.category, m.original_key, m.preview_key
      from project100_content_media cm
      join project100_media m on m.id = cm.media_id and m.user_id = cm.user_id
      where cm.project_id = ${activeProjectRow.id} and cm.user_id = ${actor.userId}
      order by cm.position asc, cm.created_at asc
    `;

    const attachedMedia: Project100AttachedMedia[] = await Promise.all(
      attachedRows.map(async (row) => ({
        mediaId: row.media_id,
        caption: row.caption,
        position: row.position,
        previewUrl: await signPreviewUrl(actor.userId, row.preview_key, row.original_key),
        capturedOn: row.captured_on,
        category: row.category,
      })),
    );

    activeProject = mapProjectRow(activeProjectRow, attachedMedia);
  }

  const projects = projectRows.map((p) =>
    p.id === activeProject?.id ? activeProject : mapProjectRow(p),
  );

  return {
    projects,
    activeProject,
    availableMedia: library.items,
  };
}

export async function createProject100ContentProject(
  actor: ActorContext,
  input: CreateContentProjectInput,
): Promise<Project100ContentProject> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const id = crypto.randomUUID();

  const rows = await sql<ProjectRow[]>`
    insert into project100_content_projects (
      id, user_id, title, hook, concept, script, status, target_publish_date
    ) values (
      ${id}, ${actor.userId}, ${input.title}, ${input.hook ?? null},
      ${input.concept ?? null}, ${input.script ?? null}, ${input.status ?? "idea"},
      ${input.targetPublishDate ?? null}
    )
    returning id, user_id, title, hook, concept, script, status,
              target_publish_date, published_url,
              to_char(published_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as published_at,
              thumbnail_ideas, shotlist,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  await recordAudit(sql, actor, {
    action: "project100.content.project.create",
    targetType: "project100_content_project",
    targetId: id,
  });

  return mapProjectRow(rows[0], []);
}

export async function updateProject100ContentProject(
  actor: ActorContext,
  id: string,
  input: UpdateContentProjectInput,
): Promise<Project100ContentProject> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<ProjectRow[]>`
    update project100_content_projects
    set title = coalesce(${input.title ?? null}, title),
        hook = coalesce(${input.hook ?? null}, hook),
        concept = coalesce(${input.concept ?? null}, concept),
        script = coalesce(${input.script ?? null}, script),
        status = coalesce(${input.status ?? null}, status),
        target_publish_date = coalesce(${input.targetPublishDate ?? null}, target_publish_date),
        published_url = coalesce(${input.publishedUrl ?? null}, published_url),
        published_at = case
          when ${input.publishedAt !== undefined} then ${input.publishedAt ? new Date(input.publishedAt) : null}
          else published_at
        end,
        thumbnail_ideas = coalesce(${input.thumbnailIdeas ? JSON.stringify(input.thumbnailIdeas) : null}::jsonb, thumbnail_ideas),
        shotlist = coalesce(${input.shotlist ? JSON.stringify(input.shotlist) : null}::jsonb, shotlist),
        updated_at = now()
    where id = ${id} and user_id = ${actor.userId}
    returning id, user_id, title, hook, concept, script, status,
              target_publish_date, published_url,
              to_char(published_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as published_at,
              thumbnail_ideas, shotlist,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  if (rows.length === 0) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Innehållsprojektet hittades inte.");
  }

  await recordAudit(sql, actor, {
    action: "project100.content.project.update",
    targetType: "project100_content_project",
    targetId: id,
  });

  // Reload attached media
  const attachedRows = await sql<AttachedMediaRow[]>`
    select cm.media_id, cm.caption, cm.position,
           m.captured_on, m.category, m.original_key, m.preview_key
    from project100_content_media cm
    join project100_media m on m.id = cm.media_id and m.user_id = cm.user_id
    where cm.project_id = ${id} and cm.user_id = ${actor.userId}
    order by cm.position asc, cm.created_at asc
  `;

  const attachedMedia: Project100AttachedMedia[] = await Promise.all(
    attachedRows.map(async (row) => ({
      mediaId: row.media_id,
      caption: row.caption,
      position: row.position,
      previewUrl: await signPreviewUrl(actor.userId, row.preview_key, row.original_key),
      capturedOn: row.captured_on,
      category: row.category,
    })),
  );

  return mapProjectRow(rows[0], attachedMedia);
}

export async function deleteProject100ContentProject(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<{ id: string }[]>`
    delete from project100_content_projects
    where id = ${id} and user_id = ${actor.userId}
    returning id
  `;

  if (rows.length === 0) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Innehållsprojektet hittades inte.");
  }

  await recordAudit(sql, actor, {
    action: "project100.content.project.delete",
    targetType: "project100_content_project",
    targetId: id,
  });

  return true;
}

export async function attachProject100ContentMedia(
  actor: ActorContext,
  projectId: string,
  input: AttachMediaInput,
): Promise<Project100AttachedMedia> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  // Verify project and media ownership
  const [projectExists, mediaRows] = await Promise.all([
    sql<{ id: string }[]>`
      select id from project100_content_projects
      where id = ${projectId} and user_id = ${actor.userId}
    `,
    sql<{ id: string; captured_on: string; category: string; original_key: string; preview_key: string | null }[]>`
      select id, captured_on, category, original_key, preview_key from project100_media
      where id = ${input.mediaId} and user_id = ${actor.userId}
    `,
  ]);

  if (projectExists.length === 0) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Projektet hittades inte.");
  }
  if (mediaRows.length === 0) {
    throw new AppError(404, "MEDIA_NOT_FOUND", "Mediafilen hittades inte.");
  }

  const media = mediaRows[0];
  const position = input.position ?? 0;

  await sql`
    insert into project100_content_media (
      project_id, media_id, user_id, caption, position
    ) values (
      ${projectId}, ${input.mediaId}, ${actor.userId},
      ${input.caption ?? null}, ${position}
    )
    on conflict (project_id, media_id, user_id)
    do update set
      caption = excluded.caption,
      position = excluded.position
  `;

  await recordAudit(sql, actor, {
    action: "project100.content.media.attach",
    targetType: "project100_content_project",
    targetId: projectId,
  });

  return {
    mediaId: media.id,
    caption: input.caption ?? null,
    position,
    previewUrl: await signPreviewUrl(actor.userId, media.preview_key, media.original_key),
    capturedOn: media.captured_on,
    category: media.category,
  };
}

export async function detachProject100ContentMedia(
  actor: ActorContext,
  projectId: string,
  mediaId: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<{ project_id: string }[]>`
    delete from project100_content_media
    where project_id = ${projectId} and media_id = ${mediaId} and user_id = ${actor.userId}
    returning project_id
  `;

  if (rows.length === 0) {
    throw new AppError(404, "MEDIA_NOT_ATTACHED", "Mediet var inte kopplat till projektet.");
  }

  await recordAudit(sql, actor, {
    action: "project100.content.media.detach",
    targetType: "project100_content_project",
    targetId: projectId,
  });

  return true;
}

export async function generateProject100ContentSuggestions(
  actor: ActorContext,
): Promise<EditorSuggestion> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const [workoutRows, bodyRows] = await Promise.all([
    sql<{ count: number }[]>`
      select count(*)::int as count
      from project100_training_sessions
      where user_id = ${actor.userId}
        and session_date >= (current_date - 14)::text
        and status = 'completed'
    `,
    sql<{ value: number }[]>`
      select value
      from project100_body_measurements
      where user_id = ${actor.userId}
        and metric = 'weight'
      order by measured_on desc
      limit 2
    `,
  ]);

  const recentWorkoutsCount = workoutRows[0]?.count ?? 0;
  let totalWeightDeltaKg: number | null = null;
  if (bodyRows.length >= 2) {
    totalWeightDeltaKg = Math.round((bodyRows[0].value - bodyRows[1].value) * 10) / 10;
  }

  const contextData: EditorContextData = {
    recentWorkoutsCount,
    totalWeightDeltaKg,
    notableMilestone: null,
  };

  const ai = openAIConfig();
  if (ai) {
    return buildDeterministicContentSuggestion(contextData);
  }

  return buildDeterministicContentSuggestion(contextData);
}
