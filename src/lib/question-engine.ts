import type {
  AnswerSource,
  AssistantAnswer,
  FamilyDocument,
  FamilyEvent,
  FamilyPerson,
  FamilyTask,
  QuestionPlan,
  TaskKind,
} from "./types";

const DEFAULT_TIME_ZONE = "Europe/Stockholm";

const WORK_TERMS = [
  "jobb",
  "jobbar",
  "jobbarw",
  "jobba",
  "jobbschema",
  "jobbpass",
  "arbete",
  "arbetar",
  "arbetspass",
];
const FOOTBALL_TERMS = ["fotboll", "fotbollen", "fotbollsmatch", "forboll", "forbollen"];
const SCHOOL_TERMS = [
  "skola",
  "skolan",
  "skoldag",
  "skolbrev",
  "skolschema",
  "lektion",
  "fritids",
  "studiedag",
];
const SPORT_TERMS = ["sport", "idrott", "traning", "match", "simskola"];

type LocalDate = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTime = LocalDate & {
  hour: number;
  minute: number;
  second: number;
};

type TimeRange = {
  from: Date;
  to: Date;
};

export interface ParseSwedishQuestionContext {
  people: readonly FamilyPerson[];
  now?: Date;
  timeZone?: string;
  currentPersonId?: string;
}

export interface DeterministicAnswerInput {
  plan: QuestionPlan | null;
  people: readonly FamilyPerson[];
  events: readonly FamilyEvent[];
  documents?: readonly FamilyDocument[];
  timeZone?: string;
}

export interface TaskQuestionPlan {
  from: string | null;
  to: string | null;
  personIds: string[];
  kinds: TaskKind[];
  intent: "list" | "when";
}

export interface DeterministicTaskAnswerInput {
  plan: TaskQuestionPlan | null;
  people: readonly FamilyPerson[];
  tasks: readonly FamilyTask[];
  documents?: readonly FamilyDocument[];
  timeZone?: string;
}

type EventInterval = {
  event: FamilyEvent;
  start: number;
  end: number;
};

type EventPair = {
  first: FamilyEvent;
  second: FamilyEvent;
};

const WEEKDAYS: ReadonlyArray<{ day: number; terms: readonly string[] }> = [
  { day: 1, terms: ["mandag", "mandagen"] },
  { day: 2, terms: ["tisdag", "tisdagen"] },
  { day: 3, terms: ["onsdag", "onsdagen"] },
  { day: 4, terms: ["torsdag", "torsdagen"] },
  { day: 5, terms: ["fredag", "fredagen"] },
  { day: 6, terms: ["lordag", "lordagen"] },
  { day: 0, terms: ["sondag", "sondagen"] },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sv-SE")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(text: string, phrase: string, allowPossessive = false): boolean {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const suffix = allowPossessive ? "s?" : "";
  return new RegExp(
    `(?:^| )${escapeRegExp(normalizedPhrase).replace(/ /g, " +")}${suffix}(?= |$)`,
  ).test(text);
}

function hasAnyPhrase(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => containsPhrase(text, term));
}

function safeTimeZone(timeZone: string | undefined): string {
  const candidate = timeZone || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("sv-SE", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(date: Date, timeZone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function localSerial(value: LocalDateTime): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
}

/** Convert a wall-clock time in an IANA time zone to an instant. */
function zonedDateTimeToDate(value: LocalDateTime, timeZone: string): Date {
  const wanted = localSerial(value);
  let timestamp = wanted;

  // Offsets can change around DST. Re-evaluating converges for normal wall times;
  // the engine only creates midnight boundaries, which exist in Europe/Stockholm.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(timestamp), timeZone);
    const difference = wanted - localSerial(actual);
    if (difference === 0) break;
    timestamp += difference;
  }

  return new Date(timestamp);
}

function addCalendarDays(value: LocalDate, days: number): LocalDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function weekday(value: LocalDate): number {
  return new Date(Date.UTC(value.year, value.month - 1, value.day, 12)).getUTCDay();
}

function rangeForLocalDays(start: LocalDate, days: number, timeZone: string): TimeRange {
  const end = addCalendarDays(start, days);
  return {
    from: zonedDateTimeToDate({ ...start, hour: 0, minute: 0, second: 0 }, timeZone),
    to: zonedDateTimeToDate({ ...end, hour: 0, minute: 0, second: 0 }, timeZone),
  };
}

function parseDateRange(text: string, now: Date, timeZone: string): TimeRange | null {
  const nowParts = zonedParts(now, timeZone);
  const today: LocalDate = {
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  };

  if (hasAnyPhrase(text, ["overmorgon", "i overmorgon"])) {
    return rangeForLocalDays(addCalendarDays(today, 2), 1, timeZone);
  }
  if (hasAnyPhrase(text, ["imorgon", "i morgon"])) {
    return rangeForLocalDays(addCalendarDays(today, 1), 1, timeZone);
  }
  if (hasAnyPhrase(text, ["idag", "i dag"])) {
    return rangeForLocalDays(today, 1, timeZone);
  }

  if (hasAnyPhrase(text, ["i veckan", "den har veckan", "denna vecka"])) {
    const daysSinceMonday = (weekday(today) + 6) % 7;
    return rangeForLocalDays(addCalendarDays(today, -daysSinceMonday), 7, timeZone);
  }

  for (const candidate of WEEKDAYS) {
    const term = candidate.terms.find((item) => containsPhrase(text, item));
    if (!term) continue;

    const todayWeekday = weekday(today);
    const asksForNextWeek = text.includes("nasta vecka");
    let daysAhead = asksForNextWeek
      ? 7 - ((todayWeekday + 6) % 7) + ((candidate.day + 6) % 7)
      : (candidate.day - todayWeekday + 7) % 7;
    const isExplicitlyNext = new RegExp(
      `(?:^| )nasta(?: +veckas?)? +${escapeRegExp(term)}(?= |$)`,
    ).test(text);
    if (isExplicitlyNext && daysAhead === 0) daysAhead = 7;
    return rangeForLocalDays(addCalendarDays(today, daysAhead), 1, timeZone);
  }

  if (hasAnyPhrase(text, ["nasta vecka", "nasta veckan"])) {
    const daysSinceMonday = (weekday(today) + 6) % 7;
    return rangeForLocalDays(addCalendarDays(today, 7 - daysSinceMonday), 7, timeZone);
  }

  if (hasAnyPhrase(text, ["helg", "helgen", "i helgen", "till helgen"])) {
    const todayWeekday = weekday(today);
    let daysToSaturday: number;
    if (todayWeekday === 6) daysToSaturday = 0;
    else if (todayWeekday === 0) daysToSaturday = -1;
    else daysToSaturday = 6 - todayWeekday;

    if (text.includes("nasta helg") && (todayWeekday === 0 || todayWeekday === 6)) {
      daysToSaturday += 7;
    }
    return rangeForLocalDays(addCalendarDays(today, daysToSaturday), 2, timeZone);
  }

  return null;
}

function resolvePeople(
  text: string,
  people: readonly FamilyPerson[],
  currentPersonId?: string,
): { ids: string[]; ambiguous: boolean; unresolvedReference: boolean } {
  const matches = new Set<string>();
  let ambiguous = false;
  const aliases = new Map<string, Set<string>>();

  for (const person of people) {
    const terms = new Set([person.name, person.role, ...person.aliases]);
    if (person.id === currentPersonId) {
      ["jag", "mig", "min", "mitt", "mina"].forEach((term) => terms.add(term));
    }
    for (const term of terms) {
      const normalized = normalizeText(term);
      if (!normalized) continue;
      const personIds = aliases.get(normalized) ?? new Set<string>();
      personIds.add(person.id);
      aliases.set(normalized, personIds);
    }
  }

  if (currentPersonId && people.some((person) => person.id === currentPersonId)) {
    for (const firstPersonTerm of ["jag", "mig", "min", "mitt", "mina"]) {
      aliases.set(firstPersonTerm, new Set([currentPersonId]));
    }
  }

  const orderedAliases = [...aliases.entries()].sort(([a], [b]) => b.length - a.length);
  for (const [alias, personIds] of orderedAliases) {
    if (!containsPhrase(text, alias, true)) continue;
    if (personIds.size > 1) {
      ambiguous = true;
      continue;
    }
    const personId = personIds.values().next().value as string | undefined;
    if (personId) matches.add(personId);
  }

  const genericReferences = [
    "jag",
    "mig",
    "min",
    "mitt",
    "mina",
    "pappa",
    "mamma",
    "far",
    "mor",
    "son",
    "dotter",
    "bror",
    "syster",
  ];
  const hasGenericReference = genericReferences.some((term) => containsPhrase(text, term, true));

  return {
    ids: people.filter((person) => matches.has(person.id)).map((person) => person.id),
    ambiguous,
    unresolvedReference: hasGenericReference && matches.size === 0,
  };
}

function detectActivities(text: string): string[] {
  const found: Array<{ index: number; term: string }> = [];
  const definitions: ReadonlyArray<{ canonical: string; terms: readonly string[] }> = [
    { canonical: "work", terms: WORK_TERMS },
    { canonical: "football", terms: FOOTBALL_TERMS },
    { canonical: "school", terms: SCHOOL_TERMS },
    { canonical: "sport", terms: SPORT_TERMS },
  ];

  for (const definition of definitions) {
    let firstIndex = Number.POSITIVE_INFINITY;
    for (const term of definition.terms) {
      const match = new RegExp(
        `(?:^| )${escapeRegExp(normalizeText(term))}(?= |$)`,
      ).exec(text);
      if (match) firstIndex = Math.min(firstIndex, match.index);
    }
    if (Number.isFinite(firstIndex)) found.push({ index: firstIndex, term: definition.canonical });
  }

  // Football is already a specific sport term; keeping both would falsely require
  // a second, generic sport event before an answer is considered complete.
  const hasFootball = found.some((item) => item.term === "football");
  return found
    .filter((item) => item.term !== "sport" || !hasFootball)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.term);
}

/**
 * Local, deterministic Swedish fallback parser. It deliberately returns null
 * when no supported period is present or a person reference is unsafe to resolve.
 */
export function parseSwedishQuestion(
  question: string,
  context: ParseSwedishQuestionContext,
): QuestionPlan | null {
  const text = normalizeText(question);
  if (!text) return null;

  const timeZone = safeTimeZone(context.timeZone);
  const now = context.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return null;
  const range = parseDateRange(text, now, timeZone);
  if (!range) return null;

  const people = resolvePeople(text, context.people, context.currentPersonId);
  if (people.ambiguous || people.unresolvedReference) return null;

  const activityTerms = detectActivities(text);
  const overlapLanguage = hasAnyPhrase(text, [
    "overlappar",
    "overlapp",
    "samtidigt",
    "krockar",
    "krock",
    "under tiden",
    "medan",
    "nar",
    "da",
  ]);
  const needsOverlap =
    overlapLanguage && (people.ids.length >= 2 || activityTerms.length >= 2);
  const reminderLanguage = hasAnyPhrase(text, ["paminn", "paminnelse", "glom inte"]);

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    personIds: people.ids,
    activityTerms,
    intent: needsOverlap
      ? "overlap"
      : reminderLanguage
        ? "reminder"
        : activityTerms.length === 1 && activityTerms[0] === "work"
          ? "work"
          : "schedule",
    needsOverlap,
  };
}

function hasWordStem(text: string, stems: readonly string[]): boolean {
  return text
    .split(" ")
    .some((word) => stems.some((stem) => word.startsWith(normalizeText(stem))));
}

function detectTaskKinds(text: string): TaskKind[] {
  const kinds: TaskKind[] = [];
  if (hasAnyPhrase(text, ["ta med", "ha med", "med sig", "packa med"])) {
    kinds.push("bring");
  }
  if (hasWordStem(text, ["läx", "hemläx", "hemuppgift", "glos", "inlämning"])) {
    kinds.push("homework");
  }
  if (hasWordStem(text, ["prov", "förhör", "tentamen"])) {
    kinds.push("exam");
  }
  if (
    hasWordStem(text, ["blankett", "formulär", "talong", "lovlapp", "samtyck"])
  ) {
    kinds.push("form");
  }
  if (hasWordStem(text, ["förbered", "förberedelse"])) {
    kinds.push("preparation");
  }
  return [...new Set(kinds)];
}

/**
 * Parse only explicit task/deadline language. Generic schedule questions stay in
 * the calendar parser so a phrase such as "Vad gör jag imorgon?" is not silently
 * reinterpreted as a task query.
 */
export function parseSwedishTaskQuestion(
  question: string,
  context: ParseSwedishQuestionContext,
): TaskQuestionPlan | null {
  const text = normalizeText(question);
  if (!text) return null;

  const kinds = detectTaskKinds(text);
  const hasGeneralTaskLanguage =
    hasWordStem(text, ["deadline", "inlämning", "uppgift"]) ||
    hasAnyPhrase(text, [
      "att göra",
      "ska lämnas",
      "ska lämna in",
      "lämna in",
      "behöver göras",
    ]);
  if (kinds.length === 0 && !hasGeneralTaskLanguage) return null;

  const people = resolvePeople(text, context.people, context.currentPersonId);
  if (people.ambiguous || people.unresolvedReference) return null;

  const timeZone = safeTimeZone(context.timeZone);
  const now = context.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return null;
  const range = parseDateRange(text, now, timeZone);
  const asksWhen = hasAnyPhrase(text, [
    "när",
    "vilken dag",
    "vilket datum",
    "vilken tid",
  ]);

  return {
    from: range?.from.toISOString() ?? null,
    to: range?.to.toISOString() ?? null,
    personIds: people.ids,
    kinds,
    intent: asksWhen ? "when" : "list",
  };
}

function canonicalActivityTerm(term: string): string {
  const normalized = normalizeText(term);
  if (WORK_TERMS.some((candidate) => normalized.includes(normalizeText(candidate)))) return "work";
  if (FOOTBALL_TERMS.some((candidate) => normalized.includes(normalizeText(candidate)))) {
    return "football";
  }
  if (SCHOOL_TERMS.some((candidate) => normalized.includes(normalizeText(candidate)))) return "school";
  if (SPORT_TERMS.some((candidate) => normalized.includes(normalizeText(candidate)))) return "sport";
  return normalized;
}

function eventSearchText(event: FamilyEvent): string {
  return normalizeText(
    [event.title, event.category, event.location ?? "", event.sourceExcerpt ?? ""].join(" "),
  );
}

function eventMatchesTerm(event: FamilyEvent, rawTerm: string): boolean {
  const term = canonicalActivityTerm(rawTerm);
  const text = eventSearchText(event);
  if (term === "work") return event.category === "work" || hasAnyPhrase(text, WORK_TERMS);
  if (term === "football") return FOOTBALL_TERMS.some((item) => text.includes(normalizeText(item)));
  if (term === "school") return event.category === "school" || SCHOOL_TERMS.some((item) => text.includes(normalizeText(item)));
  if (term === "sport") return event.category === "sport" || SPORT_TERMS.some((item) => text.includes(normalizeText(item)));
  return Boolean(term) && text.includes(term);
}

function validInterval(event: FamilyEvent): EventInterval | null {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { event, start, end };
}

function normalizedPlanTerms(plan: QuestionPlan): string[] {
  const terms = [...new Set(plan.activityTerms.map(canonicalActivityTerm).filter(Boolean))];
  if (terms.length === 0 && plan.intent === "work") terms.push("work");
  return terms;
}

function selectEvents(
  events: readonly FamilyEvent[],
  plan: QuestionPlan,
  includeNeedsReview: boolean,
): FamilyEvent[] {
  const from = Date.parse(plan.from);
  const to = Date.parse(plan.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const people = new Set(plan.personIds);
  const terms = normalizedPlanTerms(plan);

  return events
    .flatMap((event) => {
      const interval = validInterval(event);
      return interval ? [interval] : [];
    })
    .filter(({ event, start, end }) => {
      if (!includeNeedsReview && event.status !== "confirmed") return false;
      if (start >= to || end <= from) return false;
      // A family-wide event has no person and therefore concerns everyone, so it
      // stays in the answer no matter who the question was about.
      if (people.size > 0 && event.personId !== null && !people.has(event.personId)) return false;
      if (terms.length > 0 && !terms.some((term) => eventMatchesTerm(event, term))) return false;
      return true;
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.event.id.localeCompare(b.event.id))
    .map(({ event }) => event);
}

/** Select confirmed events intersecting the plan's half-open [from, to) period. */
export function selectRelevantEvents(
  events: readonly FamilyEvent[],
  plan: QuestionPlan,
): FamilyEvent[] {
  return selectEvents(events, plan, false);
}

/** Select only approved, unfinished tasks that match the requested dimensions. */
export function selectRelevantTasks(
  tasks: readonly FamilyTask[],
  plan: TaskQuestionPlan,
): FamilyTask[] {
  const people = new Set(plan.personIds);
  const kinds = new Set(plan.kinds);
  const hasRange = plan.from !== null || plan.to !== null;
  const from = plan.from === null ? Number.NEGATIVE_INFINITY : Date.parse(plan.from);
  const to = plan.to === null ? Number.POSITIVE_INFINITY : Date.parse(plan.to);
  if (
    (plan.from !== null && !Number.isFinite(from)) ||
    (plan.to !== null && !Number.isFinite(to)) ||
    (plan.from !== null && plan.to !== null && to <= from)
  ) {
    return [];
  }

  return tasks
    .filter((task) => task.reviewStatus === "confirmed" && task.completedAt === null)
    .filter((task) => people.size === 0 || people.has(task.personId))
    .filter((task) => kinds.size === 0 || kinds.has(task.kind))
    .filter((task) => {
      if (!hasRange) return true;
      if (task.dueAt === null) return false;
      const dueAt = Date.parse(task.dueAt);
      return Number.isFinite(dueAt) && dueAt >= from && dueAt < to;
    })
    .sort((first, second) => {
      const firstDue = first.dueAt === null ? Number.POSITIVE_INFINITY : Date.parse(first.dueAt);
      const secondDue = second.dueAt === null ? Number.POSITIVE_INFINITY : Date.parse(second.dueAt);
      const safeFirst = Number.isFinite(firstDue) ? firstDue : Number.POSITIVE_INFINITY;
      const safeSecond = Number.isFinite(secondDue) ? secondDue : Number.POSITIVE_INFINITY;
      return safeFirst - safeSecond || first.id.localeCompare(second.id);
    });
}

/** Exact intersection in minutes. Touching endpoints do not overlap. */
export function calculateOverlap(
  first: Pick<FamilyEvent, "startsAt" | "endsAt">,
  second: Pick<FamilyEvent, "startsAt" | "endsAt">,
): number {
  const firstStart = Date.parse(first.startsAt);
  const firstEnd = Date.parse(first.endsAt);
  const secondStart = Date.parse(second.startsAt);
  const secondEnd = Date.parse(second.endsAt);
  if (
    ![firstStart, firstEnd, secondStart, secondEnd].every(Number.isFinite) ||
    firstEnd <= firstStart ||
    secondEnd <= secondStart
  ) {
    return 0;
  }
  return Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart)) / 60_000;
}

function dimensionsCovered(events: readonly FamilyEvent[], plan: QuestionPlan): boolean {
  const peopleCovered = plan.personIds.every((personId) =>
    events.some((event) => event.personId === personId || event.personId === null),
  );
  const termsCovered = normalizedPlanTerms(plan).every((term) =>
    events.some((event) => eventMatchesTerm(event, term)),
  );
  return peopleCovered && termsCovered;
}

function termMatches(event: FamilyEvent, terms: readonly string[]): Set<string> {
  return new Set(terms.filter((term) => eventMatchesTerm(event, term)));
}

function meaningfulPairs(events: readonly FamilyEvent[], plan: QuestionPlan): EventPair[] {
  const pairs: EventPair[] = [];
  const terms = normalizedPlanTerms(plan);
  const acrossPeople = new Set(plan.personIds).size >= 2;
  const acrossActivities = terms.length >= 2;

  for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < events.length; secondIndex += 1) {
      const first = events[firstIndex];
      const second = events[secondIndex];
      if (acrossPeople && first.personId === second.personId) continue;

      if (acrossActivities) {
        const firstTerms = termMatches(first, terms);
        const secondTerms = termMatches(second, terms);
        const separatedActivities = terms.some(
          (term) => firstTerms.has(term) && terms.some((other) => other !== term && secondTerms.has(other)),
        ) || terms.some(
          (term) => secondTerms.has(term) && terms.some((other) => other !== term && firstTerms.has(other)),
        );
        if (!separatedActivities) continue;
      }

      pairs.push({ first, second });
    }
  }
  return pairs;
}

function overlapSummary(pairs: readonly EventPair[]): {
  minutes: number;
  firstOverlappingPair: EventPair | null;
} {
  const intervals: Array<{ start: number; end: number }> = [];
  let firstOverlappingPair: EventPair | null = null;

  for (const pair of pairs) {
    const start = Math.max(Date.parse(pair.first.startsAt), Date.parse(pair.second.startsAt));
    const end = Math.min(Date.parse(pair.first.endsAt), Date.parse(pair.second.endsAt));
    if (end <= start) continue;
    if (!firstOverlappingPair) firstOverlappingPair = pair;
    intervals.push({ start, end });
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }

  const milliseconds = merged.reduce((total, interval) => total + interval.end - interval.start, 0);
  return { minutes: milliseconds / 60_000, firstOverlappingPair };
}

function formatClock(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(":", ".");
}

function formatDate(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function calendarDayNumber(value: string | Date, timeZone: string): number {
  const parts = zonedParts(new Date(value), timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toLocaleUpperCase("sv-SE") + value.slice(1) : value;
}

function formatPeriod(plan: Pick<QuestionPlan, "from" | "to">, timeZone: string): string {
  const from = new Date(plan.from);
  const to = new Date(plan.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return "den valda perioden";

  const days = calendarDayNumber(to, timeZone) - calendarDayNumber(from, timeZone);
  if (days === 1) return formatDate(from, timeZone);

  const lastMoment = new Date(to.getTime() - 1);
  return `${formatDate(from, timeZone)}–${formatDate(lastMoment, timeZone)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    const value = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(minutes);
    return `${value} ${minutes === 1 ? "minut" : "minuter"}`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes - hours * 60;
  const hourText = `${hours} ${hours === 1 ? "timme" : "timmar"}`;
  if (remaining === 0) return hourText;
  return `${hourText} och ${formatDuration(remaining)}`;
}

function personLabel(personId: string, people: readonly FamilyPerson[]): string {
  const person = people.find((candidate) => candidate.id === personId);
  return person?.role || person?.name || "Okänd person";
}

function eventLabel(
  event: FamilyEvent,
  people: readonly FamilyPerson[],
  timeZone: string,
): string {
  const time = event.allDay
    ? "hela dagen"
    : `kl. ${formatClock(event.startsAt, timeZone)}–${formatClock(event.endsAt, timeZone)}`;
  const who = event.personId === null ? "Hela familjen" : personLabel(event.personId, people);
  return `${who} – ${event.title} ${time}`;
}

function buildSources(
  events: readonly FamilyEvent[],
  documents: readonly FamilyDocument[],
): AnswerSource[] {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  return [...new Map(events.map((event) => [event.id, event])).values()].map((event) => ({
    id: event.id,
    title: event.documentId
      ? documentsById.get(event.documentId)?.title ?? event.title
      : event.title,
    documentId: event.documentId,
    kind: "event",
    eventId: event.id,
    taskId: null,
  }));
}

function buildTaskSources(
  tasks: readonly FamilyTask[],
  documents: readonly FamilyDocument[],
): AnswerSource[] {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  return [...new Map(tasks.map((task) => [task.id, task])).values()].map((task) => ({
    id: task.id,
    title: task.documentId
      ? documentsById.get(task.documentId)?.title ?? task.title
      : task.title,
    documentId: task.documentId,
    kind: "task",
    eventId: null,
    taskId: task.id,
  }));
}

function taskKindLabel(kinds: readonly TaskKind[]): string {
  if (kinds.length !== 1) return "uppgifter och deadlines";
  switch (kinds[0]) {
    case "homework":
      return "läxor";
    case "exam":
      return "prov";
    case "bring":
      return "saker att ta med";
    case "form":
      return "blanketter";
    case "preparation":
      return "förberedelser";
    default:
      return "uppgifter";
  }
}

function taskPeriodLabel(plan: TaskQuestionPlan, timeZone: string): string {
  if (plan.from === null || plan.to === null) return "Aktuella uppgifter";
  return capitalize(formatPeriod({ from: plan.from, to: plan.to }, timeZone));
}

function taskDueLabel(task: FamilyTask, timeZone: string): string | null {
  if (task.dueAt === null) return null;
  const dueAt = new Date(task.dueAt);
  if (!Number.isFinite(dueAt.getTime())) return null;
  const local = zonedParts(dueAt, timeZone);
  const date = formatDate(dueAt, timeZone);
  return local.hour === 0 && local.minute === 0
    ? date
    : `${date} kl. ${formatClock(task.dueAt, timeZone)}`;
}

function taskAnswer(
  text: string,
  hasEnoughData: boolean,
  periodLabel: string,
  tasks: readonly FamilyTask[],
  documents: readonly FamilyDocument[],
): AssistantAnswer {
  return {
    text,
    hasEnoughData,
    matchedEventIds: [],
    matchedTaskIds: tasks.map((task) => task.id),
    sources: buildTaskSources(tasks, documents),
    overlapMinutes: 0,
    periodLabel,
  };
}

/**
 * Answer task/deadline questions strictly from confirmed, unfinished tasks.
 * Needs-review and completed rows are deliberately invisible to the answer.
 */
export function answerTaskQuestionDeterministically({
  plan,
  people,
  tasks,
  documents = [],
  timeZone: requestedTimeZone,
}: DeterministicTaskAnswerInput): AssistantAnswer {
  const timeZone = safeTimeZone(requestedTimeZone);
  if (!plan) {
    return taskAnswer(
      "Jag saknar underlag för att förstå vilken uppgift eller deadline du menar.",
      false,
      "Okänd period",
      [],
      [],
    );
  }

  const knownPersonIds = new Set(people.map((person) => person.id));
  if (plan.personIds.some((personId) => !knownPersonIds.has(personId))) {
    return taskAnswer(
      "Jag saknar underlag för att koppla uppgiften till rätt familjemedlem.",
      false,
      taskPeriodLabel(plan, timeZone),
      [],
      [],
    );
  }

  const householdIds = new Set(people.map((person) => person.householdId));
  const scopedTasks = householdIds.size
    ? tasks.filter((task) => householdIds.has(task.householdId))
    : [...tasks];
  const scopedDocuments = householdIds.size
    ? documents.filter((document) => householdIds.has(document.householdId))
    : [...documents];
  const relevantTasks = selectRelevantTasks(scopedTasks, plan);
  const periodLabel = taskPeriodLabel(plan, timeZone);
  const kindLabel = taskKindLabel(plan.kinds);

  if (relevantTasks.length === 0) {
    const periodPhrase =
      plan.from !== null && plan.to !== null
        ? ` under ${periodLabel.toLocaleLowerCase("sv-SE")}`
        : "";
    return taskAnswer(
      `Jag saknar underlag för bekräftade ${kindLabel}${periodPhrase}.`,
      false,
      periodLabel,
      [],
      scopedDocuments,
    );
  }

  if (plan.intent === "when") {
    if (relevantTasks.length > 1) {
      return taskAnswer(
        `Jag hittade flera bekräftade ${kindLabel}, så jag vet inte vilken du menar. Fråga gärna med uppgiftens namn eller person.`,
        false,
        periodLabel,
        relevantTasks,
        scopedDocuments,
      );
    }

    const task = relevantTasks[0];
    const due = taskDueLabel(task, timeZone);
    if (!due) {
      return taskAnswer(
        `Jag hittade ”${task.title}”, men jag vet inte när den ska vara klar eftersom en bekräftad deadline saknas.`,
        false,
        periodLabel,
        [task],
        scopedDocuments,
      );
    }
    return taskAnswer(
      `”${task.title}” ska vara klar senast ${due} enligt det bekräftade underlaget.`,
      true,
      periodLabel,
      [task],
      scopedDocuments,
    );
  }

  const descriptions = relevantTasks.map((task) => {
    const person = personLabel(task.personId, people);
    const due = taskDueLabel(task, timeZone);
    return `${person} – ${task.title}${due ? `, senast ${due}` : ", utan angiven deadline"}`;
  });
  return taskAnswer(
    `${periodLabel}: ${descriptions.join("; ")}.`,
    true,
    periodLabel,
    relevantTasks,
    scopedDocuments,
  );
}

function insufficientAnswer(
  text: string,
  periodLabel: string,
  plan?: QuestionPlan,
  events: readonly FamilyEvent[] = [],
  documents: readonly FamilyDocument[] = [],
): AssistantAnswer {
  return {
    text,
    hasEnoughData: false,
    matchedEventIds: events.map((event) => event.id),
    matchedTaskIds: [],
    sources: buildSources(events, documents),
    overlapMinutes: 0,
    periodLabel,
    ...(plan ? { plan } : {}),
  };
}

/**
 * Compose an answer only from a validated plan and calendar facts. An empty result
 * is not treated as proof that something does not happen.
 */
export function answerQuestionDeterministically({
  plan,
  people,
  events,
  documents = [],
  timeZone: requestedTimeZone,
}: DeterministicAnswerInput): AssistantAnswer {
  const timeZone = safeTimeZone(requestedTimeZone);
  if (!plan) {
    return insufficientAnswer(
      "Jag saknar underlag för att svara säkert. Ange gärna idag, imorgon, en veckodag eller helgen.",
      "Okänd period",
    );
  }

  const periodLabel = capitalize(formatPeriod(plan, timeZone));
  const from = Date.parse(plan.from);
  const to = Date.parse(plan.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return insufficientAnswer(
      "Jag kunde inte tolka vilken period frågan gäller och vill därför inte gissa.",
      "Okänd period",
      plan,
    );
  }

  const knownPersonIds = new Set(people.map((person) => person.id));
  if (plan.personIds.some((personId) => !knownPersonIds.has(personId))) {
    return insufficientAnswer(
      "Jag saknar underlag för att koppla frågan till rätt familjemedlem.",
      periodLabel,
      plan,
    );
  }

  const householdIds = new Set(people.map((person) => person.householdId));
  const scopedEvents = householdIds.size
    ? events.filter((event) => householdIds.has(event.householdId))
    : [...events];
  const scopedDocuments = householdIds.size
    ? documents.filter((document) => householdIds.has(document.householdId))
    : [...documents];
  const relevantEvents = selectRelevantEvents(scopedEvents, plan);

  if (relevantEvents.length === 0 || !dimensionsCovered(relevantEvents, plan)) {
    const allCandidates = selectEvents(scopedEvents, plan, true);
    if (allCandidates.some((event) => event.status !== "confirmed")) {
      return insufficientAnswer(
        `Jag hittade underlag för ${periodLabel.toLocaleLowerCase("sv-SE")}, men det behöver granskas eller kompletteras innan jag kan svara säkert.`,
        periodLabel,
        plan,
        allCandidates,
        scopedDocuments,
      );
    }
    return insufficientAnswer(
      `Jag saknar underlag för att svara säkert om ${periodLabel.toLocaleLowerCase("sv-SE")}. Kontrollera att rätt schema eller kallelse är uppladdad och bekräftad.`,
      periodLabel,
      plan,
      relevantEvents,
      scopedDocuments,
    );
  }

  const sources = buildSources(relevantEvents, scopedDocuments);
  const common = {
    hasEnoughData: true,
    matchedEventIds: relevantEvents.map((event) => event.id),
    matchedTaskIds: [],
    sources,
    periodLabel,
    plan,
  };

  if (plan.needsOverlap || plan.intent === "overlap") {
    const pairs = meaningfulPairs(relevantEvents, plan);
    if (pairs.length === 0) {
      return insufficientAnswer(
        `Jag saknar två jämförbara kalenderposter för ${periodLabel.toLocaleLowerCase("sv-SE")} och vill därför inte gissa om de överlappar.`,
        periodLabel,
        plan,
        relevantEvents,
        scopedDocuments,
      );
    }

    const overlap = overlapSummary(pairs);
    if (overlap.minutes > 0 && overlap.firstOverlappingPair) {
      const pair = overlap.firstOverlappingPair;
      return {
        ...common,
        text: `Ja. ${eventLabel(pair.first, people, timeZone)} och ${eventLabel(pair.second, people, timeZone)} överlappar med ${formatDuration(overlap.minutes)}.`,
        overlapMinutes: overlap.minutes,
      };
    }
    return {
      ...common,
      text: `Nej. De bekräftade kalenderposterna för ${periodLabel.toLocaleLowerCase("sv-SE")} överlappar inte.`,
      overlapMinutes: 0,
    };
  }

  const eventDescriptions = relevantEvents
    .map((event) => eventLabel(event, people, timeZone))
    .join(", ");
  const planTerms = normalizedPlanTerms(plan);
  const workOnly = plan.intent === "work" && planTerms.every((term) => term === "work");
  return {
    ...common,
    text: workOnly
      ? `Ja. ${eventDescriptions} enligt det bekräftade underlaget.`
      : `${periodLabel}: ${eventDescriptions}.`,
    overlapMinutes: 0,
  };
}
