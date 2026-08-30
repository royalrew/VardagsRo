import type { Metadata } from "next";

import { BodyJourney } from "@/components/project100/BodyJourney";
import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100BodyJourney } from "@/server/project100-body";
import { loadProject100MediaLibrary } from "@/server/project100-media";
import { project100CalendarDateSchema } from "@/server/project100-schemas";
import { loadProject100StrengthDevelopment } from "@/server/project100-strength";

export const metadata: Metadata = { title: "Kropp" };

const PRESET_DAYS: Record<string, number | null> = {
  "30": 30,
  "90": 90,
  "365": 365,
  allt: null,
};

function first(value: string | string[] | undefined): string | null {
  const found = Array.isArray(value) ? value[0] : value;
  return found ?? null;
}

export default async function Project100BodyPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string | string[];
    fran?: string | string[];
    till?: string | string[];
    ovning?: string | string[];
    styrkematt?: string | string[];
  }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const query = await searchParams;
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const requestedPreset = first(query.period) ?? "90";
  const activePreset = requestedPreset in PRESET_DAYS ? requestedPreset : "90";
  const days = PRESET_DAYS[activePreset];

  // The period lives in the URL so a view can be bookmarked and so the same
  // window carries over to the pages that compare against it.
  const parsedTo = project100CalendarDateSchema.safeParse(first(query.till));
  const to = parsedTo.success ? parsedTo.data : today;
  const defaultFrom =
    days === null ? "2000-01-01" : addCalendarDateDays(to, -(days - 1));
  const parsedFrom = project100CalendarDateSchema.safeParse(first(query.fran));
  const requestedFrom = parsedFrom.success ? parsedFrom.data : defaultFrom;
  const from = requestedFrom <= to ? requestedFrom : defaultFrom;

  const [journey, library, strength] = await Promise.all([
    loadProject100BodyJourney(actor, { from, to }),
    loadProject100MediaLibrary(actor, { category: "body", limit: 12 }),
    loadProject100StrengthDevelopment(actor, { from, to }),
  ]);

  return (
    <BodyJourney
      key={`${from}:${to}`}
      journey={journey}
      photos={library.items}
      strength={strength}
      activePreset={activePreset}
      selectedStrengthExerciseId={first(query.ovning)}
      selectedStrengthMetric={first(query.styrkematt)}
    />
  );
}
