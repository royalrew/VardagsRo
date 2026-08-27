import { describe, expect, it } from "vitest";

import {
  answerTaskQuestionDeterministically,
  answerQuestionDeterministically,
  calculateOverlap,
  parseSwedishTaskQuestion,
  parseSwedishQuestion,
  selectRelevantEvents,
  selectRelevantTasks,
} from "./question-engine";
import type {
  FamilyDocument,
  FamilyEvent,
  FamilyPerson,
  FamilyTask,
  QuestionPlan,
} from "./types";

const HOUSEHOLD_ID = "household-1";

const people: FamilyPerson[] = [
  {
    id: "person-self",
    householdId: HOUSEHOLD_ID,
    name: "Nora",
    role: "Jag",
    personType: "adult",
    aliases: ["jag", "mig", "Nora"],
    initials: "N",
    color: "#111111",
    tint: "#eeeeee",
  },
  {
    id: "person-dad",
    householdId: HOUSEHOLD_ID,
    name: "Mikael",
    role: "Pappa",
    personType: "adult",
    aliases: ["pappa", "far", "Micke"],
    initials: "M",
    color: "#222222",
    tint: "#dddddd",
  },
  {
    id: "person-mom",
    householdId: HOUSEHOLD_ID,
    name: "Sara",
    role: "Mamma",
    personType: "adult",
    aliases: ["mamma", "mor"],
    initials: "S",
    color: "#333333",
    tint: "#cccccc",
  },
  {
    id: "person-ida",
    householdId: HOUSEHOLD_ID,
    name: "Ida",
    role: "Barn",
    personType: "child",
    aliases: ["Ida"],
    initials: "I",
    color: "#444444",
    tint: "#bbbbbb",
  },
  {
    id: "person-kalle",
    householdId: HOUSEHOLD_ID,
    name: "Kalle",
    role: "Barn",
    personType: "child",
    aliases: ["Kalle"],
    initials: "K",
    color: "#555555",
    tint: "#aaaaaa",
  },
];

function event(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: "event-1",
    householdId: HOUSEHOLD_ID,
    personId: "person-dad",
    documentId: "document-work",
    title: "Jobb",
    category: "work",
    startsAt: "2026-08-23T05:00:00.000Z",
    endsAt: "2026-08-23T14:00:00.000Z",
    allDay: false,
    location: "Sjukhuset",
    notes: null,
    status: "confirmed",
    confidence: 0.98,
    sourceExcerpt: "Sön 07.00–16.00 Mikael",
    ...overrides,
  };
}

function document(overrides: Partial<FamilyDocument> = {}): FamilyDocument {
  return {
    id: "document-work",
    householdId: HOUSEHOLD_ID,
    title: "Mikaels jobbschema",
    filename: "jobb.jpg",
    mimeType: "image/jpeg",
    documentType: "Jobbschema",
    personId: "person-dad",
    folderId: null,
    status: "confirmed",
    uploadedAt: "2026-08-20T12:00:00.000Z",
    periodLabel: "Augusti",
    summary: "Arbetspass",
    storageKey: null,
    eventsCount: 1,
    tasksCount: 0,
    ...overrides,
  };
}

function task(overrides: Partial<FamilyTask> = {}): FamilyTask {
  return {
    id: "task-bring",
    householdId: HOUSEHOLD_ID,
    personId: "person-ida",
    documentId: "document-school",
    title: "Gympakläder och vattenflaska",
    kind: "bring",
    dueAt: "2026-08-21T06:00:00.000Z",
    completedAt: null,
    notes: null,
    reviewStatus: "confirmed",
    confidence: 0.97,
    sourceExcerpt: "Ta med gympakläder och vattenflaska på fredag.",
    ...overrides,
  };
}

const sundayPlan: QuestionPlan = {
  from: "2026-08-22T22:00:00.000Z",
  to: "2026-08-23T22:00:00.000Z",
  personIds: ["person-dad", "person-self"],
  activityTerms: ["work", "football"],
  intent: "overlap",
  needsOverlap: true,
};

describe("parseSwedishQuestion", () => {
  it("uses Stockholm's local day for idag and imorgon", () => {
    const now = new Date("2026-08-20T22:30:00.000Z"); // 00.30 on 21 August locally

    const today = parseSwedishQuestion("Vad gör jag idag?", {
      people,
      now,
      timeZone: "Europe/Stockholm",
      currentPersonId: "person-self",
    });
    const tomorrow = parseSwedishQuestion("Vad gör jag imorgon?", {
      people,
      now,
      timeZone: "Europe/Stockholm",
      currentPersonId: "person-self",
    });

    expect(today).toMatchObject({
      from: "2026-08-20T22:00:00.000Z",
      to: "2026-08-21T22:00:00.000Z",
      personIds: ["person-self"],
    });
    expect(tomorrow).toMatchObject({
      from: "2026-08-21T22:00:00.000Z",
      to: "2026-08-22T22:00:00.000Z",
      personIds: ["person-self"],
    });
  });

  it("keeps local midnight boundaries across the spring DST transition", () => {
    const plan = parseSwedishQuestion("Vad händer imorgon?", {
      people,
      now: new Date("2026-03-28T12:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toMatchObject({
      from: "2026-03-28T23:00:00.000Z",
      to: "2026-03-29T22:00:00.000Z",
    });
    expect(Date.parse(plan!.to) - Date.parse(plan!.from)).toBe(23 * 60 * 60 * 1_000);
  });

  it("recognizes school questions separately from sport and work", () => {
    const plan = parseSwedishQuestion("Har Nora skola imorgon?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toMatchObject({
      personIds: ["person-self"],
      activityTerms: ["school"],
      intent: "schedule",
      needsOverlap: false,
    });
  });

  it("supports next week as a bounded local period for the school starter question", () => {
    const plan = parseSwedishQuestion("Har jag något från skolan nästa vecka?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
      currentPersonId: "person-self",
    });

    expect(plan).toMatchObject({
      from: "2026-08-23T22:00:00.000Z",
      to: "2026-08-30T22:00:00.000Z",
      personIds: ["person-self"],
      activityTerms: ["school"],
    });
  });

  it("keeps a weekday inside next week instead of skipping an extra week", () => {
    const plan = parseSwedishQuestion("Vad händer nästa vecka på tisdag?", {
      people,
      now: new Date("2026-08-19T10:00:00.000Z"), // Wednesday
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toMatchObject({
      from: "2026-08-24T22:00:00.000Z",
      to: "2026-08-25T22:00:00.000Z",
    });
  });

  it("understands aliases, a weekday, work, football, overlap language and common typos", () => {
    const plan = parseSwedishQuestion(
      "Jobbarw pappa på söndag då jag skall på forbollen?",
      {
        people,
        now: new Date("2026-08-20T10:00:00.000Z"),
        timeZone: "Europe/Stockholm",
        currentPersonId: "person-self",
      },
    );

    expect(plan).toEqual({
      from: "2026-08-22T22:00:00.000Z",
      to: "2026-08-23T22:00:00.000Z",
      personIds: ["person-self", "person-dad"],
      activityTerms: ["work", "football"],
      intent: "overlap",
      needsOverlap: true,
    });
  });

  it("treats helgen on a Sunday as the current Saturday and Sunday", () => {
    const plan = parseSwedishQuestion("Vad händer i helgen?", {
      people,
      now: new Date("2026-08-23T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toMatchObject({
      from: "2026-08-21T22:00:00.000Z",
      to: "2026-08-23T22:00:00.000Z",
      personIds: [],
      intent: "schedule",
    });
  });

  it("returns null rather than guessing without a period or with an unknown family role", () => {
    expect(parseSwedishQuestion("Jobbar pappa?", { people })).toBeNull();
    expect(parseSwedishQuestion("Kan man se schemat?", { people })).toBeNull();
    expect(
      parseSwedishQuestion("Jobbar pappa idag?", {
        people: people.filter((person) => person.id !== "person-dad"),
        now: new Date("2026-08-20T10:00:00.000Z"),
      }),
    ).toBeNull();
  });
});

describe("parseSwedishTaskQuestion", () => {
  const now = new Date("2026-08-20T10:00:00.000Z");

  it("parses what Ida must bring tomorrow without involving the AI planner", () => {
    const plan = parseSwedishTaskQuestion("Vad ska Ida ha med sig imorgon?", {
      people,
      now,
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toEqual({
      from: "2026-08-20T22:00:00.000Z",
      to: "2026-08-21T22:00:00.000Z",
      personIds: ["person-ida"],
      kinds: ["bring"],
      intent: "list",
    });
  });

  it("parses Kalle's homework for next week", () => {
    const plan = parseSwedishTaskQuestion("Vilka läxor har Kalle nästa vecka?", {
      people,
      now,
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toEqual({
      from: "2026-08-23T22:00:00.000Z",
      to: "2026-08-30T22:00:00.000Z",
      personIds: ["person-kalle"],
      kinds: ["homework"],
      intent: "list",
    });
  });

  it("limits a general task question to the current Swedish calendar week", () => {
    const plan = parseSwedishTaskQuestion("Vad har vi kvar att göra i veckan?", {
      people,
      now,
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toEqual({
      from: "2026-08-16T22:00:00.000Z",
      to: "2026-08-23T22:00:00.000Z",
      personIds: [],
      kinds: [],
      intent: "list",
    });
  });

  it("recognizes a form deadline question without inventing a date range", () => {
    const plan = parseSwedishTaskQuestion("När ska blanketten lämnas?", {
      people,
      now,
      timeZone: "Europe/Stockholm",
    });

    expect(plan).toEqual({
      from: null,
      to: null,
      personIds: [],
      kinds: ["form"],
      intent: "when",
    });
  });

  it("does not steal a generic calendar question", () => {
    expect(
      parseSwedishTaskQuestion("Vad gör jag imorgon?", {
        people,
        now,
        timeZone: "Europe/Stockholm",
        currentPersonId: "person-self",
      }),
    ).toBeNull();
  });
});

describe("selectRelevantEvents", () => {
  it("uses exact half-open period intersection and only confirmed matching events", () => {
    const plan: QuestionPlan = {
      from: "2026-08-23T00:00:00.000Z",
      to: "2026-08-24T00:00:00.000Z",
      personIds: ["person-dad"],
      activityTerms: ["jobb"],
      intent: "work",
      needsOverlap: false,
    };
    const events = [
      event({ id: "ends-at-start", startsAt: "2026-08-22T20:00:00.000Z", endsAt: plan.from }),
      event({ id: "starts-at-end", startsAt: plan.to, endsAt: "2026-08-24T01:00:00.000Z" }),
      event({ id: "spans-period", startsAt: "2026-08-22T23:00:00.000Z", endsAt: "2026-08-24T01:00:00.000Z" }),
      event({ id: "inside-period", startsAt: "2026-08-23T08:00:00.000Z", endsAt: "2026-08-23T09:00:00.000Z" }),
      event({ id: "under-review", status: "needs_review" }),
      event({ id: "wrong-person", personId: "person-mom" }),
      event({ id: "wrong-activity", category: "sport", title: "Simskola" }),
      event({ id: "invalid", endsAt: "not-a-date" }),
    ];

    expect(selectRelevantEvents(events, plan).map((item) => item.id)).toEqual([
      "spans-period",
      "inside-period",
    ]);
  });
});

describe("selectRelevantTasks", () => {
  it("uses half-open deadlines and ignores completed or unreviewed tasks", () => {
    const plan = parseSwedishTaskQuestion("Vad ska Ida ha med sig imorgon?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    })!;
    const tasks = [
      task({ id: "at-start", dueAt: plan.from }),
      task({ id: "at-end", dueAt: plan.to }),
      task({ id: "completed", completedAt: "2026-08-20T12:00:00.000Z" }),
      task({ id: "needs-review", reviewStatus: "needs_review" }),
      task({ id: "wrong-person", personId: "person-kalle" }),
      task({ id: "wrong-kind", kind: "homework" }),
      task({ id: "without-deadline", dueAt: null }),
      task({ id: "invalid-deadline", dueAt: "inte-ett-datum" }),
    ];

    expect(selectRelevantTasks(tasks, plan).map((item) => item.id)).toEqual([
      "at-start",
    ]);
  });
});

describe("calculateOverlap", () => {
  it("returns exact minutes and treats touching endpoints as no overlap", () => {
    const first = event({ startsAt: "2026-08-23T10:00:00.000Z", endsAt: "2026-08-23T11:00:00.000Z" });
    const partial = event({ startsAt: "2026-08-23T10:30:30.000Z", endsAt: "2026-08-23T11:30:00.000Z" });
    const touching = event({ startsAt: "2026-08-23T11:00:00.000Z", endsAt: "2026-08-23T12:00:00.000Z" });

    expect(calculateOverlap(first, partial)).toBe(29.5);
    expect(calculateOverlap(first, touching)).toBe(0);
    expect(calculateOverlap(first, { startsAt: "bad", endsAt: "also-bad" })).toBe(0);
  });
});

describe("answerTaskQuestionDeterministically", () => {
  const schoolDocument = document({
    id: "document-school",
    title: "Veckobrev från skolan",
    filename: "veckobrev.pdf",
    documentType: "Veckobrev",
    personId: "person-ida",
    eventsCount: 0,
    tasksCount: 1,
  });

  it("answers what Ida must bring from approved tasks and cites the document", () => {
    const plan = parseSwedishTaskQuestion("Vad ska Ida ha med sig imorgon?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [task()],
      documents: [schoolDocument],
      timeZone: "Europe/Stockholm",
    });

    expect(answer.hasEnoughData).toBe(true);
    expect(answer.text).toContain("Gympakläder och vattenflaska");
    expect(answer.text).toContain("fredag 21 augusti kl. 08.00");
    expect(answer.sources).toMatchObject([
      { id: "task-bring", documentId: "document-school", title: "Veckobrev från skolan" },
    ]);
    expect(answer.matchedEventIds).toEqual([]);
    expect(answer.matchedTaskIds).toEqual(["task-bring"]);
    expect(answer.sources[0]).toMatchObject({
      kind: "task",
      eventId: null,
      taskId: "task-bring",
    });
  });

  it("does not include next week's tasks in a current-week answer", () => {
    const plan = parseSwedishTaskQuestion("Vad har vi kvar att göra i veckan?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [
        task({
          id: "task-this-week",
          title: "Veckans uppgift",
          dueAt: "2026-08-21T06:00:00.000Z",
        }),
        task({
          id: "task-next-week",
          title: "Nästa veckas uppgift",
          dueAt: "2026-08-25T06:00:00.000Z",
        }),
      ],
      documents: [schoolDocument],
      timeZone: "Europe/Stockholm",
    });

    expect(answer.matchedTaskIds).toEqual(["task-this-week"]);
    expect(answer.text).toContain("Veckans uppgift");
    expect(answer.text).not.toContain("Nästa veckas uppgift");
  });

  it("lists only Kalle's approved, unfinished homework next week", () => {
    const plan = parseSwedishTaskQuestion("Vilka läxor har Kalle nästa vecka?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });
    const approved = task({
      id: "task-homework",
      personId: "person-kalle",
      title: "Matematik sidorna 12–14",
      kind: "homework",
      dueAt: "2026-08-25T15:00:00.000Z",
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [
        approved,
        task({ ...approved, id: "task-completed", completedAt: "2026-08-21T08:00:00.000Z" }),
        task({ ...approved, id: "task-review", reviewStatus: "needs_review" }),
      ],
      documents: [schoolDocument],
      timeZone: "Europe/Stockholm",
    });

    expect(answer.hasEnoughData).toBe(true);
    expect(answer.text).toContain("Matematik sidorna 12–14");
    expect(answer.sources).toHaveLength(1);
  });

  it("answers when one approved form is due", () => {
    const plan = parseSwedishTaskQuestion("När ska blanketten lämnas?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
      timeZone: "Europe/Stockholm",
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [
        task({
          id: "task-form",
          title: "Samtyckesblanketten",
          kind: "form",
          dueAt: "2026-08-24T14:30:00.000Z",
        }),
      ],
      documents: [schoolDocument],
      timeZone: "Europe/Stockholm",
    });

    expect(answer.hasEnoughData).toBe(true);
    expect(answer.text).toContain("Samtyckesblanketten");
    expect(answer.text).toContain("måndag 24 augusti kl. 16.30");
    expect(answer.sources[0]?.documentId).toBe("document-school");
  });

  it("says it does not know when an approved form lacks a deadline", () => {
    const plan = parseSwedishTaskQuestion("När ska blanketten lämnas?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [task({ title: "Samtyckesblanketten", kind: "form", dueAt: null })],
      documents: [schoolDocument],
    });

    expect(answer.hasEnoughData).toBe(false);
    expect(answer.text).toContain("vet inte när");
    expect(answer.sources[0]?.documentId).toBe("document-school");
  });

  it("ignores completed and needs-review tasks and reports missing evidence", () => {
    const plan = parseSwedishTaskQuestion("Vad ska Ida ha med sig imorgon?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [
        task({ id: "completed", completedAt: "2026-08-20T12:00:00.000Z" }),
        task({ id: "review", reviewStatus: "needs_review" }),
      ],
      documents: [schoolDocument],
    });

    expect(answer.hasEnoughData).toBe(false);
    expect(answer.text).toContain("saknar underlag");
    expect(answer.sources).toEqual([]);
  });

  it("does not guess which form was meant when several match", () => {
    const plan = parseSwedishTaskQuestion("När ska blanketten lämnas?", {
      people,
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    const answer = answerTaskQuestionDeterministically({
      plan,
      people,
      tasks: [
        task({ id: "form-1", title: "Fotoblanketten", kind: "form" }),
        task({ id: "form-2", title: "Skolskjutsblanketten", kind: "form" }),
      ],
      documents: [schoolDocument],
    });

    expect(answer.hasEnoughData).toBe(false);
    expect(answer.text).toContain("flera");
    expect(answer.text).toContain("vet inte vilken");
    expect(answer.sources).toHaveLength(2);
  });
});

describe("answerQuestionDeterministically", () => {
  const football = event({
    id: "event-football",
    personId: "person-self",
    documentId: "document-football",
    title: "Fotbollsmatch",
    category: "sport",
    startsAt: "2026-08-23T12:30:00.000Z",
    endsAt: "2026-08-23T14:00:00.000Z",
    location: "Ekängens IP",
    sourceExcerpt: "Samling 14.30, slut 16.00",
  });
  const documents = [
    document(),
    document({
      id: "document-football",
      title: "Matchkallelse",
      filename: "match.png",
      documentType: "Kallelse",
      personId: "person-self",
    }),
  ];

  it("answers an overlap question exactly and exposes both document source IDs", () => {
    const answer = answerQuestionDeterministically({
      plan: sundayPlan,
      people,
      events: [event({ id: "event-work" }), football],
      documents,
      timeZone: "Europe/Stockholm",
    });

    expect(answer.hasEnoughData).toBe(true);
    expect(answer.overlapMinutes).toBe(90);
    expect(answer.matchedEventIds).toEqual(["event-work", "event-football"]);
    expect(answer.sources.map((source) => source.documentId)).toEqual([
      "document-work",
      "document-football",
    ]);
    expect(answer.text).toContain("1 timme och 30 minuter");
    expect(answer.text).toContain("07.00–16.00");
    expect(answer.text).toContain("14.30–16.00");
  });

  it("can safely say there is no overlap after both sides are evidenced", () => {
    const laterFootball = event({
      ...football,
      startsAt: "2026-08-23T15:00:00.000Z",
      endsAt: "2026-08-23T16:00:00.000Z",
    });
    const answer = answerQuestionDeterministically({
      plan: sundayPlan,
      people,
      events: [event({ id: "event-work" }), laterFootball],
      documents,
    });

    expect(answer.hasEnoughData).toBe(true);
    expect(answer.overlapMinutes).toBe(0);
    expect(answer.text).toMatch(/^Nej\./);
  });

  it("does not turn a missing event into an unsupported no", () => {
    const answer = answerQuestionDeterministically({
      plan: sundayPlan,
      people,
      events: [event({ id: "event-work" })],
      documents,
    });

    expect(answer.hasEnoughData).toBe(false);
    expect(answer.text).toContain("saknar underlag");
    expect(answer.text).not.toMatch(/^Nej\./);
    expect(answer.overlapMinutes).toBe(0);
  });

  it("marks unreviewed source material as insufficient but keeps its source ID", () => {
    const plan: QuestionPlan = {
      from: sundayPlan.from,
      to: sundayPlan.to,
      personIds: ["person-self"],
      activityTerms: ["school"],
      intent: "schedule",
      needsOverlap: false,
    };
    const pendingSchool = event({
      id: "event-school",
      personId: "person-self",
      documentId: "document-school",
      title: "Föräldramöte?",
      category: "school",
      status: "needs_review",
    });
    const answer = answerQuestionDeterministically({
      plan,
      people,
      events: [pendingSchool],
      documents: [document({ id: "document-school", title: "Skolbrev" })],
    });

    expect(answer.hasEnoughData).toBe(false);
    expect(answer.text).toContain("behöver granskas");
    expect(answer.sources[0]?.documentId).toBe("document-school");
  });

  it("returns a safe answer when parsing did not produce a plan", () => {
    const answer = answerQuestionDeterministically({
      plan: null,
      people,
      events: [],
    });

    expect(answer.hasEnoughData).toBe(false);
    expect(answer.text).toContain("saknar underlag");
    expect(answer.periodLabel).toBe("Okänd period");
  });
});
