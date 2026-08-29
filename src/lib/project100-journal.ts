export interface Project100JournalEntry {
  writtenOn: string;
  body: string | null;
  mood: number | null;
  energy: number | null;
  sleepHours: number | null;
  /** The user's own decision, per entry: this one is not for the assistant. */
  excludedFromAi: boolean;
  updatedAt: string;
}

export interface Project100JournalView {
  today: string;
  from: string;
  to: string;
  query: string | null;
  entries: Project100JournalEntry[];
  totalEntries: number;
  excludedCount: number;
}

/** Optional. A blank page is the point; these are for the days it is too blank. */
export const PROJECT100_JOURNAL_PROMPTS: readonly string[] = [
  "Vad gjorde kroppen bra idag?",
  "Vad var svårast, och vad gjorde det svårt?",
  "Vad vill du minnas om den här dagen om ett år?",
  "Vad skulle göra morgondagen lite lättare?",
  "Vad åt du som faktiskt fungerade?",
  "Var kom energin ifrån — eller vart tog den vägen?",
  "Vad gjorde du som du inte trodde att du orkade?",
];

export const PROJECT100_MOOD_LABELS: Record<number, string> = {
  1: "Tungt",
  2: "Trögt",
  3: "Vanligt",
  4: "Bra",
  5: "Starkt",
};

export const PROJECT100_ENERGY_LABELS: Record<number, string> = {
  1: "Tom",
  2: "Låg",
  3: "Halv",
  4: "God",
  5: "Full",
};

/** A stable prompt per day, so the page does not reshuffle while it is open. */
export function promptForDay(calendarDate: string): string {
  const seed = [...calendarDate].reduce((total, character) => total + character.charCodeAt(0), 0);
  return PROJECT100_JOURNAL_PROMPTS[seed % PROJECT100_JOURNAL_PROMPTS.length];
}

export function journalExcerpt(body: string | null, maxLength = 220): string {
  if (!body) return "";
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= maxLength ? flat : `${flat.slice(0, maxLength - 1).trimEnd()}…`;
}

export function journalWordCount(body: string | null): number {
  if (!body) return 0;
  const words = body.trim().split(/\s+/).filter(Boolean);
  return words.length;
}
