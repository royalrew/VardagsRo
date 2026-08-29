import type {
  SoloAction,
  SoloHealthDay,
  SoloQuest,
  SoloSettings,
  SoloSummary,
} from "@/lib/solo";
import type { SoloTalentNode } from "@/lib/solo-talents";

/**
 * The shape the browser receives from `/api/solo`. The server aliases its own
 * return type to this one, so the view and the endpoint cannot drift apart
 * without the compiler saying so.
 */
export interface SoloProgressView {
  today: string;
  summary: SoloSummary;
  talents: SoloTalentNode[];
  /** The smallest rungs that are actually open, read off the tree. */
  quests: SoloQuest[];
  settings: SoloSettings;
  recentActions: SoloAction[];
  healthToday: SoloHealthDay | null;
  /** Recent private check-ins power the journey graph and journal memory. */
  recentHealthDays: SoloHealthDay[];
  zeroXpActivities: readonly string[];
}

/**
 * Reads a number a person typed, unit and all: "80 kg", "7 tim", "6,5".
 *
 * Dropping what cannot be parsed is the tempting version and the wrong one. It
 * would silently discard a weight someone stepped on a scale for and then
 * report the day as saved, which is the exact kind of quiet lie the rest of
 * this product refuses. Unreadable input is refused out loud instead.
 */
export function readNumber(value: string, label: string): number | null {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/(kg|kilo|timmar|tim|h)$/u, "");
  if (cleaned === "") return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} går inte att läsa som ett tal.`);
  }
  return parsed;
}
