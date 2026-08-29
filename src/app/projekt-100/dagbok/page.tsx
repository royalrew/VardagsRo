import type { Metadata } from "next";

import { JournalWorkspace } from "@/components/project100/JournalWorkspace";
import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100Journal } from "@/server/project100-journal";
import { loadProject100Timeline } from "@/server/project100-timeline";

export const metadata: Metadata = { title: "Dagbok" };

function first(value: string | string[] | undefined): string | null {
  const found = Array.isArray(value) ? value[0] : value;
  const trimmed = found?.trim();
  return trimmed ? trimmed : null;
}

function calendarDay(value: string | null, fallback: string): string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function Project100JournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    dag?: string | string[];
    sok?: string | string[];
    fran?: string | string[];
    till?: string | string[];
  }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const query = await searchParams;
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const day = calendarDay(first(query.dag), today);
  const search = first(query.sok);

  const [view, timeline, openDay] = await Promise.all([
    loadProject100Journal(actor, {
      from: first(query.fran),
      to: first(query.till),
      // A two-character floor keeps a stray keystroke from scanning a year of
      // writing; anything shorter is treated as no search at all.
      query: search !== null && search.length >= 2 ? search : null,
    }),
    loadProject100Timeline(actor, { from: null, to: null }),
    // Read the open day on its own. Taking it from the filtered list would hand
    // the writing area a blank draft whenever a search or a period hid that day,
    // and saving would then overwrite what was actually written.
    loadProject100Journal(actor, { from: day, to: day, query: null }),
  ]);

  return (
    <JournalWorkspace
      view={view}
      timeline={timeline.days}
      selected={openDay.entries[0] ?? null}
      selectedDay={day}
    />
  );
}
