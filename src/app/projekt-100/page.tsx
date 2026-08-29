import type { Metadata } from "next";
import { BriefcaseBusiness, CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";

import { SoloView } from "@/components/SoloView";
import { formatCompactDate, formatTimeRange, zonedDateTimeToInstant } from "@/lib/dates";
import { loadSoloProgress } from "@/server/solo";
import {
  assertProject100Adult,
  loadProject100WorkSchedule,
  requireProject100Actor,
} from "@/server/project100";

export const metadata: Metadata = { title: "Översikt" };

export default async function Project100OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ log?: string | string[] }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const [progress, schedule, query] = await Promise.all([
    loadSoloProgress(actor),
    loadProject100WorkSchedule(actor),
    searchParams,
  ]);
  const todayStart = zonedDateTimeToInstant(progress.today, 0, schedule.timeZone).getTime();
  const nextWork = schedule.workEvents.find(
    (event) => new Date(event.endsAt).getTime() >= todayStart,
  );
  const openLog = query.log === "check-in";

  return (
    <div className="p100-overview">
      <section className="p100-context-bar">
        <span className="p100-context-icon"><BriefcaseBusiness /></span>
        <div>
          <small>Jobbschemat</small>
          {nextWork ? (
            <strong>
              Nästa pass {formatCompactDate(nextWork.startsAt)} ·{" "}
              {formatTimeRange(nextWork.startsAt, nextWork.endsAt, nextWork.allDay, schedule.timeZone)}
            </strong>
          ) : (
            <strong>Inget mer arbetspass inlagt den här veckan</strong>
          )}
        </div>
        {nextWork?.location ? <span className="p100-context-detail"><Clock3 /> {nextWork.location}</span> : null}
        <Link href="/projekt-100/schema"><CalendarDays /> Öppna schema</Link>
      </section>
      <SoloView
        key={openLog ? "check-in" : "overview"}
        initialProgress={progress}
        initialOpenLog={openLog}
      />
    </div>
  );
}
