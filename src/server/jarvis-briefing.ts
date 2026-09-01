/**
 * Jarvis Daily Briefing Engine.
 *
 * Synthesizes grounded morning briefings and evening debriefs combining:
 * - Work shifts from the family calendar
 * - Family & children's school events
 * - Projekt 100 training windows & planned sessions
 * - Nutrition targets, daily protein progress & batch preps
 * - Due tasks & packing reminders
 *
 * Adheres to Zero Hallucination and Glass & Steel UX.
 */

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import type { ActorContext } from "@/server/authorization-types";
import { loadDashboard } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";
import { loadProject100Journal } from "@/server/project100-journal";
import { loadProject100NutritionDay } from "@/server/project100-nutrition";
import { loadProject100TrainingSessions } from "@/server/project100-training";

export interface MorningBriefingResult {
  date: string;
  dayLabel: string;
  workShift: {
    title: string;
    startsAt: string;
    endsAt: string;
    type: "day" | "evening" | "night" | "free";
  } | null;
  familyEvents: Array<{ title: string; person: string; time: string }>;
  plannedSession: { title: string; activityType: string; suggestedWindow: string } | null;
  proteinTargetG: number;
  proteinEatenG: number;
  prepBatchesCount: number;
  dueTasks: Array<{ title: string; kind: string }>;
  text: string;
}

export interface EveningBriefingResult {
  date: string;
  completedSessionsCount: number;
  completedSessions: Array<{ title: string; activityType: string }>;
  proteinEatenG: number;
  proteinTargetG: number;
  proteinRemainingG: number;
  hasJournalEntry: boolean;
  nextMorningEvent: { title: string; time: string } | null;
  text: string;
}

function formatTimeOnly(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: DEFAULT_TIME_ZONE });
  } catch {
    return "";
  }
}

function getSwedishDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Generates a proactive morning briefing.
 */
export async function generateMorningBriefing(
  actor: ActorContext,
  options: { date?: string; callerName?: string } = {},
): Promise<MorningBriefingResult> {
  assertProject100Adult(actor);

  const now = new Date();
  const targetDate = options.date || calendarDateInTimeZone(now, DEFAULT_TIME_ZONE);
  const callerName = options.callerName || "Jimmy";
  const dayLabel = getSwedishDayLabel(targetDate);

  const [dashboard, sessions, nutritionDay] = await Promise.all([
    loadDashboard(actor),
    loadProject100TrainingSessions(actor),
    loadProject100NutritionDay(actor, targetDate).catch(() => null),
  ]);

  // 1. Work shifts (distinguishing caller vs other family members)
  const dayEvents = dashboard.events.filter((e) => {
    const eventDate = calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE);
    return eventDate === targetDate;
  });

  const callerPerson = dashboard.people.find((p) => p.id === actor.personId);
  const resolvedCallerName = options.callerName || callerPerson?.name || "Jimmy";

  const myWorkEvent = dayEvents.find(
    (e) => e.category === "work" && (e.personId === actor.personId || (!e.personId && dashboard.people.length === 1)),
  );
  const otherWorkEvents = dayEvents.filter(
    (e) => e.category === "work" && e.personId && e.personId !== actor.personId,
  );

  let workShift: MorningBriefingResult["workShift"] = null;

  if (myWorkEvent) {
    const startTime = formatTimeOnly(myWorkEvent.startsAt);
    const endTime = formatTimeOnly(myWorkEvent.endsAt);
    const startHour = parseInt(startTime.slice(0, 2), 10) || 7;
    const shiftType = startHour < 12 ? "day" : startHour < 18 ? "evening" : "night";

    workShift = {
      title: myWorkEvent.title,
      startsAt: startTime,
      endsAt: endTime,
      type: shiftType,
    };
  }

  // 2. Family Events
  const familyEvents = dayEvents
    .filter((e) => e.category !== "work")
    .map((e) => {
      const person = dashboard.people.find((p) => p.id === e.personId);
      return {
        title: e.title,
        person: person?.name ?? "Familjen",
        time: formatTimeOnly(e.startsAt),
      };
    });

  // 3. Training
  const plannedSessionObj = sessions.find(
    (s) => s.sessionDate === targetDate && (s.status === "planned" || s.status === "in_progress"),
  );

  let plannedSession: MorningBriefingResult["plannedSession"] = null;
  if (plannedSessionObj) {
    let suggestedWindow = "under eftermiddagen";
    if (workShift) {
      if (workShift.type === "day") suggestedWindow = `kl ${workShift.endsAt ? `${parseInt(workShift.endsAt.slice(0, 2), 10) + 1}:30` : "17:30"} (efter jobbet)`;
      else if (workShift.type === "evening") suggestedWindow = "förmiddagen (kl 09:30-11:00 före jobbet)";
    } else {
      suggestedWindow = "förmiddagen kl 10:00";
    }

    plannedSession = {
      title: plannedSessionObj.title,
      activityType: plannedSessionObj.activityType,
      suggestedWindow,
    };
  }

  // 4. Nutrition
  const proteinTargetG = nutritionDay?.target?.overrideGrams ?? nutritionDay?.target?.lowGrams ?? 160;
  const proteinEatenG = Math.round(nutritionDay?.eaten?.proteinG ?? 0);
  const prepBatchesCount = nutritionDay?.batches?.filter((b) => b.portionsLeft > 0).length ?? 0;

  // 5. Tasks
  const dueTasks = dashboard.tasks
    .filter((t) => !t.completedAt && (t.dueAt?.slice(0, 10) === targetDate || t.kind === "bring"))
    .map((t) => ({ title: t.title, kind: t.kind }));

  // Synthesize Text
  const parts: string[] = [
    `God morgon ${resolvedCallerName}! Här är din morgonöversikt för ${dayLabel}:`,
  ];

  const spouseWorkSummaries = otherWorkEvents.map((e) => {
    const person = dashboard.people.find((p) => p.id === e.personId);
    const personName = person?.name ?? "Hanni";
    const startTime = formatTimeOnly(e.startsAt);
    const endTime = formatTimeOnly(e.endsAt);
    return `${personName} jobbar (${startTime}–${endTime})`;
  });

  if (workShift) {
    let jobText = `💼 Jobb: Du (${resolvedCallerName}) jobbar ${workShift.title} (${workShift.startsAt}–${workShift.endsAt}).`;
    if (spouseWorkSummaries.length > 0) {
      jobText += ` ${spouseWorkSummaries.join(", ")}.`;
    }
    parts.push(jobText);
  } else if (spouseWorkSummaries.length > 0) {
    parts.push(`💼 Jobb: Du (${resolvedCallerName}) är ledig idag! ${spouseWorkSummaries.join(", ")}.`);
  } else {
    parts.push(`🎉 Jobb: Du (${resolvedCallerName}) är ledig från arbete idag!`);
  }

  if (familyEvents.length > 0) {
    parts.push(
      `📅 Familj & Skola: ${familyEvents.map((e) => `${e.title} för ${e.person}${e.time ? ` (${e.time})` : ""}`).join(", ")}.`,
    );
  }

  if (plannedSession) {
    parts.push(
      `🏋️‍♂️ Träning: Planerat pass är "${plannedSession.title}". Bästa fönstret är ${plannedSession.suggestedWindow}.`,
    );
  }

  parts.push(
    `🥩 Kost: Dagens proteinmål är ${proteinTargetG}g protein.${prepBatchesCount > 0 ? ` Du har ${prepBatchesCount} förberedda matlådor i kylen.` : ""}`,
  );

  if (dueTasks.length > 0) {
    parts.push(`🎒 Att komma ihåg: ${dueTasks.map((t) => t.title).join(", ")}.`);
  }

  return {
    date: targetDate,
    dayLabel,
    workShift,
    familyEvents,
    plannedSession,
    proteinTargetG,
    proteinEatenG,
    prepBatchesCount,
    dueTasks,
    text: parts.join("\n"),
  };
}

/**
 * Generates an evening debrief & status check.
 */
export async function generateEveningBriefing(
  actor: ActorContext,
  options: { date?: string; callerName?: string } = {},
): Promise<EveningBriefingResult> {
  assertProject100Adult(actor);

  const now = new Date();
  const targetDate = options.date || calendarDateInTimeZone(now, DEFAULT_TIME_ZONE);
  const tomorrowDate = addCalendarDateDays(targetDate, 1);
  const callerName = options.callerName || "Jimmy";

  const [dashboard, sessions, nutritionDay, journal] = await Promise.all([
    loadDashboard(actor),
    loadProject100TrainingSessions(actor),
    loadProject100NutritionDay(actor, targetDate).catch(() => null),
    loadProject100Journal(actor, { from: targetDate, to: targetDate, query: null }).catch(() => null),
  ]);

  // 1. Training results
  const completedToday = sessions.filter(
    (s) => s.sessionDate === targetDate && s.status === "completed",
  );

  // 2. Nutrition results
  const proteinTargetG = nutritionDay?.target?.overrideGrams ?? nutritionDay?.target?.lowGrams ?? 160;
  const proteinEatenG = Math.round(nutritionDay?.eaten?.proteinG ?? 0);
  const proteinRemainingG = Math.max(0, proteinTargetG - proteinEatenG);

  // 3. Journal status
  const existingJournalEntry = journal?.entries?.find((e) => e.writtenOn === targetDate);
  const hasJournalEntry = Boolean(existingJournalEntry && (existingJournalEntry.body || existingJournalEntry.energy));

  // 4. Next morning event
  const tomorrowEvents = dashboard.events.filter((e) => e.startsAt.slice(0, 10) === tomorrowDate);
  let nextMorningEvent: EveningBriefingResult["nextMorningEvent"] = null;
  if (tomorrowEvents.length > 0) {
    const first = tomorrowEvents[0];
    nextMorningEvent = {
      title: first.title,
      time: formatTimeOnly(first.startsAt),
    };
  }

  // Synthesize Text
  const parts: string[] = [
    `God kväll ${callerName}! Här är kvällens avstämning:`,
  ];

  if (completedToday.length > 0) {
    parts.push(
      `✅ Träning: Bra jobbat! Genomfört idag: ${completedToday.map((s) => `"${s.title}"`).join(", ")}.`,
    );
  } else {
    parts.push(`🏋️‍♂️ Träning: Inget pass loggat som genomfört idag.`);
  }

  if (proteinRemainingG === 0) {
    parts.push(`🥩 Kost: Grymt! Du nådde proteinmålet (${proteinEatenG}g av ${proteinTargetG}g).`);
  } else {
    parts.push(
      `🥩 Kost: Du har nått ${proteinEatenG}g av ditt mål på ${proteinTargetG}g (${proteinRemainingG}g kvar). Ta gärna en kvällsshake eller kvarg om du vill nå hela vägen.`,
    );
  }

  if (hasJournalEntry) {
    parts.push(`📖 Dagbok: Dagens reflektion och form är sparad.`);
  } else {
    parts.push(`📖 Dagbok: Vill du tala in en snabb anteckning om dagsform, energi eller sömn innan du lägger dig?`);
  }

  if (nextMorningEvent) {
    parts.push(`⏰ Imorgon: Första händelse är ${nextMorningEvent.title}${nextMorningEvent.time ? ` kl ${nextMorningEvent.time}` : ""}.`);
  }

  return {
    date: targetDate,
    completedSessionsCount: completedToday.length,
    completedSessions: completedToday.map((s) => ({ title: s.title, activityType: s.activityType })),
    proteinEatenG,
    proteinTargetG,
    proteinRemainingG,
    hasJournalEntry,
    nextMorningEvent,
    text: parts.join("\n"),
  };
}
