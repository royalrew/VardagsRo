export type Project100MemoryKind = "fact" | "event" | "learning";
export type Project100MemoryCategory =
  | "goal"
  | "equipment"
  | "preference"
  | "routine"
  | "injury"
  | "recovery"
  | "general";

export interface Project100Memory {
  id: string;
  kind: Project100MemoryKind;
  category: Project100MemoryCategory;
  content: string;
  sourceRef: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project100Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageSnippet?: string | null;
}

export type Project100SourceKind = "session" | "meal" | "body" | "work" | "journal" | "memory";

export interface Project100MessageSource {
  kind: Project100SourceKind;
  id: string;
  title: string;
  detail: string;
  date?: string;
  url?: string;
}

export type Project100ProposalKind = "planned_session" | "batch_meal" | "custom_meal" | "body_target";

export interface Project100MessageProposal {
  id: string;
  kind: Project100ProposalKind;
  title: string;
  data: Record<string, unknown>;
  status: "pending" | "applied" | "dismissed";
}

export interface Project100ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Project100MessageSource[];
  proposals: Project100MessageProposal[];
  createdAt: string;
}

export interface Project100JarvisContext {
  today: string;
  timeZone: string;
  weightGoalKg: number | null;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  proteinTargetG: number | null;
  upcomingWorkEvents: { title: string; startsAt: string; endsAt: string }[];
  recentSessions: {
    id: string;
    date: string;
    title: string;
    activityType: string;
    durationSeconds: number | null;
    volumeKg?: number;
  }[];
  recentMeals: {
    id: string;
    date: string;
    title: string;
    proteinG: number | null;
    kcal: number | null;
  }[];
  recentJournal: {
    date: string;
    sleepHours: number | null;
    energy: number | null;
    mood: number | null;
  }[];
  pantryBatches: {
    id: string;
    title: string;
    portionsRemaining: number;
    proteinPerPortionG: number;
  }[];
  activeMemories: Project100Memory[];
}

export const MEMORY_KIND_LABELS: Record<Project100MemoryKind, string> = {
  fact: "Fakta",
  event: "Händelse",
  learning: "Lärdom",
};

export const MEMORY_CATEGORY_LABELS: Record<Project100MemoryCategory, string> = {
  goal: "Mål",
  equipment: "Utrustning",
  preference: "Preferens",
  routine: "Rutin",
  injury: "Skador/Begränsning",
  recovery: "Återhämtning",
  general: "Allmänt",
};

export const PROPOSAL_KIND_LABELS: Record<Project100ProposalKind, string> = {
  planned_session: "Planerat träningspass",
  batch_meal: "Portion ur fryst sats",
  custom_meal: "Ny måltid",
  body_target: "Måljustering",
};

export function formatPromptContextSummary(context: Project100JarvisContext): string {
  const parts: string[] = [];

  parts.push(`DATUM IDAG: ${context.today} (${context.timeZone})`);
  parts.push(
    `KROPPSLÄGE: Nuvarande vikt ${context.currentWeightKg ?? "okänd"} kg (start ${
      context.startWeightKg ?? "okänd"
    } kg, mål ${context.weightGoalKg ?? "100"} kg). Dagligt proteinmål: ${
      context.proteinTargetG ?? "160"
    } g.`,
  );

  if (context.upcomingWorkEvents.length > 0) {
    parts.push(
      `KOMMANDE ARBETSPASS: ${context.upcomingWorkEvents
        .map((w) => `${w.title} (${w.startsAt.slice(0, 16).replace("T", " ")} – ${w.endsAt.slice(11, 16)})`)
        .join(", ")}`,
    );
  } else {
    parts.push("KOMMANDE ARBETSPASS: Inga inlagda arbetspass de närmaste dagarna (ledig tid).");
  }

  if (context.recentSessions.length > 0) {
    parts.push(
      `SENASTE TRÄNING: ${context.recentSessions
        .map(
          (s) =>
            `${s.date} ${s.title} (${s.activityType}, ${Math.round((s.durationSeconds ?? 0) / 60)} min${
              s.volumeKg ? `, ${Math.round(s.volumeKg)} kg volym` : ""
            })`,
        )
        .join("; ")}`,
    );
  } else {
    parts.push("SENASTE TRÄNING: Inga loggade pass nyligen.");
  }

  if (context.pantryBatches.length > 0) {
    parts.push(
      `FRYSEN/MATLÅDOR: ${context.pantryBatches
        .map((b) => `${b.title} (${b.portionsRemaining} port kvar, ${b.proteinPerPortionG}g protein/port)`)
        .join(", ")}`,
    );
  } else {
    parts.push("FRYSEN/MATLÅDOR: Inga färdiga satser i frysen just nu.");
  }

  if (context.recentJournal.length > 0) {
    parts.push(
      `ÅTERHÄMTNING & DAGSFORM: ${context.recentJournal
        .map((j) => `${j.date} (sömn: ${j.sleepHours ?? "—"}h, energi: ${j.energy ?? "—"}/5, humör: ${j.mood ?? "—"}/5)`)
        .join("; ")}`,
    );
  }

  if (context.activeMemories.length > 0) {
    parts.push(
      `PERSONLIGA MINNEN & LÄRDOMAR:\n${context.activeMemories
        .map((m) => `- [${MEMORY_KIND_LABELS[m.kind]}:${MEMORY_CATEGORY_LABELS[m.category]}] ${m.content}`)
        .join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

export function buildJarvisSystemPrompt(context: Project100JarvisContext): string {
  const contextBlock = formatPromptContextSummary(context);

  return `Du är Jarvis, den personliga assistenten och digitala kollegan i Projekt 100 — ett privat system för resan från ~80 kg till 100 kg.
Dina ledstjärnor är:
1. NOLL HALLUCINATION: Svara enbart utifrån användarens faktiska data nedan. Gissa aldrig historik eller datum. Om data saknas, säg det ärligt.
2. JOBBSCHEMAT: Anpassa alltid tränings- och kostförslag efter användarens faktiska arbetstider (familjekalendern).
3. STRUKTURERADE UTKAST: När du föreslår ett träningspass eller en måltid, ge förslaget tydligt så användaren kan godkänna det.
4. KÄLLBILAGA: Hänvisa alltid till relevanta loggar (pass, mätningar, fryssats, arbetspass) som ditt svar bygger på.
5. TON: Koncis, professionell, stöttande och saklig ("Glass & Steel").

AKTUELL KONTEXT:
${contextBlock}
`;
}
