import {
  MONTHLY_FLOOR_ORE,
  MONTHLY_FREEDOM_ORE,
  type SoloAction,
  type SoloActionKind,
  type SoloHealthDay,
  type SoloQuest,
  type SoloSummary,
} from "@/lib/solo";
import { calendarDateDifference } from "@/lib/dates";

/**
 * A talent tree, with one rule taken from the ledger and not from the genre:
 * points are never spent. Every node opens because something became true in the
 * world, so the tree cannot be filled in by deciding to fill it in.
 *
 * The map is therefore also a route. A locked node states exactly what would
 * open it, which turns "jag borde göra något" into a specific next move.
 */

export type SoloBranch = "visibility" | "own_feet" | "endurance";

export interface SoloBranchInfo {
  id: SoloBranch;
  title: string;
  purpose: string;
}

export const SOLO_BRANCHES: readonly SoloBranchInfo[] = [
  {
    id: "visibility",
    title: "Synlighet",
    purpose: "Vägen till en anställning som betalar över golvet.",
  },
  {
    id: "own_feet",
    title: "Egen fot",
    purpose: "Vägen till att planera din egen dag.",
  },
  {
    id: "endurance",
    title: "Uthållighet",
    purpose: "Kroppen och rytmen som orkar bära de två andra.",
  },
] as const;

/** How a node's progress should be read, so the interface can format it. */
export type SoloTalentUnit = "count" | "ore" | "percent" | "weeks";

export interface SoloTalentContext {
  actions: readonly SoloAction[];
  healthDays: readonly SoloHealthDay[];
  summary: SoloSummary;
  today: string;
}

export interface SoloTalent {
  id: string;
  branch: SoloBranch;
  tier: number;
  title: string;
  requirement: string;
  /** Why this node is worth anything once it opens. */
  meaning: string;
  requires: string | null;
  unit: SoloTalentUnit;
  target: number;
  progressOf: (context: SoloTalentContext) => number;
}

export type SoloTalentState = "unlocked" | "available" | "locked";

export interface SoloTalentNode extends Omit<SoloTalent, "progressOf"> {
  progress: number;
  state: SoloTalentState;
}

function countKind(
  context: SoloTalentContext,
  kind: SoloActionKind,
): number {
  return context.actions.filter((action) => action.kind === kind).length;
}

export const SOLO_TALENTS: readonly SoloTalent[] = [
  // The courage ladder. The old first rung was "contact a stranger", which is
  // not a first step for someone who has never sold anything, so the branch now
  // starts with things nobody can say no to and gets braver one rung at a time.
  {
    id: "visible",
    branch: "visibility",
    tier: 1,
    title: "Synlig",
    requirement: "Gör en profil eller ett repo publikt",
    meaning: "Det finns nu en länk att skicka. Ingen behöver svara på den.",
    requires: null,
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "made_visible"),
  },
  {
    id: "case_published",
    branch: "visibility",
    tier: 2,
    title: "Publik",
    requirement: "Publicera Vardagsro-caset",
    meaning:
      "Undersköterska som driftsatt ett riktigt system. Skriv ner det en gång, använd det i ett år.",
    requires: "visible",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "portfolio_published"),
  },
  {
    id: "shown",
    branch: "visibility",
    tier: 3,
    title: "Visad",
    requirement: "Visa det för någon du redan känner",
    meaning:
      "Första gången en annan människa tittar. Hanni räknas, en kollega räknas.",
    requires: "case_published",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "shown_to_someone"),
  },
  {
    id: "asked",
    branch: "visibility",
    tier: 4,
    title: "Frågat",
    requirement: "Ställ en fråga till någon i branschen",
    meaning:
      "Du ber inte om något. Du frågar. Det går inte att bli nekad en fråga.",
    requires: "shown",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "question_asked"),
  },
  {
    id: "first_contact",
    branch: "visibility",
    tier: 5,
    title: "Första kontakten",
    requirement: "Kontakta någon om arbete",
    meaning:
      "Nu först ber du om något. Vid det här laget har du en länk, ett case och ett svar bakom dig.",
    requires: "asked",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "outreach_sent"),
  },
  {
    id: "applicant",
    branch: "visibility",
    tier: 6,
    title: "Sökande",
    requirement: "Skicka tre ansökningar",
    meaning: "Tillräckligt många för att ett nej ska vara statistik, inte dom.",
    requires: "first_contact",
    unit: "count",
    target: 3,
    progressOf: (context) => countKind(context, "application_sent"),
  },
  {
    id: "in_the_room",
    branch: "visibility",
    tier: 7,
    title: "I rummet",
    requirement: "Genomför en intervju",
    meaning: "Nu bedöms du som utvecklare, inte som en ansökan i en hög.",
    requires: "applicant",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "interview_held"),
  },
  {
    id: "wanted",
    branch: "visibility",
    tier: 8,
    title: "Eftertraktad",
    requirement: "Få ett erbjudande",
    meaning: "Någon annan än du har satt ett pris på ditt arbete.",
    requires: "in_the_room",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "offer_received"),
  },

  {
    id: "reach",
    branch: "own_feet",
    tier: 1,
    title: "Räckvidd",
    requirement: "Kontakta fem olika håll",
    meaning: "Egen försörjning börjar med att tillräckligt många vet att du finns.",
    requires: null,
    unit: "count",
    target: 5,
    progressOf: (context) => countKind(context, "outreach_sent"),
  },
  {
    id: "first_proposal",
    branch: "own_feet",
    tier: 2,
    title: "Första offerten",
    requirement: "Skicka en offert",
    meaning: "Du har satt ett pris och vågat säga det högt.",
    requires: "reach",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "proposal_sent"),
  },
  {
    id: "first_invoice",
    branch: "own_feet",
    tier: 3,
    title: "Första fakturan",
    requirement: "Skicka en faktura",
    meaning: "Arbetet är utfört och begärt betalt för.",
    requires: "first_proposal",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "invoice_sent"),
  },
  {
    id: "first_krona",
    branch: "own_feet",
    tier: 4,
    title: "Första kronan",
    requirement: "Få betalt en gång",
    meaning:
      "Den svåraste noden i hela trädet. Efter den är resten en fråga om antal.",
    requires: "first_invoice",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "payment_received"),
  },
  {
    id: "floor",
    branch: "own_feet",
    tier: 5,
    title: "Golvet",
    requirement: "30 000 kr in på trettio dagar",
    meaning: "Du kan säga upp dig utan att familjen får det sämre.",
    requires: "first_krona",
    unit: "ore",
    target: MONTHLY_FLOOR_ORE,
    progressOf: (context) => context.summary.incomeOre,
  },
  {
    id: "freedom",
    branch: "own_feet",
    tier: 6,
    title: "Friheten",
    requirement: "50 000 kr in på trettio dagar",
    meaning:
      "Nu bär arbetet lön, semester, pension och de veckor då ingen hör av sig.",
    requires: "floor",
    unit: "ore",
    target: MONTHLY_FREEDOM_ORE,
    progressOf: (context) => context.summary.incomeOre,
  },

  {
    id: "rhythm",
    branch: "endurance",
    tier: 1,
    title: "Rytm",
    requirement: "Logga sju dagar av de senaste fjorton",
    meaning: "Utan mätning är hälsostaten en gissning.",
    requires: null,
    unit: "count",
    target: 7,
    progressOf: (context) =>
      context.healthDays.filter((day) => {
        const age = calendarDateDifference(day.date, context.today);
        return age >= 0 && age < 14;
      }).length,
  },
  {
    id: "rested",
    branch: "endurance",
    tier: 2,
    title: "Utvilad",
    requirement: "Hälsostat på 60 eller mer",
    meaning: "Sömn och mat på en nivå där kvällarna räcker till mer än att orka.",
    requires: "rhythm",
    unit: "percent",
    target: 60,
    progressOf: (context) => context.summary.stats.health ?? 0,
  },
  {
    id: "four_weeks",
    branch: "endurance",
    tier: 2,
    title: "Fyra veckor",
    requirement: "Fyra veckor i rad med full kvot",
    meaning: "Beviset på att det här inte var ännu en bra vecka i februari.",
    requires: "rhythm",
    unit: "weeks",
    target: 4,
    progressOf: (context) => context.summary.streak.weeks,
  },
  {
    id: "strong",
    branch: "endurance",
    tier: 3,
    title: "Stark",
    requirement: "Tjugofyra träningspass totalt",
    meaning: "Ett år av hemvård sliter på en kropp. Den behöver byggas tillbaka.",
    requires: "rested",
    unit: "count",
    target: 24,
    progressOf: (context) =>
      context.healthDays.reduce((total, day) => total + day.workouts, 0),
  },
  {
    id: "quarter",
    branch: "endurance",
    tier: 3,
    title: "Kvartalet",
    requirement: "Tolv veckor i rad med full kvot",
    meaning:
      "Tre månaders utåtriktat arbete i rad har aldrig lämnat någon kvar på samma plats.",
    requires: "four_weeks",
    unit: "weeks",
    target: 12,
    progressOf: (context) => context.summary.streak.weeks,
  },
] as const;

/**
 * Reality outranks the map. A node whose requirement is met opens even if the
 * node before it never did, because an interview that arrived without three
 * applications still happened, and a tree that denied it would be lying to
 * protect its own shape.
 */
export function buildSoloTalents(
  context: SoloTalentContext,
): SoloTalentNode[] {
  const unlocked = new Set<string>();
  const nodes = SOLO_TALENTS.map((talent) => {
    const progress = Math.max(0, talent.progressOf(context));
    if (progress >= talent.target) unlocked.add(talent.id);
    return { talent, progress };
  });

  return nodes.map(({ talent, progress }) => {
    const isUnlocked = unlocked.has(talent.id);
    const openable = talent.requires === null || unlocked.has(talent.requires);
    return {
      id: talent.id,
      branch: talent.branch,
      tier: talent.tier,
      title: talent.title,
      requirement: talent.requirement,
      meaning: talent.meaning,
      requires: talent.requires,
      unit: talent.unit,
      target: talent.target,
      progress,
      state: isUnlocked ? "unlocked" : openable ? "available" : "locked",
    };
  });
}

export function unlockedTalentCount(nodes: readonly SoloTalentNode[]): number {
  return nodes.filter((node) => node.state === "unlocked").length;
}

/**
 * What to do next is read off the tree rather than written by hand, so the
 * suggestion is always the smallest rung that is actually open. The old version
 * told a beginner to send an application on day one, which is how a ladder ends
 * up with its first step above head height.
 */
export function buildSoloQuests(
  nodes: readonly SoloTalentNode[],
  summary: SoloSummary,
): SoloQuest[] {
  const quests: SoloQuest[] = [];
  const nextIn = (branch: SoloBranch): SoloTalentNode | undefined =>
    nodes
      .filter((node) => node.branch === branch && node.state === "available")
      .sort((left, right) => left.tier - right.tier)[0];

  for (const branch of ["visibility", "endurance"] as const) {
    const node = nextIn(branch);
    if (!node) continue;
    quests.push({
      id: "next-" + node.id,
      title: node.requirement,
      detail: node.meaning,
    });
  }

  const remaining = summary.streak.quota - summary.streak.actionsThisWeek;
  if (remaining > 0) {
    quests.push({
      id: "weekly-quota",
      title:
        remaining === 1
          ? "En handling kvar denna vecka"
          : remaining + " handlingar kvar denna vecka",
      detail:
        summary.streak.weeks > 0
          ? "Håller du veckan är du uppe i " +
            (summary.streak.weeks + 1) +
            " veckor i rad."
          : "De minsta handlingarna räknas lika mycket mot kvoten som de stora.",
    });
  }

  return quests.slice(0, 3);
}
