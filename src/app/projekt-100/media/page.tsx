import type { Metadata } from "next";

import { MediaLibrary } from "@/components/project100/MediaLibrary";
import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  PROJECT100_MEDIA_CATEGORY_ORDER,
  type Project100MediaCategory,
} from "@/lib/project100-media";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import {
  loadProject100MediaLibrary,
  loadProject100SessionOptions,
} from "@/server/project100-media";

export const metadata: Metadata = { title: "Media" };

function categoryFrom(value: string | string[] | undefined): Project100MediaCategory | null {
  const first = Array.isArray(value) ? value[0] : value;
  return PROJECT100_MEDIA_CATEGORY_ORDER.find((candidate) => candidate === first) ?? null;
}

export default async function Project100MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string | string[] }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  // The filter lives in the URL so a view can be bookmarked and shared between
  // this page and the one that opened it.
  const category = categoryFrom((await searchParams).kategori);
  const [library, sessions] = await Promise.all([
    loadProject100MediaLibrary(actor, { category, limit: 60 }),
    loadProject100SessionOptions(actor),
  ]);

  return (
    <MediaLibrary
      library={library}
      sessions={sessions}
      today={calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE)}
      activeCategory={category}
    />
  );
}
