import type { Metadata } from "next";

import { BodyJourney } from "@/components/project100/BodyJourney";
import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100BodyJourney } from "@/server/project100-body";
import { loadProject100MediaLibrary } from "@/server/project100-media";

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
  }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const query = await searchParams;
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const preset = first(query.period) ?? "90";
  const days = preset in PRESET_DAYS ? PRESET_DAYS[preset] : 90;

  // The period lives in the URL so a view can be bookmarked and so the same
  // window carries over to the pages that compare against it.
  const to = first(query.till) ?? today;
  const from = first(query.fran) ?? (days === null ? "2000-01-01" : addCalendarDateDays(to, -days));

  const [journey, library] = await Promise.all([
    loadProject100BodyJourney(actor, { from, to }),
    loadProject100MediaLibrary(actor, { category: "body", limit: 12 }),
  ]);

  return (
    <BodyJourney
      journey={journey}
      photos={library.items}
      activePreset={preset in PRESET_DAYS ? preset : "90"}
    />
  );
}
