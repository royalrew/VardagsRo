import {
  type Project100MemoryCategory,
  type Project100MemoryKind,
} from "@/lib/project100-jarvis";

export interface MemoryStoreIntent {
  type: "store";
  category: Project100MemoryCategory;
  kind: Project100MemoryKind;
  content: string;
}

export interface MemoryQueryIntent {
  type: "query";
  query: string;
  category?: Project100MemoryCategory;
}

export interface MemoryNoIntent {
  type: "none";
}

export type MemoryCommandResult = MemoryStoreIntent | MemoryQueryIntent | MemoryNoIntent;

const PREFIX_MAP: Record<string, Project100MemoryCategory> = {
  jobb: "job",
  jobbet: "job",
  arbete: "job",
  arbetet: "job",
  bil: "car",
  bilen: "car",
  bilar: "car",
  hus: "house",
  huset: "house",
  hem: "house",
  hemmet: "house",
  barn: "kids",
  barnen: "kids",
  ekonomi: "finance",
  avtal: "finance",
  papper: "finance",
  försäkring: "finance",
  forsakring: "finance",
  hälsa: "health",
  halsa: "health",
  träning: "health",
  traning: "health",
  gym: "health",
  mål: "goal",
  mal: "goal",
  rutin: "routine",
  rutiner: "routine",
  utrustning: "equipment",
  skada: "injury",
  skador: "injury",
  vila: "recovery",
  återhämtning: "recovery",
  aterhamtning: "recovery",
  allmänt: "general",
  allmant: "general",
  övrigt: "general",
  ovrigt: "general",
};

const CATEGORY_KEYWORDS: Record<Project100MemoryCategory, string[]> = {
  job: [
    "jobb", "jobbet", "förråd", "forrad", "inkontinens", "avdelning",
    "skift", "kollega", "chef", "stämpel", "sjukhus", "nyckelbricka", "larm", "portkod",
  ],
  car: [
    "bil", "bilen", "däck", "dack", "hjul", "olja", "oljefilter", "service",
    "besiktning", "torkarblad", "regnr", "släpvagn", "bensin", "diesel", "broms", "volvo",
  ],
  house: [
    "hus", "huset", "färgkod", "fargkod", "färg", "farg", "måla", "hall",
    "kök", "kok", "vardagsrum", "fönster", "gardin", "säkring", "sakring", "propp",
    "filter", "ventilation", "element", "altan", "garage", "tomt",
  ],
  kids: [
    "barn", "barnen", "skola", "förskola", "dagis", "fröken", "klass",
    "skostorlek", "klädstorlek", "storlek", "allergi", "simskola", "träningstid",
  ],
  finance: [
    "försäkring", "forsakring", "avtal", "bank", "faktura", "abonnemang",
    "elavtal", "lån", "lan", "sopor", "sophämtning", "kontonummer",
  ],
  health: [
    "träning", "traning", "gym", "övning", "ovning", "styrka", "kondition",
    "vikt", "puls", "blodtryck", "stretch",
  ],
  goal: ["mål", "delmål", "målsättning", "vision"],
  routine: ["rutin", "vanor", "morgonrutin", "kvällsrutin", "schema"],
  equipment: ["utrustning", "bälte", "lyftarskor", "dragremmar", "stång", "hantlar"],
  preference: ["preferens", "tycker om", "favorit"],
  injury: ["skada", "ont", "känning", "rehab", "smärta", "knä", "axel", "rygg"],
  recovery: ["återhämtning", "vila", "sömn", "hrv", "vila"],
  general: [],
};

export function inferCategoryFromContent(text: string): Project100MemoryCategory {
  const lower = text.toLowerCase();
  let bestCat: Project100MemoryCategory = "general";
  let maxMatches = 0;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    Project100MemoryCategory,
    string[],
  ][]) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) count++;
    }
    if (count > maxMatches) {
      maxMatches = count;
      bestCat = cat;
    }
  }

  return bestCat;
}

/**
 * Parses an input string into a memory intent (store, query, or none).
 */
export function parseMemoryCommand(input: string): MemoryCommandResult {
  const raw = input.trim();
  if (!raw) return { type: "none" };

  // 1. Explicit prefix: "Jobb - Koden till inkontinensförrådet är 2214"
  const prefixMatch = /^([A-Za-zÅÄÖåäöéÉ_]+)\s*[-:–]\s*(.+)$/i.exec(raw);
  if (prefixMatch) {
    const pfx = prefixMatch[1].toLowerCase();
    const rest = prefixMatch[2].trim();
    if (PREFIX_MAP[pfx] && rest.length >= 2) {
      return {
        type: "store",
        category: PREFIX_MAP[pfx],
        kind: "fact",
        content: rest,
      };
    }
  }

  // 2. Storage phrases: "Kom ihåg att...", "Spara att...", "Glöm inte att..."
  const storePhraseMatch =
    /^(?:kom ihåg att|spara att|glöm inte att|spara minne|lägg till minne|notera att|skriv upp att)\s+(.+)$/i.exec(
      raw,
    );
  if (storePhraseMatch) {
    const content = storePhraseMatch[1].trim();
    const category = inferCategoryFromContent(content);
    return {
      type: "store",
      category,
      kind: "fact",
      content,
    };
  }

  // 3. Direct Fact Declarations: "Koden till förrådet är 2214", "Färgkoden i hallen är Jotun 10341"
  const directFactMatch =
    /^(?:(?:koden|portkoden|larmkoden|lösenordet|färgkoden|däckdimensionen|skostorleken)\s+(?:till|på|i|för)\s+.+\s+(?:är|blir|heter)\s+.+)$/i.exec(
      raw,
    );
  if (directFactMatch) {
    const category = inferCategoryFromContent(raw);
    return {
      type: "store",
      category,
      kind: "fact",
      content: raw,
    };
  }

  // 4. Memory query patterns: "Vad är koden till...", "Vilka däck...", "Vad har vi sparat under jobb"
  const queryPrefixMatch =
    /^(?:vad (?:är|var|heter|gäller för)|vad har vi för|vilken|vilket|vilka|hur var|hur stor är|visa|berätta om|sök)\s+(?:koden|portkoden|larmkoden|lösenordet|färgkoden|färgen|däcken|däckdimensionen|måttet|storleken|minnet|minnen|uppgiften|fakta)?\s*(.*)$/i.exec(
      raw,
    );

  const directCodeQueryMatch =
    /^(?:koden|portkoden|larmkoden|lösenordet|däck|däcken|färgkod|färgkoden)\s+(?:till|på|i|för)\s+(.+)$/i.exec(
      raw,
    );

  if (queryPrefixMatch || directCodeQueryMatch) {
    const queryTerm = directCodeQueryMatch
      ? raw
      : (queryPrefixMatch?.[1]?.trim() || raw);

    const category = inferCategoryFromContent(raw);
    return {
      type: "query",
      query: queryTerm,
      category: category !== "general" ? category : undefined,
    };
  }

  // 5. Short keyword query: "Bilen däck", "Jobb koder", "Huset färg"
  const shortCategoryQueryMatch =
    /^(jobb|jobbet|bil|bilen|hus|huset|barn|barnen|ekonomi)\s+([a-zåäö0-9\s]+)$/i.exec(
      raw,
    );
  if (shortCategoryQueryMatch) {
    const cat = PREFIX_MAP[shortCategoryQueryMatch[1].toLowerCase()];
    return {
      type: "query",
      query: shortCategoryQueryMatch[2].trim(),
      category: cat,
    };
  }

  return { type: "none" };
}
