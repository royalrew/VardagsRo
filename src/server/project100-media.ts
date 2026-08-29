import "server-only";

import { createHash } from "node:crypto";

import {
  emptyProject100MediaCounts,
  type Project100MediaCategory,
  type Project100MediaItem,
  type Project100MediaLibrary,
} from "@/lib/project100-media";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  Project100MediaCreateInput,
  Project100MediaFilter,
} from "@/server/project100-media-schemas";
import {
  deleteProject100MediaObject,
  signedProject100MediaUrl,
  storageIsConfigured,
  uploadProject100Media,
  validateProject100Image,
  type Project100ImageMimeType,
} from "@/server/storage";

const URL_TTL_SECONDS = 300;

interface MediaRow {
  id: string;
  category: Project100MediaCategory;
  captured_on: string;
  caption: string | null;
  original_key: string;
  original_bytes: number | string;
  preview_key: string | null;
  width: number | string | null;
  height: number | string | null;
  session_id: string | null;
  session_title: string | null;
  created_at: Date | string;
}

interface CategoryCountRow {
  category: Project100MediaCategory;
  total: number | string;
}

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * A preview address is signed for this reader, right now, and lives only in the
 * response. Nothing in the database ever holds a URL that would still open a
 * body picture after the page is closed.
 */
async function withSignedPreview(
  userId: string,
  row: MediaRow,
): Promise<Project100MediaItem> {
  const key = row.preview_key;
  let previewUrl: string | null = null;
  if (key !== null && storageIsConfigured()) {
    try {
      previewUrl = await signedProject100MediaUrl(userId, key, URL_TTL_SECONDS);
    } catch {
      // A gallery with one unreadable thumbnail is still worth showing.
      previewUrl = null;
    }
  }
  return {
    id: row.id,
    category: row.category,
    capturedOn: row.captured_on.slice(0, 10),
    caption: row.caption,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    width: asNumber(row.width),
    height: asNumber(row.height),
    originalBytes: asNumber(row.original_bytes) ?? 0,
    hasPreview: key !== null,
    previewUrl,
    createdAt: asIso(row.created_at),
  };
}

export async function loadProject100MediaLibrary(
  actor: ActorContext,
  filter: Project100MediaFilter = { category: null, limit: 60 },
): Promise<Project100MediaLibrary> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const [rows, countRows] = await Promise.all([
    sql<MediaRow[]>`
      select m.id, m.category, to_char(m.captured_on, 'YYYY-MM-DD') as captured_on,
             m.caption, m.original_key, m.original_bytes, m.preview_key,
             m.width, m.height, m.session_id, s.title as session_title, m.created_at
      from project100_media m
      left join project100_training_sessions s
        on s.id = m.session_id and s.user_id = m.user_id
      where m.user_id = ${actor.userId}
        and (${filter.category}::text is null or m.category = ${filter.category})
      order by m.captured_on desc, m.created_at desc, m.id desc
      limit ${filter.limit}
    `,
    sql<CategoryCountRow[]>`
      select category, count(*)::int as total
      from project100_media
      where user_id = ${actor.userId}
      group by category
    `,
  ]);

  const counts = emptyProject100MediaCounts();
  for (const row of countRows) {
    counts[row.category] = asNumber(row.total) ?? 0;
  }

  return {
    items: await Promise.all(rows.map((row) => withSignedPreview(actor.userId, row))),
    counts,
    urlExpiresInSeconds: URL_TTL_SECONDS,
    storageConfigured: storageIsConfigured(),
  };
}

export interface Project100SessionOption {
  id: string;
  title: string;
  sessionDate: string;
}

/** Just enough of a session to attach a picture to it, without loading its sets. */
export async function loadProject100SessionOptions(
  actor: ActorContext,
): Promise<Project100SessionOption[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<{ id: string; title: string; session_date: string }[]>`
    select id, title, to_char(session_date, 'YYYY-MM-DD') as session_date
    from project100_training_sessions
    where user_id = ${actor.userId}
    order by session_date desc, created_at desc, id desc
    limit 30
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionDate: row.session_date.slice(0, 10),
  }));
}

export interface Project100MediaUpload {
  bytes: Uint8Array;
  declaredMimeType: string;
}

/**
 * Stores the original, then the row. If the row cannot be written the objects
 * are removed again, so a picture never survives outside the index that is the
 * only way for the owner to find and delete it.
 */
export async function createProject100Media(
  actor: ActorContext,
  input: Project100MediaCreateInput,
  files: { original: Project100MediaUpload; preview: Project100MediaUpload | null },
): Promise<Project100MediaItem> {
  assertProject100Adult(actor);

  const originalMime = validateProject100Image(
    files.original.bytes,
    files.original.declaredMimeType,
  );
  let preview: { bytes: Uint8Array; mimeType: Project100ImageMimeType } | null = null;
  if (files.preview) {
    try {
      preview = {
        bytes: files.preview.bytes,
        mimeType: validateProject100Image(
          files.preview.bytes,
          files.preview.declaredMimeType,
        ),
      };
    } catch {
      // The browser made the preview; a bad one is not worth losing the memory.
      preview = null;
    }
  }

  const sql = await readyClient();
  if (input.sessionId !== null) {
    const owned = await sql<{ id: string }[]>`
      select id from project100_training_sessions
      where id = ${input.sessionId} and user_id = ${actor.userId}
      limit 1
    `;
    if (!owned[0]) {
      throw new AppError(404, "PROJECT100_SESSION_NOT_FOUND", "Passet finns inte.");
    }
  }

  const mediaId = crypto.randomUUID();
  const sha256 = createHash("sha256").update(files.original.bytes).digest("hex");
  const keys = await uploadProject100Media({
    userId: actor.userId,
    mediaId,
    category: input.category,
    sha256,
    original: { bytes: files.original.bytes, mimeType: originalMime },
    preview,
  });

  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into project100_media
          (id, user_id, category, captured_on, caption, original_key, original_mime,
           original_bytes, preview_key, preview_bytes, width, height, sha256, session_id)
        values
          (${mediaId}, ${actor.userId}, ${input.category}, ${input.capturedOn},
           ${input.caption}, ${keys.originalKey}, ${originalMime},
           ${files.original.bytes.byteLength}, ${keys.previewKey},
           ${keys.previewKey === null ? null : (preview?.bytes.byteLength ?? null)},
           ${input.width}, ${input.height}, ${sha256}, ${input.sessionId})
      `;
      await recordAudit(tx, actor, {
        action: "project100.media.create",
        targetType: "project100_media",
        targetId: mediaId,
        metadata: { category: input.category },
      });
    });
  } catch (cause) {
    await deleteProject100MediaObject(actor.userId, keys.originalKey);
    if (keys.previewKey) {
      await deleteProject100MediaObject(actor.userId, keys.previewKey);
    }
    throw new AppError(503, "PROJECT100_MEDIA_NOT_SAVED", "Bilden kunde inte sparas.", {
      cause,
    });
  }

  const created = await sql<MediaRow[]>`
    select m.id, m.category, to_char(m.captured_on, 'YYYY-MM-DD') as captured_on,
           m.caption, m.original_key, m.original_bytes, m.preview_key,
           m.width, m.height, m.session_id, s.title as session_title, m.created_at
    from project100_media m
    left join project100_training_sessions s
      on s.id = m.session_id and s.user_id = m.user_id
    where m.id = ${mediaId} and m.user_id = ${actor.userId}
    limit 1
  `;
  if (!created[0]) {
    throw new AppError(500, "PROJECT100_MEDIA_NOT_READABLE", "Bilden kunde inte läsas tillbaka.");
  }
  return withSignedPreview(actor.userId, created[0]);
}

export async function signedProject100MediaOriginalUrl(
  actor: ActorContext,
  id: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<{ original_key: string }[]>`
    select original_key from project100_media
    where id = ${id} and user_id = ${actor.userId}
    limit 1
  `;
  if (!rows[0]) {
    throw new AppError(404, "PROJECT100_MEDIA_NOT_FOUND", "Bilden finns inte.");
  }
  return {
    url: await signedProject100MediaUrl(actor.userId, rows[0].original_key, URL_TTL_SECONDS),
    expiresInSeconds: URL_TTL_SECONDS,
  };
}

/**
 * Removes the stored objects before the row. If the storage delete fails the
 * row stays, because a picture that is still in the bucket must not disappear
 * from the only list that can reach it.
 */
export async function deleteProject100Media(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<{ original_key: string; preview_key: string | null }[]>`
    select original_key, preview_key from project100_media
    where id = ${id} and user_id = ${actor.userId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return false;

  if (!(await deleteProject100MediaObject(actor.userId, row.original_key))) {
    throw new AppError(
      502,
      "PROJECT100_MEDIA_STILL_STORED",
      "Originalbilden kunde inte raderas, så posten är kvar. Försök igen.",
    );
  }
  if (row.preview_key !== null) {
    await deleteProject100MediaObject(actor.userId, row.preview_key);
  }

  return sql.begin(async (tx) => {
    const deleted = await tx<{ id: string }[]>`
      delete from project100_media
      where id = ${id} and user_id = ${actor.userId}
      returning id
    `;
    if (!deleted[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.media.delete",
      targetType: "project100_media",
      targetId: id,
    });
    return true;
  });
}
