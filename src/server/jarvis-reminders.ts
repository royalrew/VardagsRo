/**
 * Jarvis Contextual Reminder Engine.
 *
 * Intelligently parses natural Swedish reminder commands and anchors
 * reminder due dates/times to user calendar context (e.g. work shift end time,
 * specific weekdays, morning/evening context).
 */

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import type { ActorContext } from "@/server/authorization-types";
import { loadDashboard, saveManualTask } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";

export interface ParsedSwedishReminder {
  title: string;
  targetDate: string; // YYYY-MM-DD
  timeString?: string; // HH:MM
  contextAnchor?: "after_work" | "before_work" | "morning" | "afternoon" | "evening";
}

export interface ContextualReminderResult {
  taskId: string;
  title: string;
  dueAt: string;
  targetDate: string;
  timeLabel: string;
  workShiftNote: string | null;
  text: string;
}

const SWEDISH_WEEKDAYS: Record<string, number> = {
  söndag: 0,
  måndag: 1,
  tisdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lördag: 6,
};

const SWEDISH_MONTHS: Record<string, string> = {
  januari: "01",
  februari: "02",
  mars: "03",
  april: "04",
  maj: "05",
  juni: "06",
  juli: "07",
  augusti: "08",
  september: "09",
  oktober: "10",
  november: "11",
  december: "12",
};

/**
 * Parses natural Swedish reminder intent and temporal context.
 */
export function parseSwedishReminder(
  rawText: string,
  referenceDate: Date = new Date(),
): ParsedSwedishReminder | null {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // Check if it is a reminder/task intent
  if (
    !/(?:påminn\s+mig|påminnelse|lägg\s+in\s+en\s+påminnelse|skapa\s+en\s+påminnelse|kom\s+ihåg\s+att)/i.test(
      lower,
    )
  ) {
    return null;
  }

  const todayStr = calendarDateInTimeZone(referenceDate, DEFAULT_TIME_ZONE);
  const refParts = new Date(`${todayStr}T12:00:00Z`);
  const refDayOfWeek = refParts.getUTCDay(); // 0-6

  // 1. Resolve Target Date
  let targetDate = todayStr;

  if (/\bikväll\b|\bidag\b/i.test(lower)) {
    targetDate = todayStr;
  } else if (/\bi\s*övermorgon\b/i.test(lower)) {
    targetDate = addCalendarDateDays(todayStr, 2);
  } else if (/\bimorgon\b/i.test(lower)) {
    targetDate = addCalendarDateDays(todayStr, 1);
  } else {
    // Check weekday: "på fredag", "på måndag", etc.
    let matchedWeekday: number | null = null;
    for (const [name, dayNum] of Object.entries(SWEDISH_WEEKDAYS)) {
      const regex = new RegExp(`\\b(?:på\\s+)?${name}\\b`, "i");
      if (regex.test(lower)) {
        matchedWeekday = dayNum;
        break;
      }
    }

    if (matchedWeekday !== null) {
      let diff = (matchedWeekday - refDayOfWeek + 7) % 7;
      if (diff === 0) diff = 7; // Next week's weekday
      targetDate = addCalendarDateDays(todayStr, diff);
    } else {
      // Check explicit date: "den 15 september" / "15 sep"
      const dateMatch = lower.match(/\b(?:den\s+)?(\d{1,2})[e|a]?\s+([a-zåäö]+)/i);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, "0");
        const monthKey = dateMatch[2].toLowerCase();
        const month = SWEDISH_MONTHS[monthKey] || null;
        if (month) {
          const year = referenceDate.getFullYear();
          targetDate = `${year}-${month}-${day}`;
        }
      }
    }
  }

  // 2. Resolve Context Anchor / Time
  let contextAnchor: ParsedSwedishReminder["contextAnchor"] = undefined;
  let timeString: string | undefined = undefined;

  const timeMatch = lower.match(/\b(?:kl|klockan)\s*(\d{1,2})(?::(\d{2}))?\b/i);
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, "0");
    const minutes = (timeMatch[2] || "00").padStart(2, "0");
    timeString = `${hours}:${minutes}`;
  } else if (/(?:efter\s+jobbet|efter\s+arbetet|efter\s+passet)/i.test(lower)) {
    contextAnchor = "after_work";
  } else if (/(?:före\s+jobbet|innan\s+jobbet|före\s+passet)/i.test(lower)) {
    contextAnchor = "before_work";
  } else if (/(?:på\s+morgonen|morgon)/i.test(lower)) {
    contextAnchor = "morning";
  } else if (/(?:på\s+förmiddagen|förmiddag)/i.test(lower)) {
    timeString = "10:00";
  } else if (/(?:på\s+eftermiddagen|eftermiddag)/i.test(lower)) {
    contextAnchor = "afternoon";
  } else if (/(?:på\s+kvällen|ikväll|kväll)/i.test(lower)) {
    contextAnchor = "evening";
  }

  // 3. Extract Clean Title
  let cleanTitle = text
    .replace(/^.*?(?:påminn\s+mig\s+(?:om\s+)?(?:att\s+)?(?:jag\s+skall|jag\s+ska|att\s+)?|lägg\s+in\s+(?:en\s+)?påminnelse\s+(?:om\s+)?(?:att\s+)?|skapa\s+(?:en\s+)?påminnelse\s+(?:om\s+)?(?:att\s+)?|kom\s+ihåg\s+att\s+)/i, "")
    .trim();

  // Strip temporal noise from the end or middle
  cleanTitle = cleanTitle
    .replace(/\b(?:på\s+)?(?:måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)\b/gi, "")
    .replace(/\b(?:idag|ikväll|imorgon|i\s*övermorgon)\b/gi, "")
    .replace(/\b(?:efter\s+jobbet|efter\s+arbetet|efter\s+passet|före\s+jobbet|innan\s+jobbet)\b/gi, "")
    .replace(/\b(?:på\s+morgonen|på\s+förmiddagen|på\s+eftermiddagen|på\s+kvällen)\b/gi, "")
    .replace(/\b(?:kl|klockan)\s*\d{1,2}(?::\d{2})?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^(?:att\s+|om\s+att\s+|om\s+)/i, "")
    .trim();

  if (!cleanTitle) {
    cleanTitle = "Påminnelse";
  } else {
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  }

  return {
    title: cleanTitle,
    targetDate,
    timeString,
    contextAnchor,
  };
}

/**
 * Creates a contextual reminder anchored to the user's work schedule.
 */
export async function createContextualReminder(
  actor: ActorContext,
  input: {
    title: string;
    targetDate: string;
    timeString?: string;
    contextAnchor?: "after_work" | "before_work" | "morning" | "afternoon" | "evening";
    notes?: string;
  },
): Promise<ContextualReminderResult> {
  assertProject100Adult(actor);

  const dashboard = await loadDashboard(actor);
  const targetDate = input.targetDate;
  let timeStr = input.timeString || "12:00";
  let workShiftNote: string | null = null;

  // Look for work events on targetDate
  const workEvent = dashboard.events.find(
    (e) => e.startsAt.startsWith(targetDate) && e.category === "work" && (e.personId === actor.personId || !e.personId),
  );

  if (input.contextAnchor === "after_work") {
    if (workEvent) {
      // e.g. "2026-09-04T16:00:00.000Z" -> endsAt 16:00
      const workEndTime = workEvent.endsAt.slice(11, 16);
      const [hours, mins] = workEndTime.split(":").map(Number);
      const reminderMin = mins + 30;
      const remHours = (hours + Math.floor(reminderMin / 60)) % 24;
      const remMins = reminderMin % 60;
      timeStr = `${String(remHours).padStart(2, "0")}:${String(remMins).padStart(2, "0")}`;
      workShiftNote = `efter ditt arbetspass som slutar kl ${workEndTime}`;
    } else {
      timeStr = "16:30";
      workShiftNote = "eftermiddagen (du är ledig från arbete denna dag)";
    }
  } else if (input.contextAnchor === "before_work") {
    if (workEvent) {
      const workStartTime = workEvent.startsAt.slice(11, 16);
      const [hours, mins] = workStartTime.split(":").map(Number);
      const remHours = (hours - 1 + 24) % 24;
      timeStr = `${String(remHours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
      workShiftNote = `före ditt arbetspass som börjar kl ${workStartTime}`;
    } else {
      timeStr = "08:00";
      workShiftNote = "förmiddagen";
    }
  } else if (input.contextAnchor === "morning") {
    timeStr = "08:30";
  } else if (input.contextAnchor === "afternoon") {
    timeStr = "15:00";
  } else if (input.contextAnchor === "evening") {
    timeStr = "19:30";
  }

  const dueAtIso = `${targetDate}T${timeStr}:00.000Z`;

  const task = await saveManualTask(actor, {
    title: input.title,
    personId: actor.personId,
    kind: "bring",
    dueAt: dueAtIso,
    notes: input.notes || (workShiftNote ? `Påminnelse: ${workShiftNote}` : null),
  });

  const dayDate = new Date(`${targetDate}T12:00:00Z`);
  const swedishDay = dayDate.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });

  const contextPhrase = workShiftNote ? ` (${workShiftNote})` : "";
  const text = `Jag har lagt in en påminnelse om att "${task.title}" på ${swedishDay} kl ${timeStr}${contextPhrase}. Den är nu sparad i dina uppgifter.`;

  return {
    taskId: task.id,
    title: task.title,
    dueAt: dueAtIso,
    targetDate,
    timeLabel: timeStr,
    workShiftNote,
    text,
  };
}
