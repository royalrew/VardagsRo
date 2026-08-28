import {
  MONTHLY_FLOOR_ORE,
  MONTHLY_FREEDOM_ORE,
  soloActionCount,
  soloComebacks,
  soloHealthWindow,
  soloWeightTowardGoal,
  soloWorkoutCount,
  type SoloAction,
  type SoloActionKind,
  type SoloHealthDay,
  type SoloQuest,
  type SoloSettings,
  type SoloSummary,
} from "@/lib/solo";

/** A night that counts. Low enough to be reachable after a late shift. */
const SLEEP_NIGHT_HOURS = 6.5;

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
  settings: SoloSettings;
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
  // The courage ladder. The old first rung was "contact a stranger", which is
  // not a first step for someone who has never sold anything, so the branch
  // starts with things nobody can say no to and gets braver one rung at a time.
  //
  // After "Publik" it forks. The left path reaches out and ends in an offer.
  // The right path is built to be found, and ends with someone arriving on
  // their own. Both are visibility; only one of them can be forced.
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
    id: "profile",
    branch: "visibility",
    tier: 3,
    title: "Profilen",
    requirement: "Gör en profil publik där rekryterare letar",
    meaning:
      "Svenska rekryterare söker på ett fåtal ställen. En profil som säger undersköterska och produktionssystem i samma mening finns det nästan ingen av.",
    requires: "case_published",
    unit: "count",
    target: 2,
    progressOf: (context) => countKind(context, "made_visible"),
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
    id: "voice",
    branch: "visibility",
    tier: 4,
    title: "Röst",
    requirement: "Fyra publiceringar på trettio dagar",
    meaning:
      "Räckvidd kommer av upprepning, aldrig av en perfekt post. Fyra medelmåttiga slår en genomarbetad varje gång.",
    requires: "profile",
    unit: "count",
    target: 4,
    progressOf: (context) =>
      soloActionCount(
        context.actions,
        "portfolio_published",
        context.today,
        30,
      ),
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
    id: "recognised",
    branch: "visibility",
    tier: 5,
    title: "Igenkänd",
    requirement: "Någon hör av sig till dig först",
    meaning:
      "Den enda noden i trädet som kräver att en annan människa tog initiativet. Den går inte att forcera, och den är beviset på att synligheten växlade över till något.",
    requires: "voice",
    unit: "count",
    target: 1,
    progressOf: (context) => countKind(context, "inbound_received"),
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

  // Endurance carries the other two branches, so it is measured on rolling
  // windows rather than on calendar weeks: with shift work and five children
  // no two weeks look alike, and a quota that assumes they do only ever
  // reports failure.
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
      soloHealthWindow(context.healthDays, context.today, 14).length,
  },
  {
    id: "moving",
    branch: "endurance",
    tier: 2,
    title: "Igång",
    requirement: "Åtta pass på trettio dagar",
    meaning:
      "Femton minuter på mattan räknas lika mycket som en timme. Det är regelbundenheten som mäts, aldrig mängden.",
    requires: "rhythm",
    unit: "count",
    target: 8,
    progressOf: (context) =>
      soloWorkoutCount(context.healthDays, context.today, 30),
  },
  {
    id: "sleeping",
    branch: "endurance",
    tier: 2,
    title: "Sömnen",
    requirement: "Sju nätter av fjorton med minst 6,5 timmar",
    meaning:
      "Nätter, inte snitt. Ett enda nattpass ska inte kunna radera två goda veckor.",
    requires: "rhythm",
    unit: "count",
    target: 7,
    progressOf: (context) =>
      soloHealthWindow(context.healthDays, context.today, 14).filter(
        (day) => (day.sleepHours ?? 0) >= SLEEP_NIGHT_HOURS,
      ).length,
  },
  {
    id: "energy_kept",
    branch: "endurance",
    tier: 2,
    title: "Orken",
    requirement: "Sju kvällar av fjorton med energi 3 eller mer",
    meaning:
      "Det här är noden som karriärgrenen står på. Finns ingen ork kvar när barnen somnat blir inget av det andra gjort.",
    requires: "rhythm",
    unit: "count",
    target: 7,
    progressOf: (context) =>
      soloHealthWindow(context.healthDays, context.today, 14).filter(
        (day) => (day.energy ?? 0) >= 3,
      ).length,
  },
  {
    id: "comeback",
    branch: "endurance",
    tier: 3,
    title: "Återkomsten",
    requirement: "Träna igen efter ett uppehåll på minst en vecka",
    meaning:
      "Den enda noden i trädet som kräver att du först misslyckats. Att komma tillbaka är färdigheten som avgör allt annat, så den räknas som en merit och inte som en reparation.",
    requires: "moving",
    unit: "count",
    target: 1,
    progressOf: (context) => soloComebacks(context.healthDays),
  },
  {
    id: "back_care",
    branch: "endurance",
    tier: 3,
    title: "Ryggen",
    requirement: "Tio rörlighetspass på trettio dagar",
    meaning:
      "Att lyfta människor för sitt levebröd sliter ut en rygg. Fem minuter går att göra även den kväll då ingenting annat går.",
    requires: "moving",
    unit: "count",
    target: 10,
    progressOf: (context) =>
      soloHealthWindow(context.healthDays, context.today, 30).filter(
        (day) => day.mobility === true,
      ).length,
  },
  {
    id: "direction",
    branch: "endurance",
    tier: 3,
    title: "Riktning",
    requirement: "Vikten rör sig mot ditt mål över trettio dagar",
    meaning:
      "Riktning, aldrig en siffra. Noden frågar bara om avståndet till målet blivit mindre, och den straffar aldrig en våg som står stilla.",
    requires: "rhythm",
    unit: "count",
    target: 1,
    progressOf: (context) =>
      soloWeightTowardGoal(
        context.healthDays,
        context.today,
        context.settings.weightGoalKg,
      )
        ? 1
        : 0,
  },
  {
    id: "durable",
    branch: "endurance",
    tier: 4,
    title: "Uthållig",
    requirement: "Tjugofyra pass på nittio dagar",
    meaning:
      "Ett kvartal med i snitt två pass i veckan, uppehållen inräknade. Det är beviset på att det här inte var ännu en bra vecka i februari.",
    requires: "comeback",
    unit: "count",
    target: 24,
    progressOf: (context) =>
      soloWorkoutCount(context.healthDays, context.today, 90),
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
