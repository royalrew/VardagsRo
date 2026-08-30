import "server-only";

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { formatMeasurement, project100MetricLabel } from "@/lib/project100-body";
import { journalExcerpt } from "@/lib/project100-journal";
import {
  PROJECT100_MEAL_TYPE_LABELS,
  type Project100MealType,
} from "@/lib/project100-nutrition";
import { PROJECT100_ACTIVITY_LABELS, type Project100ActivityType } from "@/lib/project100-training";
import {
  groupProject100Timeline,
  type Project100TimelineDay,
  type Project100TimelineItem,
} from "@/lib/project100-timeline";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";

const DEFAULT_PERIOD_DAYS = 60;
const PER_SOURCE_LIMIT = 120;

interface JournalRow {
  written_on: string;
  body: string | null;
  mood: number | null;
}

interface SessionRow {
  id: string;
  session_date: string;
  title: string;
  activity_type: Project100ActivityType;
  status: string;
  duration_seconds: number | null;
}

interface BodyRow {
  measured_on: string;
  metric: string;
  label: string | null;
  unit: "kg" | "cm";
  value: number | string;
}

interface MealRow {
  id: string;
  eaten_on: string;
  eaten_at_minute: number | null;
  meal_type: Project100MealType;
  title: string;
  source: "manual" | "batch" | "estimate";
  protein_g: number | string | null;
  kcal: number | string | null;
}

interface MediaRow {
  id: string;
  captured_on: string;
  category: string;
  caption: string | null;
}

const STATUS_WORDS: Record<string, string> = {
  planned: "Planerat",
  in_progress: "Pågår",
  completed: "Genomfört",
  skipped: "Blev inte av",
};

const CATEGORY_WORDS: Record<string, string> = {
  body: "Kroppsbild",
  food: "Matbild",
  training: "Träningsbild",
  content: "Innehållsbild",
};

const MEAL_SOURCE_WORDS: Record<MealRow["source"], string> = {
  manual: "Manuellt",
  batch: "Från sats",
  estimate: "AI-uppskattning",
};

const numberFormatter = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

function nutritionNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minutes(seconds: number | null): string | null {
  if (seconds === null) return null;
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * The private timeline.
 *
 * Five sources, each already keyed by user, read separately and woven together
 * per day rather than joined in SQL: a join across them would need an outer key
 * they deliberately do not share, and one wrong condition would be the kind of
 * mistake that shows one person's day to another. Merging in memory keeps every
 * query answerable on its own — this account, this period, this table.
 */
export async function loadProject100Timeline(
  actor: ActorContext,
  period: { from: string | null; to: string | null } = { from: null, to: null },
): Promise<{ from: string; to: string; days: Project100TimelineDay[] }> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const to = period.to ?? today;
  const from = period.from ?? addCalendarDateDays(to, -DEFAULT_PERIOD_DAYS);

  const sql = await readyClient();
  const [journal, sessions, meals, body, media] = await Promise.all([
    sql<JournalRow[]>`
      select to_char(written_on, 'YYYY-MM-DD') as written_on, body, mood
      from project100_journal_entries
      where user_id = ${actor.userId}
        and written_on >= ${from} and written_on <= ${to}
      order by written_on desc
      limit ${PER_SOURCE_LIMIT}
    `,
    sql<SessionRow[]>`
      select id, to_char(session_date, 'YYYY-MM-DD') as session_date, title,
             activity_type, status, duration_seconds
      from project100_training_sessions
      where user_id = ${actor.userId}
        and session_date >= ${from} and session_date <= ${to}
      order by session_date desc
      limit ${PER_SOURCE_LIMIT}
    `,
    sql<MealRow[]>`
      select id, to_char(eaten_on, 'YYYY-MM-DD') as eaten_on, eaten_at_minute,
             meal_type, title, source, protein_g, kcal
      from project100_meals
      where user_id = ${actor.userId}
        and eaten_on >= ${from} and eaten_on <= ${to}
      order by eaten_on desc, eaten_at_minute nulls last, id
      limit ${PER_SOURCE_LIMIT * 4}
    `,
    sql<BodyRow[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, metric, label, unit, value
      from project100_body_measurements
      where user_id = ${actor.userId}
        and measured_on >= ${from} and measured_on <= ${to}
      order by measured_on desc, metric
      limit ${PER_SOURCE_LIMIT * 4}
    `,
    sql<MediaRow[]>`
      select id, to_char(captured_on, 'YYYY-MM-DD') as captured_on, category, caption
      from project100_media
      where user_id = ${actor.userId}
        and captured_on >= ${from} and captured_on <= ${to}
      order by captured_on desc
      limit ${PER_SOURCE_LIMIT}
    `,
  ]);

  const items: Project100TimelineItem[] = [];

  for (const row of journal) {
    items.push({
      kind: "journal",
      id: `journal-${row.written_on}`,
      on: row.written_on.slice(0, 10),
      atMinute: null,
      title: journalExcerpt(row.body, 90) || "Dagsform utan text",
      detail: null,
      href: `/projekt-100/dagbok?dag=${row.written_on.slice(0, 10)}`,
      sensitive: false,
    });
  }

  for (const row of sessions) {
    items.push({
      kind: "training",
      id: `training-${row.id}`,
      on: row.session_date.slice(0, 10),
      atMinute: null,
      title: row.title,
      detail: [
        STATUS_WORDS[row.status] ?? row.status,
        PROJECT100_ACTIVITY_LABELS[row.activity_type],
        minutes(row.duration_seconds),
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/projekt-100/traning",
      sensitive: false,
    });
  }

  for (const row of meals) {
    const day = row.eaten_on.slice(0, 10);
    const protein = nutritionNumber(row.protein_g);
    const kcal = nutritionNumber(row.kcal);
    items.push({
      kind: "meal",
      id: `meal-${row.id}`,
      on: day,
      atMinute: row.eaten_at_minute,
      title: row.title,
      detail: [
        PROJECT100_MEAL_TYPE_LABELS[row.meal_type],
        MEAL_SOURCE_WORDS[row.source],
        protein === null ? null : `${numberFormatter.format(protein)} g protein`,
        kcal === null ? null : `${numberFormatter.format(kcal)} kcal`,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/projekt-100/kost?dag=${day}`,
      sensitive: false,
    });
  }

  // One line per measured day rather than per measurement, so a day with eight
  // tape-measure readings does not bury the pass it was taken after.
  const byDay = new Map<string, string[]>();
  for (const row of body) {
    const day = row.measured_on.slice(0, 10);
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed)) continue;
    const list = byDay.get(day) ?? [];
    list.push(
      `${project100MetricLabel(row.metric, row.label)} ${formatMeasurement(parsed, row.unit)}`,
    );
    byDay.set(day, list);
  }
  for (const [day, parts] of byDay) {
    items.push({
      kind: "body",
      id: `body-${day}`,
      on: day,
      atMinute: null,
      title: parts[0],
      detail: parts.length > 1 ? parts.slice(1).join(" · ") : null,
      href: `/projekt-100/kropp?period=90&fran=${addCalendarDateDays(day, -45)}&till=${day}`,
      sensitive: false,
    });
  }

  for (const row of media) {
    items.push({
      kind: "media",
      id: `media-${row.id}`,
      on: row.captured_on.slice(0, 10),
      atMinute: null,
      title: row.caption ?? (CATEGORY_WORDS[row.category] ?? "Bild"),
      detail: row.caption ? (CATEGORY_WORDS[row.category] ?? null) : null,
      href: `/projekt-100/media?kategori=${row.category}`,
      // A body picture is covered on the timeline too, not only in the gallery.
      sensitive: row.category === "body",
    });
  }

  return { from, to, days: groupProject100Timeline(items) };
}
