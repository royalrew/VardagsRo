import postgres from "postgres";

import { createDemoData } from "@/lib/demo-data";
import { repeatWeeklyEvents } from "@/lib/weekly-schedule";
import type {
  ConfirmDocumentInput,
  DashboardData,
  FamilyDocument,
  FamilyDocumentFolder,
  FamilyEvent,
  FamilyPerson,
  FamilyTask,
} from "@/lib/types";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { databaseUrl, demoFallbackAllowed } from "@/server/config";
import { AppError } from "@/server/errors";
import type {
  DocumentOrganizationInput,
  EventUpdateInput,
  FolderCreateInput,
  FolderUpdateInput,
  HouseholdUpdateInput,
  ManualEventInput,
  ManualTaskInput,
  PersonCreateInput,
  PersonUpdateInput,
} from "@/server/schemas";

type SqlClient = ReturnType<typeof postgres>;
type TransactionClient = postgres.TransactionSql;
type QueryClient = SqlClient | TransactionClient;

let sqlClient: SqlClient | null = null;
let sqlUrl = "";

export const LATEST_DATABASE_MIGRATION = "009_auth_generated_ids";

const DOCUMENT_FOLDER_LOCK_NAMESPACE = 1_947_046_335;

export type DatabaseStatus =
  | "ok"
  | "not_configured"
  | "unavailable"
  | "migration_required"
  | "empty";

interface HouseholdRow {
  id: string;
  name: string;
  timezone: string;
}

interface PersonRow {
  id: string;
  household_id: string;
  name: string;
  role: string;
  person_type: "adult" | "child";
  aliases: unknown;
  initials: string;
  color: string;
  tint: string;
}

interface DocumentRow {
  id: string;
  household_id: string;
  title: string;
  filename: string;
  mime_type: string;
  document_type: string;
  person_id: string | null;
  folder_id: string | null;
  status: "confirmed" | "needs_review";
  uploaded_at: Date | string;
  period_label: string;
  summary: string;
  storage_key: string | null;
  sha256: string | null;
  events_count: number | string;
  tasks_count: number | string;
}

interface FolderRow {
  id: string;
  household_id: string;
  parent_id: string | null;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface EventRow {
  id: string;
  household_id: string;
  person_id: string;
  document_id: string | null;
  title: string;
  category: FamilyEvent["category"];
  starts_at: Date | string;
  ends_at: Date | string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  status: "confirmed" | "needs_review";
  confidence: number | string;
  source_excerpt: string | null;
}

interface TaskRow {
  id: string;
  household_id: string;
  person_id: string;
  document_id: string | null;
  title: string;
  kind: FamilyTask["kind"];
  due_at: Date | string | null;
  completed_at: Date | string | null;
  notes: string | null;
  review_status: FamilyTask["reviewStatus"];
  confidence: number | string;
  source_excerpt: string | null;
}

function client(): SqlClient {
  const url = databaseUrl();
  if (!url) {
    throw new AppError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Databasen är inte konfigurerad.",
    );
  }
  if (!sqlClient || sqlUrl !== url) {
    sqlClient = postgres(url, {
      max: 5,
      connect_timeout: 3,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: false,
      onnotice: () => undefined,
    });
    sqlUrl = url;
  }
  return sqlClient;
}

/**
 * The pooled client, guaranteed to be configured. Exported so the actor and
 * audit layers query through the same pool as every other data path.
 */
export async function readyClient(): Promise<SqlClient> {
  return client();
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNullableIso(value: Date | string | null): string | null {
  return value === null ? null : asIso(value);
}

function aliases(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      return aliases(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function mapPerson(row: PersonRow): FamilyPerson {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    role: row.role,
    personType: row.person_type,
    aliases: aliases(row.aliases),
    initials: row.initials,
    color: row.color,
    tint: row.tint,
  };
}

function mapDocument(row: DocumentRow): FamilyDocument {
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    filename: row.filename,
    mimeType: row.mime_type,
    documentType: row.document_type,
    personId: row.person_id,
    folderId: row.folder_id,
    status: row.status,
    uploadedAt: asIso(row.uploaded_at),
    periodLabel: row.period_label,
    summary: row.summary,
    storageKey: row.storage_key,
    hash: row.sha256,
    eventsCount: Number(row.events_count),
    tasksCount: Number(row.tasks_count),
  };
}

function mapFolder(row: FolderRow): FamilyDocumentFolder {
  return {
    id: row.id,
    householdId: row.household_id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function mapEvent(row: EventRow): FamilyEvent {
  return {
    id: row.id,
    householdId: row.household_id,
    personId: row.person_id,
    documentId: row.document_id,
    title: row.title,
    category: row.category,
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    status: row.status,
    confidence: Number(row.confidence),
    sourceExcerpt: row.source_excerpt,
  };
}

function mapTask(row: TaskRow): FamilyTask {
  return {
    id: row.id,
    householdId: row.household_id,
    personId: row.person_id,
    documentId: row.document_id,
    title: row.title,
    kind: row.kind,
    dueAt: asNullableIso(row.due_at),
    completedAt: asNullableIso(row.completed_at),
    notes: row.notes,
    reviewStatus: row.review_status,
    confidence: Number(row.confidence),
    sourceExcerpt: row.source_excerpt,
  };
}

async function dashboardFromDatabase(
  sql: QueryClient,
  householdId: string,
  currentPersonId: string,
): Promise<DashboardData> {
  const householdRows = await sql<HouseholdRow[]>`
    select id, name, timezone
    from family_households
    where id = ${householdId}
    limit 1
  `;
  const household = householdRows[0];
  if (!household) {
    throw new AppError(
      503,
      "HOUSEHOLD_NOT_CONFIGURED",
      "Inget hushåll är konfigurerat ännu.",
    );
  }

  const [personRows, folderRows, documentRows, eventRows, taskRows] = await Promise.all([
    sql<PersonRow[]>`
      select id, household_id, name, role, person_type, aliases, initials, color, tint
      from family_people where household_id = ${household.id}
      order by created_at asc
    `,
    sql<FolderRow[]>`
      select id, household_id, parent_id, name, created_at, updated_at
      from family_document_folders
      where household_id = ${household.id}
      order by lower(name) asc, created_at asc
    `,
    sql<DocumentRow[]>`
      select d.id, d.household_id, d.title, d.filename, d.mime_type, d.document_type,
             d.person_id, d.folder_id, d.status, d.uploaded_at, d.period_label, d.summary,
             d.storage_key, d.sha256,
             count(distinct e.id)::int as events_count,
             count(distinct t.id)::int as tasks_count
      from family_documents d
      left join family_events e on e.document_id = d.id
      left join family_tasks t on t.document_id = d.id
      where d.household_id = ${household.id}
      group by d.id
      order by d.uploaded_at desc
    `,
    sql<EventRow[]>`
      select id, household_id, person_id, document_id, title, category, starts_at,
             ends_at, all_day, location, notes, status, confidence, source_excerpt
      from family_events where household_id = ${household.id}
      order by starts_at asc
    `,
    sql<TaskRow[]>`
      select id, household_id, person_id, document_id, title, kind, due_at,
             completed_at, notes, review_status, confidence, source_excerpt
      from family_tasks where household_id = ${household.id}
      order by completed_at asc nulls first, due_at asc nulls last, created_at desc
    `,
  ]);

  const people = personRows.map(mapPerson);

  return {
    householdId: household.id,
    familyName: household.name,
    timezone: household.timezone,
    // Who "jag" means comes from the signed-in membership. Reading it from a
    // role called "Jag" made every session answer as the same person.
    currentPersonId,
    people,
    folders: folderRows.map(mapFolder),
    documents: documentRows.map(mapDocument),
    events: eventRows.map(mapEvent),
    tasks: taskRows.map(mapTask),
    dataMode: "database",
  };
}

export async function loadDashboard(actor: ActorContext): Promise<DashboardData> {
  if (!databaseUrl()) {
    if (demoFallbackAllowed()) return createDemoData();
    throw new AppError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Familjens databas är inte konfigurerad.",
    );
  }
  try {
    return await dashboardFromDatabase(await readyClient(), actor.householdId, actor.personId);
  } catch (cause) {
    if (demoFallbackAllowed()) return createDemoData();
    if (cause instanceof AppError) throw cause;
    throw new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "Familjens uppgifter är inte tillgängliga just nu.",
      { cause },
    );
  }
}

export async function databaseStatus(): Promise<DatabaseStatus> {
  if (!databaseUrl()) return "not_configured";
  try {
    const sql = client();
    const relationRows = await sql<
      { migrations: boolean; households: boolean }[]
    >`
      select
        to_regclass('public.app_schema_migrations') is not null as migrations,
        to_regclass('public.family_households') is not null as households
    `;
    if (!relationRows[0]?.migrations || !relationRows[0]?.households) {
      return "migration_required";
    }

    const migrationRows = await sql<{ current: boolean }[]>`
      select exists (
        select 1 from app_schema_migrations
        where version = ${LATEST_DATABASE_MIGRATION}
      ) as current
    `;
    if (!migrationRows[0]?.current) return "migration_required";

    const householdRows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from family_households
    `;
    return Number(householdRows[0]?.count ?? 0) > 0 ? "ok" : "empty";
  } catch {
    return "unavailable";
  }
}

export async function databaseIsHealthy(): Promise<boolean> {
  return (await databaseStatus()) === "ok";
}

async function documentById(
  sql: QueryClient,
  householdId: string,
  id: string,
): Promise<FamilyDocument | null> {
  const rows = await sql<DocumentRow[]>`
    select d.id, d.household_id, d.title, d.filename, d.mime_type, d.document_type,
           d.person_id, d.folder_id, d.status, d.uploaded_at, d.period_label, d.summary,
           d.storage_key, d.sha256,
           count(distinct e.id)::int as events_count,
           count(distinct t.id)::int as tasks_count
    from family_documents d
    left join family_events e on e.document_id = d.id
    left join family_tasks t on t.document_id = d.id
    where d.id = ${id} and d.household_id = ${householdId}
    group by d.id
    limit 1
  `;
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function getDocument(actor: ActorContext, id: string): Promise<FamilyDocument | null> {
  return documentById(await readyClient(), actor.householdId, id);
}

async function folderById(
  sql: QueryClient,
  householdId: string,
  id: string,
): Promise<FamilyDocumentFolder | null> {
  const rows = await sql<FolderRow[]>`
    select id, household_id, parent_id, name, created_at, updated_at
    from family_document_folders
    where id = ${id} and household_id = ${householdId}
    limit 1
  `;
  return rows[0] ? mapFolder(rows[0]) : null;
}

async function assertFolderParent(
  sql: QueryClient,
  householdId: string,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  if (!(await folderById(sql, householdId, parentId))) {
    throw new AppError(400, "FOLDER_PARENT_NOT_FOUND", "Den valda \u00f6vermappen finns inte.");
  }
}

async function assertFolderNameAvailable(
  sql: QueryClient,
  householdId: string,
  name: string,
  parentId: string | null,
  excludeId: string | null = null,
): Promise<void> {
  const rows = await sql<{ taken: boolean }[]>`
    select exists (
      select 1
      from family_document_folders
      where household_id = ${householdId}
        and parent_id is not distinct from ${parentId}
        and lower(name) = lower(${name})
        and (${excludeId}::text is null or id <> ${excludeId})
    ) as taken
  `;
  if (rows[0]?.taken) {
    throw new AppError(409, "FOLDER_NAME_CONFLICT", "Det finns redan en mapp med det namnet h\u00e4r.");
  }
}

async function lockDocumentFolderGraph(sql: TransactionClient, householdId: string): Promise<void> {
  await sql`
    select pg_advisory_xact_lock(
      ${DOCUMENT_FOLDER_LOCK_NAMESPACE}::integer,
      hashtext(${householdId})
    )
  `;
}

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Colour pairs for new family members. Assigned by position so a family of any
 * size gets distinguishable avatars without the user having to pick colours.
 */
const PERSON_PALETTE: Array<{ color: string; tint: string }> = [
  { color: "#476b5b", tint: "#dfece4" },
  { color: "#5577a6", tint: "#e4ebf6" },
  { color: "#a6606e", tint: "#f5e5e8" },
  { color: "#bc7448", tint: "#f8e9dc" },
  { color: "#6b5b8f", tint: "#e8e4f2" },
  { color: "#4d8079", tint: "#dfeeeb" },
  { color: "#8f6b3f", tint: "#f2e8d9" },
  { color: "#8a5a7a", tint: "#f1e4ee" },
];

/** First letter of the given name, which is what the avatar renders. */
function personInitials(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return (first.slice(0, 1) || "?").toLocaleUpperCase("sv-SE");
}

export async function createPerson(actor: ActorContext, input: PersonCreateInput): Promise<FamilyPerson> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const existing = await tx<Array<{ count: string }>>`
      select count(*)::text as count from family_people
      where household_id = ${actor.householdId}
    `;
    const palette = PERSON_PALETTE[Number(existing[0]?.count ?? 0) % PERSON_PALETTE.length];
    const rows = await tx<PersonRow[]>`
      insert into family_people
        (id, household_id, name, role, person_type, aliases, initials, color, tint)
      values (
        ${crypto.randomUUID()},
        ${actor.householdId},
        ${input.name},
        ${input.role},
        ${input.personType},
        ${JSON.stringify(input.aliases)}::jsonb,
        ${personInitials(input.name)},
        ${palette.color},
        ${palette.tint}
      )
      returning id, household_id, name, role, person_type, aliases, initials, color, tint
    `;
    const person = mapPerson(rows[0]);
    await recordAudit(tx, actor, {
      action: "person.create",
      targetType: "person",
      targetId: person.id,
      metadata: { personType: person.personType },
    });
    return person;
  });
}

export async function updatePerson(
  actor: ActorContext,
  id: string,
  input: PersonUpdateInput,
): Promise<FamilyPerson> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const current = await tx<PersonRow[]>`
      select id, household_id, name, role, person_type, aliases, initials, color, tint
      from family_people where id = ${id} and household_id = ${actor.householdId}
    `;
    const existing = current[0];
    if (!existing) {
      throw new AppError(404, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
    }

    const name = input.name ?? existing.name;
    const role = input.role ?? existing.role;
    const personType = input.personType ?? existing.person_type;
    const nextAliases = input.aliases ?? aliases(existing.aliases);
    const rows = await tx<PersonRow[]>`
      update family_people
      set name = ${name},
          role = ${role},
          person_type = ${personType},
          aliases = ${JSON.stringify(nextAliases)}::jsonb,
          initials = ${personInitials(name)}
      where id = ${id} and household_id = ${actor.householdId}
      returning id, household_id, name, role, person_type, aliases, initials, color, tint
    `;
    const person = mapPerson(rows[0]);
    await recordAudit(tx, actor, {
      action: "person.update",
      targetType: "person",
      targetId: person.id,
      metadata: {
        fields: Object.keys(input).sort().join(","),
        personType: person.personType,
      },
    });
    return person;
  });
}

/**
 * Removing a person cascades to their events and tasks in the schema, so the
 * server refuses while anything still points at them. The family has to move or
 * delete that content deliberately first, exactly like a non-empty folder.
 */
export async function removePerson(actor: ActorContext, id: string): Promise<void> {
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const current = await tx<Array<{ id: string }>>`
      select id from family_people
      where id = ${id} and household_id = ${actor.householdId}
      for update
    `;
    if (!current.length) {
      throw new AppError(404, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
    }

    const counts = await tx<Array<{ events: string; tasks: string; documents: string }>>`
      select
        (select count(*) from family_events
          where person_id = ${id} and household_id = ${actor.householdId})::text as events,
        (select count(*) from family_tasks
          where person_id = ${id} and household_id = ${actor.householdId})::text as tasks,
        (select count(*) from family_documents
          where person_id = ${id} and household_id = ${actor.householdId})::text as documents
    `;
    const events = Number(counts[0]?.events ?? 0);
    const tasks = Number(counts[0]?.tasks ?? 0);
    const documents = Number(counts[0]?.documents ?? 0);
    if (events || tasks || documents) {
      const parts: string[] = [];
      if (events) parts.push(`${events} kalenderpost${events === 1 ? "" : "er"}`);
      if (tasks) parts.push(`${tasks} uppgift${tasks === 1 ? "" : "er"}`);
      if (documents) parts.push(`${documents} dokument`);
      throw new AppError(
        409,
        "PERSON_NOT_EMPTY",
        `Personen har kvar ${parts.join(", ")}. Flytta eller ta bort det först.`,
      );
    }

    await tx`
      delete from family_people
      where id = ${id} and household_id = ${actor.householdId}
    `;
    await recordAudit(tx, actor, {
      action: "person.delete",
      targetType: "person",
      targetId: id,
    });
  });
}

export async function updateHouseholdName(
  actor: ActorContext,
  input: HouseholdUpdateInput,
): Promise<string> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const rows = await tx<Array<{ name: string }>>`
      update family_households set name = ${input.name}
      where id = ${actor.householdId}
      returning name
    `;
    if (!rows.length) {
      throw new AppError(404, "HOUSEHOLD_NOT_FOUND", "Hushållet finns inte.");
    }
    await recordAudit(tx, actor, {
      action: "household.update",
      targetType: "household",
      targetId: actor.householdId,
      metadata: { fields: "name" },
    });
    return rows[0].name;
  });
}

export async function createDocumentFolder(
  actor: ActorContext,
  input: FolderCreateInput,
): Promise<FamilyDocumentFolder> {
  const sql = await readyClient();
  try {
    return await sql.begin(async (tx) => {
      await lockDocumentFolderGraph(tx, actor.householdId);
      await assertFolderParent(tx, actor.householdId, input.parentId);
      await assertFolderNameAvailable(tx, actor.householdId, input.name, input.parentId);
      const rows = await tx<FolderRow[]>`
        insert into family_document_folders (id, household_id, parent_id, name)
        values (${crypto.randomUUID()}, ${actor.householdId}, ${input.parentId}, ${input.name})
        returning id, household_id, parent_id, name, created_at, updated_at
      `;
      const folder = mapFolder(rows[0]);
      await recordAudit(tx, actor, {
        action: "folder.create",
        targetType: "folder",
        targetId: folder.id,
        metadata: { nested: folder.parentId !== null },
      });
      return folder;
    });
  } catch (cause) {
    if (isPostgresError(cause, "23505")) {
      throw new AppError(409, "FOLDER_NAME_CONFLICT", "Det finns redan en mapp med det namnet h\u00e4r.");
    }
    throw cause;
  }
}

export async function updateDocumentFolder(
  actor: ActorContext,
  id: string,
  input: FolderUpdateInput,
): Promise<FamilyDocumentFolder> {
  const sql = await readyClient();
  try {
    return await sql.begin(async (tx) => {
      await lockDocumentFolderGraph(tx, actor.householdId);
      const existing = await folderById(tx, actor.householdId, id);
      if (!existing) {
        throw new AppError(404, "FOLDER_NOT_FOUND", "Mappen finns inte.");
      }

      const name = input.name ?? existing.name;
      const parentId = input.parentId === undefined ? existing.parentId : input.parentId;
      if (parentId === id) {
        throw new AppError(409, "FOLDER_CYCLE", "En mapp kan inte ligga i sig sj\u00e4lv.");
      }
      await assertFolderParent(tx, actor.householdId, parentId);

      if (parentId !== null) {
        const cycleRows = await tx<{ cycle: boolean }[]>`
          with recursive descendants as (
            select id
            from family_document_folders
            where id = ${id} and household_id = ${actor.householdId}
            union all
            select child.id
            from family_document_folders child
            join descendants parent on child.parent_id = parent.id
            where child.household_id = ${actor.householdId}
          )
          select exists (select 1 from descendants where id = ${parentId}) as cycle
        `;
        if (cycleRows[0]?.cycle) {
          throw new AppError(409, "FOLDER_CYCLE", "Mappen kan inte flyttas till en av sina undermappar.");
        }
      }

      await assertFolderNameAvailable(tx, actor.householdId, name, parentId, id);
      const rows = await tx<FolderRow[]>`
        update family_document_folders
        set name = ${name}, parent_id = ${parentId}, updated_at = now()
        where id = ${id} and household_id = ${actor.householdId}
        returning id, household_id, parent_id, name, created_at, updated_at
      `;
      if (!rows[0]) throw new AppError(404, "FOLDER_NOT_FOUND", "Mappen finns inte.");
      const folder = mapFolder(rows[0]);
      await recordAudit(tx, actor, {
        action: "folder.update",
        targetType: "folder",
        targetId: folder.id,
        metadata: { fields: Object.keys(input).sort().join(",") },
      });
      return folder;
    });
  } catch (cause) {
    if (isPostgresError(cause, "23505")) {
      throw new AppError(409, "FOLDER_NAME_CONFLICT", "Det finns redan en mapp med det namnet h\u00e4r.");
    }
    throw cause;
  }
}

export async function removeDocumentFolder(actor: ActorContext, id: string): Promise<void> {
  const sql = await readyClient();
  try {
    await sql.begin(async (tx) => {
      await lockDocumentFolderGraph(tx, actor.householdId);
      const folderRows = await tx<{ id: string }[]>`
        select id from family_document_folders
        where id = ${id} and household_id = ${actor.householdId}
        for update
      `;
      if (!folderRows[0]) {
        throw new AppError(404, "FOLDER_NOT_FOUND", "Mappen finns inte.");
      }

      const contentRows = await tx<{ child_count: number | string; document_count: number | string }[]>`
        select
          (select count(*) from family_document_folders
           where household_id = ${actor.householdId} and parent_id = ${id}) as child_count,
          (select count(*) from family_documents
           where household_id = ${actor.householdId} and folder_id = ${id}) as document_count
      `;
      const content = contentRows[0];
      if (Number(content?.child_count ?? 0) > 0 || Number(content?.document_count ?? 0) > 0) {
        throw new AppError(409, "FOLDER_NOT_EMPTY", "Mappen m\u00e5ste vara tom innan den kan tas bort.");
      }

      await tx`
        delete from family_document_folders
        where id = ${id} and household_id = ${actor.householdId}
      `;
      await recordAudit(tx, actor, {
        action: "folder.delete",
        targetType: "folder",
        targetId: id,
      });
    });
  } catch (cause) {
    if (isPostgresError(cause, "23503")) {
      throw new AppError(409, "FOLDER_NOT_EMPTY", "Mappen m\u00e5ste vara tom innan den kan tas bort.");
    }
    throw cause;
  }
}

export async function updateDocumentOrganization(
  actor: ActorContext,
  id: string,
  input: DocumentOrganizationInput,
): Promise<FamilyDocument> {
  const sql = await readyClient();
  const mutate = async (query: QueryClient): Promise<FamilyDocument> => {
    const existing = await documentById(query, actor.householdId, id);
    if (!existing) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
    }
    if (input.folderId !== undefined && input.folderId !== null) {
      if (!(await folderById(query, actor.householdId, input.folderId))) {
        throw new AppError(400, "FOLDER_NOT_FOUND", "Den valda mappen finns inte.");
      }
    }

    const titleChanged = input.title !== undefined;
    const folderChanged = input.folderId !== undefined;
    const rows = await query<Omit<DocumentRow, "events_count" | "tasks_count">[]>`
      update family_documents
      set title = case when ${titleChanged} then ${input.title ?? existing.title} else title end,
          folder_id = case when ${folderChanged} then ${input.folderId ?? null}::text else folder_id end
      where id = ${id} and household_id = ${actor.householdId}
      returning id, household_id, title, filename, mime_type, document_type, person_id,
                folder_id, status, uploaded_at, period_label, summary, storage_key, sha256
    `;
    if (!rows[0]) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
    }
    await recordAudit(query, actor, {
      action: "document.organize",
      targetType: "document",
      targetId: id,
      metadata: { renamed: titleChanged, moved: folderChanged },
    });
    return mapDocument({
      ...rows[0],
      events_count: existing.eventsCount,
      tasks_count: existing.tasksCount,
    });
  };

  try {
    // Always a transaction, so the audit row cannot outlive a failed change or
    // be lost after a successful one.
    return await sql.begin(async (tx) => {
      if (input.folderId !== undefined) {
        await lockDocumentFolderGraph(tx, actor.householdId);
      }
      return mutate(tx);
    });
  } catch (cause) {
    if (isPostgresError(cause, "23503")) {
      throw new AppError(
        409,
        "FOLDER_CHANGED",
        "Mappen \u00e4ndrades samtidigt. Ladda om och f\u00f6rs\u00f6k igen.",
      );
    }
    throw cause;
  }
}

export async function saveConfirmedDocument(
  actor: ActorContext,
  input: ConfirmDocumentInput,
): Promise<{
  document: FamilyDocument;
  events: FamilyEvent[];
  tasks: FamilyTask[];
}> {
  const sql = await readyClient();
  const personRows = await sql<{ id: string; household_id: string; timezone: string }[]>`
    select p.id, p.household_id, h.timezone
    from family_people p
    join family_households h on h.id = p.household_id
    where p.id = ${input.personId} and p.household_id = ${actor.householdId}
    limit 1
  `;
  const person = personRows[0];
  if (!person) {
    throw new AppError(400, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
  }

  const documentId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const readWeek: FamilyEvent[] = input.events.map((event) => ({
    ...event,
    id: crypto.randomUUID(),
    householdId: person.household_id,
    personId: person.id,
    documentId,
    notes: event.notes || null,
    status: "confirmed",
    sourceExcerpt: event.sourceExcerpt || null,
  }));
  // A timetable is printed for one week but holds until the family says it
  // stops. The copies share this document, so removing the document removes the
  // whole repeat rather than leaving orphaned weeks behind.
  const savedEvents: FamilyEvent[] = input.repeatWeeklyUntil
    ? repeatWeeklyEvents(
        readWeek,
        { untilCalendarDate: input.repeatWeeklyUntil, timezone: person.timezone },
        () => crypto.randomUUID(),
      )
    : readWeek;
  const savedTasks: FamilyTask[] = input.tasks.map((task) => ({
    ...task,
    id: crypto.randomUUID(),
    householdId: person.household_id,
    personId: person.id,
    documentId,
    dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
    completedAt: null,
    reviewStatus: "confirmed",
    sourceExcerpt: task.sourceExcerpt || null,
  }));

  await sql.begin(async (tx) => {
    await tx`
      insert into family_documents
        (id, household_id, title, filename, mime_type, document_type, person_id,
         status, uploaded_at, period_label, summary, storage_key, sha256)
      values
        (${documentId}, ${person.household_id}, ${input.extraction.title},
         ${input.extraction.originalFilename}, ${input.extraction.mimeType},
         ${input.extraction.documentType}, ${person.id}, 'confirmed', ${uploadedAt},
         ${input.extraction.periodLabel}, ${input.extraction.summary},
         ${input.extraction.storageKey}, ${input.extraction.hash})
    `;

    for (const event of savedEvents) {
      await tx`
        insert into family_events
          (id, household_id, person_id, document_id, title, category, starts_at,
           ends_at, all_day, location, notes, status, confidence, source_excerpt)
        values
          (${event.id}, ${event.householdId}, ${event.personId}, ${event.documentId},
           ${event.title}, ${event.category}, ${event.startsAt}, ${event.endsAt},
           ${event.allDay}, ${event.location}, ${event.notes}, ${event.status},
           ${event.confidence}, ${event.sourceExcerpt})
      `;
    }

    for (const task of savedTasks) {
      await tx`
        insert into family_tasks
          (id, household_id, person_id, document_id, title, kind, due_at,
           completed_at, notes, review_status, confidence, source_excerpt)
        values
          (${task.id}, ${task.householdId}, ${task.personId}, ${task.documentId},
           ${task.title}, ${task.kind}, ${task.dueAt}, null, ${task.notes},
           ${task.reviewStatus}, ${task.confidence}, ${task.sourceExcerpt})
      `;
    }

    await recordAudit(tx, actor, {
      action: "document.confirm",
      targetType: "document",
      targetId: documentId,
      metadata: {
        events: savedEvents.length,
        tasks: savedTasks.length,
        stored: input.extraction.storageKey !== null,
        repeatedUntil: input.repeatWeeklyUntil ?? null,
      },
    });
  });

  const document: FamilyDocument = {
    id: documentId,
    householdId: person.household_id,
    title: input.extraction.title,
    filename: input.extraction.originalFilename,
    mimeType: input.extraction.mimeType,
    documentType: input.extraction.documentType,
    personId: person.id,
    folderId: null,
    status: "confirmed",
    uploadedAt,
    periodLabel: input.extraction.periodLabel,
    summary: input.extraction.summary,
    storageKey: input.extraction.storageKey,
    hash: input.extraction.hash,
    eventsCount: savedEvents.length,
    tasksCount: savedTasks.length,
  };

  return {
    document,
    events: savedEvents,
    tasks: savedTasks,
  };
}

export async function removeDocument(
  actor: ActorContext,
  id: string,
  knownDocument?: FamilyDocument,
): Promise<{ document: FamilyDocument; deletedEvents: number; deletedTasks: number }> {
  const sql = await readyClient();
  const document = knownDocument ?? (await getDocument(actor, id));
  if (
    !document ||
    document.id !== id ||
    document.householdId !== actor.householdId
  ) {
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
  }
  const deletedEvents = document.eventsCount;
  const deletedTasks = document.tasksCount;
  return await sql.begin(async (tx) => {
    const deletedRows = await tx<{ id: string }[]>`
      delete from family_documents
      where id = ${id} and household_id = ${actor.householdId}
      returning id
    `;
    if (!deletedRows[0]) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
    }
    await recordAudit(tx, actor, {
      action: "document.delete",
      targetType: "document",
      targetId: id,
      metadata: { deletedEvents, deletedTasks },
    });
    return { document, deletedEvents, deletedTasks };
  });
}

export async function saveManualEvent(actor: ActorContext, input: ManualEventInput): Promise<FamilyEvent> {
  const sql = await readyClient();
  // A null person means the event concerns the whole family, so there is no row
  // to look up. Any other value still has to exist in this household.
  if (input.personId !== null) {
    const personRows = await sql<{ id: string; household_id: string }[]>`
      select id, household_id from family_people
      where id = ${input.personId} and household_id = ${actor.householdId}
      limit 1
    `;
    if (!personRows[0]) {
      throw new AppError(400, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
    }
  }

  const event: FamilyEvent = {
    id: crypto.randomUUID(),
    householdId: actor.householdId,
    personId: input.personId,
    documentId: null,
    title: input.title,
    category: input.category,
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
    allDay: input.allDay,
    location: input.location,
    notes: input.notes,
    status: "confirmed",
    confidence: 1,
    sourceExcerpt: null,
  };
  await sql.begin(async (tx) => {
    await tx`
      insert into family_events
        (id, household_id, person_id, document_id, title, category, starts_at, ends_at,
         all_day, location, notes, status, confidence, source_excerpt)
      values
        (${event.id}, ${event.householdId}, ${event.personId}, null, ${event.title},
         ${event.category}, ${event.startsAt}, ${event.endsAt}, ${event.allDay},
         ${event.location}, ${event.notes}, ${event.status}, ${event.confidence}, null)
    `;
    await recordAudit(tx, actor, {
      action: "event.create",
      targetType: "event",
      targetId: event.id,
      metadata: {
        category: event.category,
        allDay: event.allDay,
        familyWide: event.personId === null,
      },
    });
  });
  return event;
}

export async function updateManualEvent(
  actor: ActorContext,
  id: string,
  input: EventUpdateInput,
): Promise<FamilyEvent | null> {
  const sql = await readyClient();
  if (input.personId !== null) {
    const personRows = await sql<{ id: string }[]>`
      select id from family_people
      where id = ${input.personId} and household_id = ${actor.householdId}
      limit 1
    `;
    if (!personRows[0]) {
      throw new AppError(400, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
    }
  }

  return await sql.begin(async (tx) => {
    const rows = await tx<EventRow[]>`
      update family_events
      set person_id = ${input.personId},
          title = ${input.title},
          category = ${input.category},
          starts_at = ${new Date(input.startsAt).toISOString()},
          ends_at = ${new Date(input.endsAt).toISOString()},
          all_day = ${input.allDay},
          location = ${input.location},
          notes = ${input.notes},
          document_id = null,
          status = 'confirmed',
          confidence = 1,
          source_excerpt = null
      where id = ${id} and household_id = ${actor.householdId}
      returning id, household_id, person_id, document_id, title, category, starts_at,
                ends_at, all_day, location, notes, status, confidence, source_excerpt
    `;
    if (!rows[0]) return null;
    const event = mapEvent(rows[0]);
    await recordAudit(tx, actor, {
      action: "event.update",
      targetType: "event",
      targetId: event.id,
      metadata: {
        category: event.category,
        allDay: event.allDay,
        familyWide: event.personId === null,
      },
  });
  return event;
  });
}

export async function saveManualTask(actor: ActorContext, input: ManualTaskInput): Promise<FamilyTask> {
  const sql = await readyClient();
  const personRows = await sql<{ id: string }[]>`
    select id from family_people
    where id = ${input.personId} and household_id = ${actor.householdId}
    limit 1
  `;
  if (!personRows[0]) {
    throw new AppError(400, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
  }

  const task: FamilyTask = {
    id: crypto.randomUUID(),
    householdId: actor.householdId,
    personId: input.personId,
    documentId: null,
    title: input.title,
    kind: input.kind,
    dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
    completedAt: null,
    notes: input.notes,
    reviewStatus: "confirmed",
    confidence: 1,
    sourceExcerpt: null,
  };
  await sql.begin(async (tx) => {
    await tx`
      insert into family_tasks
        (id, household_id, person_id, document_id, title, kind, due_at,
         completed_at, notes, review_status, confidence, source_excerpt)
      values
        (${task.id}, ${task.householdId}, ${task.personId}, null, ${task.title},
         ${task.kind}, ${task.dueAt}, null, ${task.notes}, ${task.reviewStatus},
         ${task.confidence}, null)
    `;
    await recordAudit(tx, actor, {
      action: "task.create",
      targetType: "task",
      targetId: task.id,
      metadata: { kind: task.kind, hasDueDate: task.dueAt !== null },
    });
  });
  return task;
}

export async function updateTaskCompletion(
  actor: ActorContext,
  id: string,
  completed: boolean,
): Promise<FamilyTask | null> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const rows = await tx<TaskRow[]>`
      update family_tasks
      set completed_at = case
            when ${completed} then coalesce(completed_at, now())
            else null
          end,
          updated_at = now()
      where id = ${id} and household_id = ${actor.householdId}
      returning id, household_id, person_id, document_id, title, kind, due_at,
                completed_at, notes, review_status, confidence, source_excerpt
    `;
    if (!rows[0]) return null;
    await recordAudit(tx, actor, {
      action: "task.update",
      targetType: "task",
      targetId: id,
      metadata: { completed },
    });
    return mapTask(rows[0]);
  });
}

export async function removeTask(actor: ActorContext, id: string): Promise<boolean> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      delete from family_tasks
      where id = ${id} and household_id = ${actor.householdId}
      returning id
    `;
    if (!rows.length) return false;
    await recordAudit(tx, actor, {
      action: "task.delete",
      targetType: "task",
      targetId: id,
    });
    return true;
  });
}

export async function removeEvent(actor: ActorContext, id: string): Promise<boolean> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      delete from family_events
      where id = ${id} and household_id = ${actor.householdId}
      returning id
    `;
    if (!rows.length) return false;
    await recordAudit(tx, actor, {
      action: "event.delete",
      targetType: "event",
      targetId: id,
    });
    return true;
  });
}

export interface TelegramAccount {
  userId: string;
  chatId: string;
  username: string | null;
  displayName: string;
  personId: string;
  personName: string;
  linkedAt: string;
}

interface TelegramAccountRow {
  telegram_user_id: string;
  telegram_chat_id: string;
  telegram_username: string | null;
  telegram_display_name: string;
  person_id: string;
  person_name: string;
  linked_at: Date | string;
}

function mapTelegramAccount(row: TelegramAccountRow): TelegramAccount {
  return {
    userId: row.telegram_user_id,
    chatId: row.telegram_chat_id,
    username: row.telegram_username,
    displayName: row.telegram_display_name,
    personId: row.person_id,
    personName: row.person_name,
    linkedAt: asIso(row.linked_at),
  };
}

export async function createTelegramLinkRequest(input: {
  codeHash: string;
  userId: string;
  chatId: string;
  username: string | null;
  displayName: string;
  expiresAt: Date;
}): Promise<void> {
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    await tx`
      delete from telegram_link_requests
      where expires_at <= now() or telegram_user_id = ${input.userId}
    `;
    await tx`
      insert into telegram_link_requests
        (code_hash, telegram_user_id, telegram_chat_id,
         telegram_username, telegram_display_name, expires_at)
      values
        (${input.codeHash}, ${input.userId}, ${input.chatId},
         ${input.username}, ${input.displayName}, ${input.expiresAt})
    `;
  });
}

async function telegramAccountRows(
  query: QueryClient,
  householdId: string | null,
  userId?: string,
): Promise<TelegramAccountRow[]> {
  return query<TelegramAccountRow[]>`
    select a.telegram_user_id, a.telegram_chat_id, a.telegram_username,
           a.telegram_display_name, a.person_id, p.name as person_name, a.linked_at
    from telegram_accounts a
    join family_people p on p.id = a.person_id and p.household_id = a.household_id
    where (${householdId}::text is null or a.household_id = ${householdId})
      and (${userId ?? null}::text is null or a.telegram_user_id = ${userId ?? null})
    order by p.created_at asc
  `;
}

export async function getTelegramAccount(userId: string): Promise<TelegramAccount | null> {
  const rows = await telegramAccountRows(await readyClient(), null, userId);
  return rows[0] ? mapTelegramAccount(rows[0]) : null;
}

export async function listTelegramAccounts(actor: ActorContext): Promise<TelegramAccount[]> {
  return (await telegramAccountRows(await readyClient(), actor.householdId)).map(mapTelegramAccount);
}

export async function consumeTelegramLinkRequest(
  actor: ActorContext,
  codeHash: string,
  personId: string,
): Promise<TelegramAccount | null> {
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    await tx`delete from telegram_link_requests where expires_at <= now()`;
    const requests = await tx<Array<{
      telegram_user_id: string;
      telegram_chat_id: string;
      telegram_username: string | null;
      telegram_display_name: string;
    }>>`
      select telegram_user_id, telegram_chat_id, telegram_username, telegram_display_name
      from telegram_link_requests
      where code_hash = ${codeHash}
      for update
    `;
    const request = requests[0];
    if (!request) return null;

    const people = await tx<{ id: string }[]>`
      select id from family_people
      where id = ${personId} and household_id = ${actor.householdId}
    `;
    if (!people[0]) return null;

    await tx`
      delete from telegram_accounts
      where household_id = ${actor.householdId}
        and (person_id = ${personId} or telegram_user_id = ${request.telegram_user_id})
    `;
    await tx`
      insert into telegram_accounts
        (telegram_user_id, household_id, person_id, telegram_chat_id,
         telegram_username, telegram_display_name)
      values
        (${request.telegram_user_id}, ${actor.householdId}, ${personId},
         ${request.telegram_chat_id}, ${request.telegram_username},
         ${request.telegram_display_name})
    `;
    await tx`
      delete from telegram_link_requests
      where telegram_user_id = ${request.telegram_user_id}
    `;
    const rows = await telegramAccountRows(tx, actor.householdId, request.telegram_user_id);
    const account = rows[0] ? mapTelegramAccount(rows[0]) : null;
    if (account) {
      await recordAudit(tx, actor, {
        action: "telegram.link",
        targetType: "person",
        targetId: personId,
      });
    }
    return account;
  });
}

export async function removeTelegramAccount(
  actor: ActorContext,
  personId: string,
): Promise<boolean> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const rows = await tx<{ telegram_user_id: string }[]>`
      delete from telegram_accounts
      where household_id = ${actor.householdId} and person_id = ${personId}
      returning telegram_user_id
    `;
    if (!rows.length) return false;
    await recordAudit(tx, actor, {
      action: "telegram.unlink",
      targetType: "person",
      targetId: personId,
    });
    return true;
  });
}

export async function claimTelegramUpdate(updateId: number): Promise<boolean> {
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    await tx`delete from telegram_updates where received_at < now() - interval '7 days'`;
    const rows = await tx<{ update_id: string }[]>`
      insert into telegram_updates (update_id)
      values (${updateId})
      on conflict (update_id) do nothing
      returning update_id::text
    `;
    return rows.length > 0;
  });
}

export async function releaseTelegramUpdate(updateId: number): Promise<void> {
  await (await readyClient())`
    delete from telegram_updates where update_id = ${updateId}
  `;
}
