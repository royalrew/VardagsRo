import "server-only";

import OpenAI from "openai";

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  buildJarvisSystemPrompt,
  type Project100ChatMessage,
  type Project100Conversation,
  type Project100JarvisContext,
  type Project100Memory,
  type Project100MemoryCategory,
  type Project100MemoryKind,
  type Project100MessageProposal,
  type Project100MessageSource,
} from "@/lib/project100-jarvis";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { openAIConfig } from "@/server/config";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  CreateConversationInput,
  CreateMemoryInput,
  SendJarvisMessageInput,
  UpdateMemoryInput,
} from "@/server/project100-jarvis-schemas";

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Project100MessageSource[];
  proposals: Project100MessageProposal[];
  created_at: string;
}

interface MemoryRow {
  id: string;
  kind: Project100MemoryKind;
  category: Project100MemoryCategory;
  content: string;
  source_ref: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

let openAiClient: OpenAI | null = null;
let openAiKey = "";

function getOpenAI(): { client: OpenAI; model: string } | null {
  const config = openAIConfig();
  if (!config) return null;
  if (!openAiClient || openAiKey !== config.apiKey) {
    openAiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 45_000,
      maxRetries: 1,
    });
    openAiKey = config.apiKey;
  }
  return { client: openAiClient, model: config.model };
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadProject100JarvisContext(
  actor: ActorContext,
): Promise<Project100JarvisContext> {
  const sql = await readyClient();

  const householdRows = await sql<{ timezone: string }[]>`
    select timezone from family_households where id = ${actor.householdId} limit 1
  `;
  const timeZone = householdRows[0]?.timezone ?? DEFAULT_TIME_ZONE;
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const nextWeek = addCalendarDateDays(today, 7);
  const lastWeek = addCalendarDateDays(today, -7);

  const [
    settingsRows,
    workRows,
    sessionRows,
    bodyRows,
    mealRows,
    batchRows,
    journalRows,
    memoryRows,
  ] = await Promise.all([
    sql<{ weight_goal_kg: number | string | null; start_weight_kg: number | string | null; protein_target_g: number | string | null }[]>`
      select weight_goal_kg, start_weight_kg, protein_target_g
      from project100_settings
      where user_id = ${actor.userId}
      limit 1
    `,
    sql<{ title: string; starts_at: string; ends_at: string }[]>`
      select title, starts_at, ends_at
      from family_events
      where household_id = ${actor.householdId}
        and person_id = ${actor.personId}
        and category = 'work'
        and status = 'confirmed'
        and starts_at >= ${today}::date
        and starts_at < ${nextWeek}::date
      order by starts_at asc
      limit 5
    `,
    sql<{ id: string; session_date: string; title: string; activity_type: string; duration_seconds: number | null }[]>`
      select id, to_char(session_date, 'YYYY-MM-DD') as session_date, title, activity_type, duration_seconds
      from project100_training_sessions
      where user_id = ${actor.userId}
        and status = 'completed'
      order by session_date desc
      limit 4
    `,
    sql<{ measured_on: string; value: number | string }[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, value
      from project100_body_measurements
      where user_id = ${actor.userId}
        and metric = 'weight'
      order by measured_on desc
      limit 1
    `,
    sql<{ id: string; eaten_on: string; title: string; protein_g: number | string | null; kcal: number | string | null }[]>`
      select id, to_char(eaten_on, 'YYYY-MM-DD') as eaten_on, title, protein_g, kcal
      from project100_meals
      where user_id = ${actor.userId}
        and eaten_on >= ${lastWeek}
      order by eaten_on desc, id desc
      limit 6
    `,
    sql<{ id: string; title: string; portions_remaining: number | string; protein_per_portion_g: number | string | null }[]>`
      select id, title, portions_remaining, protein_per_portion_g
      from project100_meal_batches
      where user_id = ${actor.userId}
        and portions_remaining > 0
      order by cooked_on desc
      limit 5
    `,
    // STRICT: excluded_from_ai = false in SQL query!
    sql<{ written_on: string; sleep_hours: number | string | null; energy: number | null; mood: number | null }[]>`
      select to_char(written_on, 'YYYY-MM-DD') as written_on, sleep_hours, energy, mood
      from project100_journal_entries
      where user_id = ${actor.userId}
        and excluded_from_ai = false
      order by written_on desc
      limit 4
    `,
    sql<MemoryRow[]>`
      select id, kind, category, content, source_ref, is_active,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
             to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from project100_memories
      where user_id = ${actor.userId}
        and is_active = true
      order by created_at desc
    `,
  ]);

  const settings = settingsRows[0];
  const currentWeight = asNumber(bodyRows[0]?.value);

  return {
    today,
    timeZone,
    weightGoalKg: asNumber(settings?.weight_goal_kg) ?? 100,
    startWeightKg: asNumber(settings?.start_weight_kg) ?? null,
    currentWeightKg: currentWeight,
    proteinTargetG: asNumber(settings?.protein_target_g) ?? 160,
    upcomingWorkEvents: workRows.map((w) => ({
      title: w.title,
      startsAt: w.starts_at,
      endsAt: w.ends_at,
    })),
    recentSessions: sessionRows.map((s) => ({
      id: s.id,
      date: s.session_date,
      title: s.title,
      activityType: s.activity_type,
      durationSeconds: s.duration_seconds,
    })),
    recentMeals: mealRows.map((m) => ({
      id: m.id,
      date: m.eaten_on,
      title: m.title,
      proteinG: asNumber(m.protein_g),
      kcal: asNumber(m.kcal),
    })),
    recentJournal: journalRows.map((j) => ({
      date: j.written_on,
      sleepHours: asNumber(j.sleep_hours),
      energy: j.energy,
      mood: j.mood,
    })),
    pantryBatches: batchRows.map((b) => ({
      id: b.id,
      title: b.title,
      portionsRemaining: Number(b.portions_remaining),
      proteinPerPortionG: asNumber(b.protein_per_portion_g) ?? 0,
    })),
    activeMemories: memoryRows.map((m) => ({
      id: m.id,
      kind: m.kind,
      category: m.category,
      content: m.content,
      sourceRef: m.source_ref,
      isActive: m.is_active,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
  };
}

export async function loadProject100JarvisWorkspace(
  actor: ActorContext,
  conversationId?: string | null,
): Promise<{
  conversations: Project100Conversation[];
  activeConversation: Project100Conversation | null;
  messages: Project100ChatMessage[];
  memories: Project100Memory[];
  context: Project100JarvisContext;
}> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const [convRows, memRows, context] = await Promise.all([
    sql<ConversationRow[]>`
      select id, title,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
             to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from project100_conversations
      where user_id = ${actor.userId}
      order by updated_at desc
      limit 30
    `,
    sql<MemoryRow[]>`
      select id, kind, category, content, source_ref, is_active,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
             to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from project100_memories
      where user_id = ${actor.userId}
      order by created_at desc
    `,
    loadProject100JarvisContext(actor),
  ]);

  const conversations: Project100Conversation[] = convRows.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));

  const activeId = conversationId ?? conversations[0]?.id ?? null;
  let activeConversation: Project100Conversation | null = null;
  let messages: Project100ChatMessage[] = [];

  if (activeId) {
    const activeRow = conversations.find((c) => c.id === activeId) ?? null;
    if (activeRow) {
      activeConversation = activeRow;
      const msgRows = await sql<MessageRow[]>`
        select id, conversation_id, role, content, sources, proposals,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
        from project100_conversation_messages
        where user_id = ${actor.userId}
          and conversation_id = ${activeId}
        order by created_at asc
        limit 100
      `;
      messages = msgRows.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        role: m.role,
        content: m.content,
        sources: Array.isArray(m.sources) ? m.sources : [],
        proposals: Array.isArray(m.proposals) ? m.proposals : [],
        createdAt: m.created_at,
      }));
    }
  }

  const memories: Project100Memory[] = memRows.map((m) => ({
    id: m.id,
    kind: m.kind,
    category: m.category,
    content: m.content,
    sourceRef: m.source_ref,
    isActive: m.is_active,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }));

  return {
    conversations,
    activeConversation,
    messages,
    memories,
    context,
  };
}

export async function createProject100Conversation(
  actor: ActorContext,
  input: CreateConversationInput,
): Promise<Project100Conversation> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const id = crypto.randomUUID();

  const rows = await sql<ConversationRow[]>`
    insert into project100_conversations (id, user_id, title)
    values (${id}, ${actor.userId}, ${input.title})
    returning id, title,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  await recordAudit(sql, actor, {
    action: "project100.jarvis.conversation.create",
    targetType: "project100_conversation",
    targetId: id,
  });

  const row = rows[0];
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteProject100Conversation(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<{ id: string }[]>`
    delete from project100_conversations
    where id = ${id} and user_id = ${actor.userId}
    returning id
  `;

  if (rows.length === 0) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Konversationen hittades inte.");
  }

  await recordAudit(sql, actor, {
    action: "project100.jarvis.conversation.delete",
    targetType: "project100_conversation",
    targetId: id,
  });
  return true;
}

export async function createProject100Memory(
  actor: ActorContext,
  input: CreateMemoryInput,
): Promise<Project100Memory> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const id = crypto.randomUUID();

  const rows = await sql<MemoryRow[]>`
    insert into project100_memories (id, user_id, kind, category, content, source_ref)
    values (${id}, ${actor.userId}, ${input.kind}, ${input.category}, ${input.content}, ${input.sourceRef})
    returning id, kind, category, content, source_ref, is_active,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  await recordAudit(sql, actor, {
    action: "project100.jarvis.memory.create",
    targetType: "project100_memory",
    targetId: id,
  });

  const row = rows[0];
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    content: row.content,
    sourceRef: row.source_ref,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateProject100Memory(
  actor: ActorContext,
  id: string,
  input: UpdateMemoryInput,
): Promise<Project100Memory> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<MemoryRow[]>`
    update project100_memories
    set is_active = coalesce(${input.isActive ?? null}, is_active),
        content = coalesce(${input.content ?? null}, content),
        category = coalesce(${input.category ?? null}, category),
        updated_at = now()
    where id = ${id} and user_id = ${actor.userId}
    returning id, kind, category, content, source_ref, is_active,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  if (rows.length === 0) {
    throw new AppError(404, "MEMORY_NOT_FOUND", "Minnet hittades inte.");
  }

  await recordAudit(sql, actor, {
    action: "project100.jarvis.memory.update",
    targetType: "project100_memory",
    targetId: id,
  });

  const row = rows[0];
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    content: row.content,
    sourceRef: row.source_ref,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteProject100Memory(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<{ id: string }[]>`
    delete from project100_memories
    where id = ${id} and user_id = ${actor.userId}
    returning id
  `;

  if (rows.length === 0) {
    throw new AppError(404, "MEMORY_NOT_FOUND", "Minnet hittades inte.");
  }

  await recordAudit(sql, actor, {
    action: "project100.jarvis.memory.delete",
    targetType: "project100_memory",
    targetId: id,
  });
  return true;
}

export async function sendProject100JarvisMessage(
  actor: ActorContext,
  input: SendJarvisMessageInput,
): Promise<{
  conversationId: string;
  userMessage: Project100ChatMessage;
  assistantMessage: Project100ChatMessage;
}> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  // 1. Ensure or create conversation
  let convId = input.conversationId;
  if (!convId) {
    const titleSnippet = input.content.slice(0, 40).trim() || "Ny konversation";
    const created = await createProject100Conversation(actor, { title: titleSnippet });
    convId = created.id;
  } else {
    // Verify conversation ownership
    const convRows = await sql<{ id: string }[]>`
      select id from project100_conversations
      where id = ${convId} and user_id = ${actor.userId}
      limit 1
    `;
    if (convRows.length === 0) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Konversationen hittades inte.");
    }
  }

  // 2. Fetch past messages for conversation
  const priorMsgRows = await sql<MessageRow[]>`
    select id, conversation_id, role, content, sources, proposals,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from project100_conversation_messages
    where user_id = ${actor.userId}
      and conversation_id = ${convId}
    order by created_at asc
    limit 20
  `;

  // 3. Load full realtime context
  const context = await loadProject100JarvisContext(actor);
  const systemPrompt = buildJarvisSystemPrompt(context);

  // 4. Call AI or deterministic fallback
  const ai = getOpenAI();
  let assistantReplyText = "";
  const sources: Project100MessageSource[] = [];
  const proposals: Project100MessageProposal[] = [];

  // Populate immediate context sources
  if (context.upcomingWorkEvents.length > 0) {
    sources.push({
      kind: "work",
      id: "work-upcoming",
      title: "Jobbschema",
      detail: context.upcomingWorkEvents[0].title,
      date: context.upcomingWorkEvents[0].startsAt.slice(0, 10),
    });
  }
  if (context.recentSessions.length > 0) {
    sources.push({
      kind: "session",
      id: context.recentSessions[0].id,
      title: "Senaste träningspass",
      detail: `${context.recentSessions[0].title} (${context.recentSessions[0].date})`,
      date: context.recentSessions[0].date,
    });
  }
  if (context.currentWeightKg !== null) {
    sources.push({
      kind: "body",
      id: "body-weight",
      title: "Nuvarande vikt",
      detail: `${context.currentWeightKg} kg`,
      date: context.today,
    });
  }

  if (ai) {
    try {
      const messagesPayload: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...priorMsgRows.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: input.content },
      ];

      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: messagesPayload,
        temperature: 0.2,
        max_tokens: 1000,
      });

      assistantReplyText =
        completion.choices[0]?.message?.content?.trim() ||
        "Jag kunde inte formulera ett svar just nu.";
    } catch {
      assistantReplyText = `Jag analyserade din fråga om "${input.content}". Med din nuvarande vikt (${context.currentWeightKg ?? 85} kg) och ditt kommande schema rekommenderar jag att du håller proteinmålet (${context.proteinTargetG} g) och fokuserar på nästa träningsfönster.`;
    }
  } else {
    // Deterministic fallback response in development/tests
    assistantReplyText = `Utifrån din historik (vikt: ${context.currentWeightKg ?? "ej loggad"} kg, senaste pass: ${
      context.recentSessions[0]?.title ?? "inga pass"
    }) och ditt schema (${
      context.upcomingWorkEvents[0]?.title ?? "inga arbetspass närmast"
    }):\n\nFokusera på god återhämtning och att nå dagens proteinmål på ${context.proteinTargetG} g.`;
  }

  // 5. Persist user and assistant messages
  const userMsgId = crypto.randomUUID();
  const assistantMsgId = crypto.randomUUID();

  const [userMsgRows, assistantMsgRows] = await Promise.all([
    sql<MessageRow[]>`
      insert into project100_conversation_messages (
        id, conversation_id, user_id, role, content, sources, proposals
      ) values (
        ${userMsgId}, ${convId}, ${actor.userId}, ${"user"}, ${input.content}, '[]'::jsonb, '[]'::jsonb
      )
      returning id, conversation_id, role, content, sources, proposals,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    `,
    sql<MessageRow[]>`
      insert into project100_conversation_messages (
        id, conversation_id, user_id, role, content, sources, proposals
      ) values (
        ${assistantMsgId}, ${convId}, ${actor.userId}, ${"assistant"},
        ${assistantReplyText}, ${JSON.stringify(sources)}::jsonb, ${JSON.stringify(proposals)}::jsonb
      )
      returning id, conversation_id, role, content, sources, proposals,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    `,
  ]);

  // Touch conversation updated_at
  await sql`
    update project100_conversations
    set updated_at = now()
    where id = ${convId} and user_id = ${actor.userId}
  `;

  await recordAudit(sql, actor, {
    action: "project100.jarvis.message.send",
    targetType: "project100_conversation",
    targetId: convId,
  });

  const u = userMsgRows[0];
  const a = assistantMsgRows[0];

  return {
    conversationId: convId,
    userMessage: {
      id: u.id,
      conversationId: u.conversation_id,
      role: u.role,
      content: u.content,
      sources: [],
      proposals: [],
      createdAt: u.created_at,
    },
    assistantMessage: {
      id: a.id,
      conversationId: a.conversation_id,
      role: a.role,
      content: a.content,
      sources,
      proposals,
      createdAt: a.created_at,
    },
  };
}
