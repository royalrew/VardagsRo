import { addLocalDays, atLocalTime, startOfLocalWeek } from "@/lib/dates";
import type {
  DashboardData,
  FamilyDocument,
  FamilyDocumentFolder,
  FamilyEvent,
  FamilyPerson,
  FamilyTask,
} from "@/lib/types";

const HOUSEHOLD_ID = "household-demo";

export const demoPeople: FamilyPerson[] = [
  {
    id: "person-nora",
    householdId: HOUSEHOLD_ID,
    name: "Nora",
    role: "Jag",
    personType: "adult",
    aliases: ["jag", "mig", "nora"],
    initials: "N",
    color: "#476b5b",
    tint: "#dfece4",
  },
  {
    id: "person-mikael",
    householdId: HOUSEHOLD_ID,
    name: "Mikael",
    role: "Pappa",
    personType: "adult",
    aliases: ["pappa", "far", "mikael"],
    initials: "M",
    color: "#5577a6",
    tint: "#e4ebf6",
  },
  {
    id: "person-sara",
    householdId: HOUSEHOLD_ID,
    name: "Sara",
    role: "Mamma",
    personType: "adult",
    aliases: ["mamma", "mor", "sara"],
    initials: "S",
    color: "#a6606e",
    tint: "#f5e5e8",
  },
  {
    id: "person-leo",
    householdId: HOUSEHOLD_ID,
    name: "Leo",
    role: "Lillebror",
    personType: "child",
    aliases: ["leo", "lillebror"],
    initials: "L",
    color: "#bc7448",
    tint: "#f8e9dc",
  },
];

function relativeIso(dayOffset: number, hour: number, minute = 0): string {
  return atLocalTime(addLocalDays(startOfLocalWeek(), dayOffset), hour, minute).toISOString();
}

function uploadedIso(daysAgo: number, hour = 18): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function createDemoDocuments(): FamilyDocument[] {
  return [
    {
      id: "document-jobb",
      householdId: HOUSEHOLD_ID,
      title: "Mikaels jobbschema",
      filename: "jobbschema-augusti.jpg",
      mimeType: "image/jpeg",
      documentType: "Jobbschema",
      personId: "person-mikael",
      folderId: "folder-scheman",
      status: "confirmed",
      uploadedAt: uploadedIso(2),
      periodLabel: "17–30 augusti",
      summary: "Arbetspass för Mikael under två veckor.",
      storageKey: null,
      eventsCount: 3,
      tasksCount: 0,
    },
    {
      id: "document-fotboll",
      householdId: HOUSEHOLD_ID,
      title: "Matchkallelse från IFK",
      filename: "matchkallelse.png",
      mimeType: "image/png",
      documentType: "Kallelse",
      personId: "person-nora",
      folderId: "folder-aktiviteter",
      status: "confirmed",
      uploadedAt: uploadedIso(1, 20),
      periodLabel: "Söndag",
      summary: "Samling och fotbollsmatch på Ekängens IP.",
      storageKey: null,
      eventsCount: 1,
      tasksCount: 0,
    },
    {
      id: "document-skola",
      householdId: HOUSEHOLD_ID,
      title: "Information från skolan",
      filename: "veckobrev.pdf",
      mimeType: "application/pdf",
      documentType: "Skolbrev",
      personId: "person-nora",
      folderId: "folder-veckobrev",
      status: "needs_review",
      uploadedAt: uploadedIso(0, 7),
      periodLabel: "Nästa vecka",
      summary: "Vi hittade ett möjligt föräldramöte som behöver kontrolleras.",
      storageKey: null,
      eventsCount: 1,
      tasksCount: 2,
    },
  ];
}

export function createDemoFolders(): FamilyDocumentFolder[] {
  const createdAt = uploadedIso(14, 12);
  return [
    {
      id: "folder-skola",
      householdId: HOUSEHOLD_ID,
      parentId: null,
      name: "Skola",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "folder-veckobrev",
      householdId: HOUSEHOLD_ID,
      parentId: "folder-skola",
      name: "Veckobrev",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "folder-scheman",
      householdId: HOUSEHOLD_ID,
      parentId: null,
      name: "Scheman",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "folder-aktiviteter",
      householdId: HOUSEHOLD_ID,
      parentId: null,
      name: "Aktiviteter",
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

export function createDemoEvents(): FamilyEvent[] {
  return [
    {
      id: "event-school-thursday",
      householdId: HOUSEHOLD_ID,
      personId: "person-nora",
      documentId: null,
      title: "Skoldag",
      category: "school",
      startsAt: relativeIso(3, 8, 10),
      endsAt: relativeIso(3, 14, 20),
      allDay: false,
      location: "Södra skolan",
      notes: null,
      status: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    },
    {
      id: "event-dentist",
      householdId: HOUSEHOLD_ID,
      personId: "person-leo",
      documentId: null,
      title: "Tandläkaren",
      category: "health",
      startsAt: relativeIso(3, 15, 30),
      endsAt: relativeIso(3, 16, 15),
      allDay: false,
      location: "Folktandvården",
      notes: null,
      status: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    },
    {
      id: "event-job-friday",
      householdId: HOUSEHOLD_ID,
      personId: "person-mikael",
      documentId: "document-jobb",
      title: "Jobb",
      category: "work",
      startsAt: relativeIso(4, 7),
      endsAt: relativeIso(4, 16),
      allDay: false,
      location: "Akutmottagningen",
      notes: null,
      status: "confirmed",
      confidence: 0.98,
      sourceExcerpt: "Fre 07.00–16.00 Mikael",
    },
    {
      id: "event-swim",
      householdId: HOUSEHOLD_ID,
      personId: "person-leo",
      documentId: null,
      title: "Simskola",
      category: "sport",
      startsAt: relativeIso(5, 10, 30),
      endsAt: relativeIso(5, 11, 15),
      allDay: false,
      location: "Badhuset",
      notes: null,
      status: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    },
    {
      id: "event-job-sunday",
      householdId: HOUSEHOLD_ID,
      personId: "person-mikael",
      documentId: "document-jobb",
      title: "Jobb",
      category: "work",
      startsAt: relativeIso(6, 7),
      endsAt: relativeIso(6, 16),
      allDay: false,
      location: "Akutmottagningen",
      notes: null,
      status: "confirmed",
      confidence: 0.98,
      sourceExcerpt: "Sön 07.00–16.00 Mikael",
    },
    {
      id: "event-football-sunday",
      householdId: HOUSEHOLD_ID,
      personId: "person-nora",
      documentId: "document-fotboll",
      title: "Fotbollsmatch",
      category: "sport",
      startsAt: relativeIso(6, 14, 30),
      endsAt: relativeIso(6, 16),
      allDay: false,
      location: "Ekängens IP",
      notes: null,
      status: "confirmed",
      confidence: 0.96,
      sourceExcerpt: "Match söndag. Samling 14.30, slut cirka 16.00.",
    },
    {
      id: "event-parent-meeting",
      householdId: HOUSEHOLD_ID,
      personId: "person-nora",
      documentId: "document-skola",
      title: "Föräldramöte?",
      category: "school",
      startsAt: relativeIso(8, 18),
      endsAt: relativeIso(8, 19, 30),
      allDay: false,
      location: "Södra skolan",
      notes: null,
      status: "needs_review",
      confidence: 0.61,
      sourceExcerpt: "Föräldramöte tisdag kl. 18 – kontrollera datum.",
    },
  ];
}

export function createDemoTasks(): FamilyTask[] {
  return [
    {
      id: "task-bring-gym-clothes",
      householdId: HOUSEHOLD_ID,
      personId: "person-nora",
      documentId: "document-skola",
      title: "Ta med idrottskläder",
      kind: "bring",
      dueAt: relativeIso(7, 8),
      completedAt: null,
      notes: "Skor för inomhusgympa och handduk.",
      reviewStatus: "confirmed",
      confidence: 0.96,
      sourceExcerpt: "På måndag behöver eleverna ta med idrottskläder, inneskor och handduk.",
    },
    {
      id: "task-return-permission-slip",
      householdId: HOUSEHOLD_ID,
      personId: "person-nora",
      documentId: "document-skola",
      title: "Lämna in samtyckesblanketten",
      kind: "form",
      dueAt: relativeIso(8, 8),
      completedAt: null,
      notes: "Blanketten behöver en vårdnadshavares underskrift.",
      reviewStatus: "confirmed",
      confidence: 0.91,
      sourceExcerpt: "Samtyckesblanketten ska vara undertecknad och inlämnad senast tisdag.",
    },
  ];
}

export function createDemoData(): DashboardData {
  return {
    householdId: HOUSEHOLD_ID,
    familyName: "Familjen Lindberg",
    timezone: "Europe/Stockholm",
    currentPersonId: "person-nora",
    people: demoPeople,
    events: createDemoEvents(),
    tasks: createDemoTasks(),
    folders: createDemoFolders(),
    documents: createDemoDocuments(),
    dataMode: "demo",
  };
}

export function createDemoExtraction(filename = "ny-kallelse.jpg"): import("@/lib/types").DocumentExtraction {
  const monday = startOfLocalWeek();
  const nextWednesday = addLocalDays(monday, 9);
  return {
    title: "Utflykt till Naturhistoriska",
    documentType: "Skolkallelse",
    summary: "Skolutflykt med samling på skolgården och medhavd lunch.",
    personHint: "Nora",
    personId: "person-nora",
    periodLabel: new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(nextWednesday),
    originalFilename: filename,
    mimeType: "image/jpeg",
    storageKey: null,
    hash: "demo",
    events: [
      {
        id: crypto.randomUUID(),
        title: "Skolutflykt",
        category: "school",
        startsAt: atLocalTime(nextWednesday, 8, 15).toISOString(),
        endsAt: atLocalTime(nextWednesday, 15).toISOString(),
        allDay: false,
        location: "Naturhistoriska riksmuseet",
        notes: null,
        confidence: 0.92,
        sourceExcerpt: "Samling 08.15 på skolgården. Åter cirka 15.00.",
      },
    ],
    tasks: [
      {
        id: crypto.randomUUID(),
        title: "Ta med matsäck och vattenflaska",
        kind: "bring",
        dueAt: atLocalTime(nextWednesday, 7, 45).toISOString(),
        notes: "Packa gärna kvällen före utflykten.",
        confidence: 0.94,
        sourceExcerpt: "Eleverna tar med egen matsäck, vattenflaska och kläder efter väder.",
      },
    ],
  };
}
