import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type {
  DocumentExtraction,
  ExtractedEvent,
  FamilyPerson,
  QuestionPlan,
} from "@/lib/types";
import { openAIConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import type { AcceptedMimeType } from "@/server/storage";

const extractionEventSchema = z.object({
  title: z.string().max(200),
  category: z.enum(["work", "school", "sport", "health", "family", "other"]),
  startsAt: z.string().max(64),
  endsAt: z.string().max(64),
  allDay: z.boolean(),
  location: z.string().max(300).nullable(),
  notes: z.string().max(2_000).nullable(),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(800),
});

const extractionTaskSchema = z.object({
  title: z.string().max(200),
  kind: z.enum(["homework", "exam", "bring", "form", "preparation", "other"]),
  dueAt: z.string().max(64).nullable(),
  notes: z.string().max(1_000).nullable(),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(800),
});

const extractionSchema = z.object({
  title: z.string().max(200),
  documentType: z.string().max(100),
  summary: z.string().max(1_000),
  personHint: z.string().max(100),
  periodLabel: z.string().max(100),
  events: z.array(extractionEventSchema).max(100),
  tasks: z.array(extractionTaskSchema).max(100),
});

const plannedQuestionSchema = z.object({
  hasEnoughInformation: z.boolean(),
  unresolvedPerson: z.boolean(),
  from: z.string().max(64),
  to: z.string().max(64),
  personIds: z.array(z.string().max(128)).max(20),
  activityTerms: z.array(z.string().max(80)).max(20),
  intent: z.enum(["schedule", "work", "overlap", "reminder"]),
  needsOverlap: z.boolean(),
  // The language the question was written in, so the answer can be given back
  // in it. Anything we are not prepared to answer in reports "other".
  language: z.enum(["sv", "so", "other"]),
});

let client: OpenAI | null = null;
let clientKey = "";

function openAI(): { client: OpenAI; model: string } | null {
  const config = openAIConfig();
  if (!config) return null;
  if (!client || clientKey !== config.apiKey) {
    client = new OpenAI({
      apiKey: config.apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });
    clientKey = config.apiKey;
  }
  return { client, model: config.model };
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sv-SE")
    .trim();
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  const escaped = normalized(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, " +");
  return Boolean(escaped) && new RegExp(`(?:^| )${escaped}s?(?= |$)`).test(normalized(text));
}

function referencedPersonIds(
  question: string,
  people: readonly FamilyPerson[],
  currentPersonId?: string,
): string[] {
  const ids = people
    .filter((person) =>
      [person.name, person.role, ...person.aliases].some((term) =>
        containsNormalizedPhrase(question, term),
      ),
    )
    .map((person) => person.id);
  if (
    currentPersonId &&
    ["jag", "mig", "min", "mitt", "mina"].some((term) =>
      containsNormalizedPhrase(question, term),
    )
  ) {
    ids.push(currentPersonId);
  }
  return [...new Set(ids)];
}

export function hasUnresolvedFamilyReference(
  question: string,
  people: readonly FamilyPerson[],
  currentPersonId?: string,
): boolean {
  const familyRoles = [
    "jag",
    "mig",
    "min",
    "mitt",
    "mina",
    "pappa",
    "mamma",
    "far",
    "mor",
    "morfar",
    "mormor",
    "farfar",
    "farmor",
    "bonusmamma",
    "bonuspappa",
    "bror",
    "syster",
    "son",
    "dotter",
    "make",
    "fru",
    "sambo",
  ];
  return familyRoles.some((role) => {
    if (!containsNormalizedPhrase(question, role)) return false;
    if (["jag", "mig", "min", "mitt", "mina"].includes(role)) {
      return !currentPersonId || !people.some((person) => person.id === currentPersonId);
    }
    return !people.some((person) =>
      [person.name, person.role, ...person.aliases].some(
        (candidate) => normalized(candidate) === normalized(role),
      ),
    );
  });
}

function matchPerson(hint: string, people: readonly FamilyPerson[]): string | null {
  const target = normalized(hint);
  if (!target) return null;
  const exact = people.find((person) =>
    [person.name, person.role, ...person.aliases].some(
      (candidate) => normalized(candidate) === target,
    ),
  );
  if (exact) return exact.id;

  const contained = people.find((person) =>
    [person.name, person.role, ...person.aliases].some((candidate) => {
      const value = normalized(candidate);
      return value.length >= 3 && (target.includes(value) || value.includes(target));
    }),
  );
  return contained?.id ?? null;
}

function validEventDateRange(startsAt: string, endsAt: string): boolean {
  const hasExplicitOffset = (value: string) =>
    /T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  if (!hasExplicitOffset(startsAt) || !hasExplicitOffset(endsAt)) return false;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function validTaskDueAt(dueAt: string | null): boolean {
  if (dueAt === null) return true;
  const hasExplicitOffset =
    /T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(dueAt);
  return hasExplicitOffset && Number.isFinite(Date.parse(dueAt));
}

export function normalizeExtractedTaskDueAt(dueAt: string | null): string | null {
  return validTaskDueAt(dueAt) ? dueAt : null;
}

type ExtractionEventWithoutId = Omit<ExtractedEvent, "id">;

function medvindWorkCode(event: ExtractionEventWithoutId): "ar" | "bo" | "ob" | null {
  if (event.category !== "work" || event.allDay) return null;
  const match = /(?:^|\s)(Ar|Bo|Ob)(?=\s|$)/i.exec(event.sourceExcerpt);
  return (match?.[1].toLocaleLowerCase("sv-SE") as "ar" | "bo" | "ob" | undefined) ?? null;
}

function uniqueText(values: readonly (string | null)[], separator: string): string | null {
  const unique = [...new Set(values.map((value) => value?.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(separator) : null;
}

/**
 * Medvind can show the ordinary shift (Ar) together with booked/unbooked
 * department segments (Bo/Ob). They still describe one continuous work period,
 * so overlapping or directly adjacent rows must not become duplicate calendar
 * events. A real gap remains two separate shifts.
 */
export function mergeMedvindWorkEvents(
  input: readonly ExtractionEventWithoutId[],
): ExtractionEventWithoutId[] {
  const events = [...input].sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt) || left.endsAt.localeCompare(right.endsAt),
  );
  const merged: ExtractionEventWithoutId[] = [];

  for (const event of events) {
    const previous = merged.at(-1);
    const canMerge =
      previous !== undefined &&
      medvindWorkCode(previous) !== null &&
      medvindWorkCode(event) !== null &&
      previous.startsAt.slice(0, 10) === event.startsAt.slice(0, 10) &&
      Date.parse(event.startsAt) <= Date.parse(previous.endsAt);

    if (!canMerge || !previous) {
      merged.push({ ...event });
      continue;
    }

    merged[merged.length - 1] = {
      ...previous,
      title: "Jobb",
      category: "work",
      startsAt:
        Date.parse(event.startsAt) < Date.parse(previous.startsAt)
          ? event.startsAt
          : previous.startsAt,
      endsAt:
        Date.parse(event.endsAt) > Date.parse(previous.endsAt)
          ? event.endsAt
          : previous.endsAt,
      location: uniqueText([previous.location, event.location], ", "),
      notes: uniqueText([previous.notes, event.notes], "\n"),
      confidence: Math.min(previous.confidence, event.confidence),
      sourceExcerpt:
        uniqueText([previous.sourceExcerpt, event.sourceExcerpt], "; ") ?? previous.sourceExcerpt,
    };
  }

  return merged;
}

/**
 * A pupil cannot be in two lessons at once, so overlapping school lessons in the
 * same extraction are never two things that both happen. They are the parallel
 * columns a timetable uses when the class splits into groups: the language
 * choice, Swedish against Swedish as a second language, or two craft groups.
 *
 * The timetable shows every group's option because it is printed for the whole
 * class. Which one applies to this child is not in the document, and the model
 * was previously told to leave uncertain rows out — so these lessons vanished
 * and the calendar showed a hole where the child was actually in school.
 *
 * They are collapsed into one entry instead: the time is certain even when the
 * room is not. The alternatives are kept in the note so the family can pick,
 * and the confidence is low so the entry reads as a question, not a fact.
 */
const PARALLEL_LESSON_CONFIDENCE = 0.4;

function overlaps(a: ExtractionEventWithoutId, b: ExtractionEventWithoutId): boolean {
  return (
    new Date(a.startsAt).getTime() < new Date(b.endsAt).getTime() &&
    new Date(b.startsAt).getTime() < new Date(a.endsAt).getTime()
  );
}

function alternativeLine(event: ExtractionEventWithoutId): string {
  const room = event.location?.trim();
  return room ? `- ${event.title} (${room})` : `- ${event.title}`;
}

function mergedParallelLesson(
  group: readonly ExtractionEventWithoutId[],
): ExtractionEventWithoutId {
  const titles = [...new Set(group.map((event) => event.title.trim()).filter(Boolean))];
  const rooms = [...new Set(group.map((event) => event.location?.trim()).filter(Boolean))];
  const existingNotes = uniqueText(
    group.map((event) => event.notes),
    " ",
  );

  const alternatives = group.map(alternativeLine).join("\n");
  const explanation = `Gruppdelad lektion. Eleven går i en av dessa:\n${alternatives}`;

  return {
    // One shared subject means only the group differs, and the subject is then
    // known. Different subjects are listed so the family recognises the slot.
    title: titles.length === 1 ? titles[0] : titles.join(" / "),
    category: "school",
    // The pupil is in school for the whole slot whichever group they belong to,
    // so the span covers every alternative.
    startsAt: group.reduce(
      (earliest, event) => (event.startsAt < earliest ? event.startsAt : earliest),
      group[0].startsAt,
    ),
    endsAt: group.reduce(
      (latest, event) => (event.endsAt > latest ? event.endsAt : latest),
      group[0].endsAt,
    ),
    allDay: false,
    location: rooms.length === 1 ? rooms[0]! : null,
    notes: existingNotes ? `${existingNotes}\n\n${explanation}` : explanation,
    confidence: Math.min(PARALLEL_LESSON_CONFIDENCE, ...group.map((event) => event.confidence)),
    sourceExcerpt:
      uniqueText(
        group.map((event) => event.sourceExcerpt),
        " | ",
      ) ?? group[0].sourceExcerpt,
  };
}

export function mergeParallelSchoolLessons(
  events: readonly ExtractionEventWithoutId[],
): ExtractionEventWithoutId[] {
  const lessons = events.filter((event) => event.category === "school" && !event.allDay);
  if (lessons.length < 2) return [...events];

  const ordered = [...lessons].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const groups: ExtractionEventWithoutId[][] = [];
  for (const lesson of ordered) {
    const group = groups.find((candidate) =>
      candidate.some((member) => overlaps(member, lesson)),
    );
    if (group) group.push(lesson);
    else groups.push([lesson]);
  }

  const merged = groups.map((group) => (group.length === 1 ? group[0] : mergedParallelLesson(group)));
  const untouched = events.filter((event) => !lessons.includes(event));
  return [...untouched, ...merged].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function localDateLabel(timezone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date());
}

export function openAIIsConfigured(): boolean {
  return openAIConfig() !== null;
}

export async function extractDocument(input: {
  bytes: Uint8Array;
  filename: string;
  mimeType: AcceptedMimeType;
  hash: string;
  people: readonly FamilyPerson[];
  timezone: string;
}): Promise<DocumentExtraction> {
  const ai = openAI();
  if (!ai) {
    throw new AppError(
      503,
      "OPENAI_NOT_CONFIGURED",
      "Dokumenttolkningen är inte konfigurerad ännu.",
    );
  }

  const peopleDescription = input.people
    .map(
      (person) =>
        `${person.name} (id används inte här), roll ${person.role}, alias: ${person.aliases.join(", ")}`,
    )
    .join("\n");
  const prompt = [
    "Läs familjedokumentet och extrahera kalenderhändelser och uppgifter på svenska.",
    `Nu är ${localDateLabel(input.timezone)}. Tidszon: ${input.timezone}.`,
    "Returnera kompletta ISO 8601-tider med UTC-offset. Gissa inte datum som saknas.",
    "Utelämna en händelse bara när dess tid är okänd. Osäkerhet om vad som händer under en känd tid ska returneras, aldrig kastas: familjen måste kunna se att tiden är upptagen.",
    "För schemarader ska varje verklig arbets- eller frånvaroperiod bli en händelse. Sluttiden måste vara efter starttiden.",
    "Arbetsscheman från svensk kommunal vård använder korta koder efter tiden. Tolka dem så här:",
    "Ar = arbetspass, titel \"Jobb\", kategori work.",
    "An = annat arbete som möte eller kontorstid, titel \"Jobb (annat arbete)\", kategori work.",
    "Bo = bokad arbetstid och Ob = obokad arbetstid. Båda betyder att personen arbetar, ibland på en annan avdelning; använd titel \"Jobb\" och kategori work.",
    "Ar, Bo och Ob kan vara överlappande eller direkt sammanhängande rader som beskriver samma verkliga arbetspass. Returnera då ett enda Jobb-event för hela den sammanhängande perioden och bevara bokningsinformationen i notes. Om det finns en verklig tidslucka ska det vara två pass.",
    "Se = semester. Detta är frånvaro, inte arbete. Titel \"Semester\", kategori family.",
    "Tp = tillfällig föräldrapenning, alltså vård av sjukt barn. Detta är frånvaro, inte arbete. Titel \"Vab\", kategori family.",
    "Fp = föräldraledigt. Detta är frånvaro, inte arbete. Varje tidsatt Fp-rad måste bli en händelse med titel \"Föräldraledigt\" och kategori family.",
    "En frånvarokod får aldrig bli kategori work, även om raden har klockslag. Familjen måste kunna se skillnad på att någon jobbar och att någon är ledig.",
    "Rader som bara säger Ledig är fridagar och ska inte bli händelser.",
    "Gula eller inramade textrutor i en dagruta är kalenderanteckningar, inte egna pass eller tasks. Bevara hela texten i notes på det pass eller den frånvaroperiod den hör till. Om anteckningen anger ett klockslag ska den kopplas till den överlappande delen av det sammanslagna arbetspasset. Om den uttryckligen namnger en annan enhet eller arbetsplats ska den också användas som location. Personnamn eller initialer är inte arbetsplatser.",
    "Sätt notes till null när dagen saknar anteckning.",
    "Varningsikoner och färgade bakgrunder i ett schema är systemets egen markering och ska ignoreras.",
    "Ett skolschema är ett veckorutnät med en kolumn per veckodag. Varje lektionsruta blir en händelse med kategori school. Location är salskoden i rutan, till exempel E23 eller B36. Skolans namn är aldrig en sal.",
    "Om schemat anger veckonummer i stället för datum, räkna ut veckans datum och använd dem.",
    "Smala parallella kolumner inom samma tidslucka betyder att klassen delas i grupper: språkval som franska, spanska och tyska, svenska mot svenska som andraspråk, eller två slöjdgrupper. Schemat är tryckt för hela klassen, så alla gruppers alternativ syns även om eleven bara går i ett av dem.",
    "Returnera varje sådant alternativ som en egen händelse med samma start- och sluttid, med sitt eget ämne och sin egen sal. Utelämna dem aldrig och slå inte ihop dem själv. Vilken grupp eleven tillhör står inte i dokumentet, men tiden är säker, och en lektion som saknas ser ut som en håltimme.",
    "Skolschemats ämneskoder ska skrivas ut som läsbara svenska ämnesnamn i titeln: Ty blir Tyska, Fr blir Franska, Sp blir Spanska, En blir Engelska, Enf blir Engelska förstärkning, Sv blir Svenska, Sva eller Svaåk blir Svenska som andraspråk, Sl blir Slöjd, Ma blir Matematik, No blir Naturorienterande ämnen, So blir Samhällsorienterande ämnen, Bd blir Bild, Mu blir Musik, Id blir Idrott och hälsa, Tk blir Teknik.",
    "Siffror och bokstäver efter ämnet, som 7a eller aa, är klass- och gruppbeteckningar. De hör hemma i notes, aldrig i titeln.",
    "Extrahera läxor, prov, saker att ta med, blanketter och förberedelser som tasks. En task ska alltid vara ofärdig.",
    "Sätt task.dueAt endast när dokumentet uttryckligen anger ett entydigt datum. Gissa aldrig datum från sammanhang, ordning eller dagens datum; använd null när datumet saknas eller är osäkert.",
    "Om ett uttryckligt datum saknar klockslag, normalisera tiden till 23:59 i dokumentets tidszon. dueAt ska annars vara komplett ISO 8601 med UTC-offset.",
    "Källutdrag ska vara korta och exakt återge den relevanta raden, utan känsliga uppgifter som inte behövs.",
    "personHint ska vara namnet eller familjerollen som dokumentet gäller. periodLabel ska vara en kort svensk period.",
    `Familjemedlemmar:\n${peopleDescription || "Inga profiler ännu."}`,
  ].join("\n");

  const encoded = Buffer.from(input.bytes).toString("base64");
  const attachment =
    input.mimeType === "application/pdf"
      ? {
          type: "input_file" as const,
          filename: input.filename,
          file_data: `data:application/pdf;base64,${encoded}`,
          detail: "high" as const,
        }
      : {
          type: "input_image" as const,
          image_url: `data:${input.mimeType};base64,${encoded}`,
          detail: "high" as const,
        };

  try {
    const response = await ai.client.responses.parse({
      model: ai.model,
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            attachment,
          ],
        },
      ],
      text: { format: zodTextFormat(extractionSchema, "family_document_extraction") },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      throw new AppError(
        422,
        "EXTRACTION_EMPTY",
        "Dokumentet kunde inte tolkas. Prova en tydligare bild.",
      );
    }

    const events = mergeParallelSchoolLessons(
      mergeMedvindWorkEvents(
        parsed.events.filter((event) => validEventDateRange(event.startsAt, event.endsAt)),
      ),
    ).map((event) => ({ ...event, id: crypto.randomUUID() }));
    const tasks = parsed.tasks
      .map((task) => ({
        ...task,
        id: crypto.randomUUID(),
        title: task.title.trim(),
        dueAt: normalizeExtractedTaskDueAt(task.dueAt),
        notes: task.notes?.trim() || null,
        sourceExcerpt: task.sourceExcerpt.trim(),
      }))
      .filter((task) => task.title.length > 0);

    return {
      title: parsed.title.trim() || input.filename,
      documentType: parsed.documentType.trim() || "Dokument",
      summary: parsed.summary.trim(),
      personHint: parsed.personHint.trim(),
      personId: matchPerson(parsed.personHint, input.people),
      periodLabel: parsed.periodLabel.trim(),
      events,
      tasks,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      storageKey: null,
      hash: input.hash,
    };
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError(
      502,
      "OPENAI_EXTRACTION_FAILED",
      "Dokumentet kunde inte tolkas just nu. Försök igen.",
      { cause },
    );
  }
}

export async function planQuestionWithAI(input: {
  question: string;
  people: readonly FamilyPerson[];
  timezone: string;
  now?: Date;
  currentPersonId?: string;
}): Promise<QuestionPlan | null> {
  const ai = openAI();
  if (!ai) return null;

  const now = input.now ?? new Date();
  const people = input.people.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    aliases: person.aliases,
  }));

  try {
    const response = await ai.client.responses.parse({
      model: ai.model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "Du planerar endast en kalenderfråga. Frågan kan vara skriven på svenska eller somaliska; ange vilket i language. Du får inte besvara frågan eller hitta på kalenderposter. Tolka tidsperiod, personer och aktivitetstermer. Lämna personIds tom när frågan inte namnger någon: en fråga om vad som händer gäller hela familjen, inte den som frågar. Lämna activityTerms tom när frågan inte namnger en aktivitet; frågeord som vad, händer eller gör är inte aktiviteter. För överlapp ska needsOverlap vara true. Använd exakt person-id från listan. Sätt hasEnoughInformation=false om en entydig tidsperiod saknas. Sätt unresolvedPerson=true om frågan nämner en person som inte säkert kan kopplas till listan.",
        },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            now: now.toISOString(),
            localNow: localDateLabel(input.timezone),
            timezone: input.timezone,
            currentPersonId: input.currentPersonId ?? null,
            people,
          }),
        },
      ],
      text: { format: zodTextFormat(plannedQuestionSchema, "calendar_question_plan") },
    });
    const parsed = response.output_parsed;
    if (!parsed || !parsed.hasEnoughInformation || parsed.unresolvedPerson) return null;

    const from = Date.parse(parsed.from);
    const to = Date.parse(parsed.to);
    const hasExplicitOffset = (value: string) =>
      /T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
    if (!hasExplicitOffset(parsed.from) || !hasExplicitOffset(parsed.to)) return null;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    if (to - from > 366 * 24 * 60 * 60 * 1_000) return null;

    const validIds = new Set(input.people.map((person) => person.id));
    const personIds = [...new Set(parsed.personIds.filter((id) => validIds.has(id)))];
    if (personIds.length !== new Set(parsed.personIds).size) return null;
    const referencedIds = referencedPersonIds(
      input.question,
      input.people,
      input.currentPersonId,
    );
    if (referencedIds.some((id) => !personIds.includes(id))) return null;

    // Who the question is about is decided here, from the question itself, not
    // by the model. Left to its own judgement it quietly narrowed general
    // questions to the person asking: "Vad händer på torsdag?" answered only
    // about them, and a day full of the family's entries was reported as empty
    // whenever they personally had nothing.
    const askedAbout = referencedIds.length > 0 ? referencedIds : [];
    return {
      // "other" falls back to Swedish rather than guessing at a language we
      // have not verified we can answer in.
      language: parsed.language === "so" ? "so" : "sv",
      from: parsed.from,
      to: parsed.to,
      personIds: askedAbout,
      activityTerms: [...new Set(parsed.activityTerms.map((term) => term.trim()).filter(Boolean))],
      intent: parsed.intent,
      needsOverlap: parsed.needsOverlap,
    };
  } catch {
    return null;
  }
}
