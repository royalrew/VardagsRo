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
  zeroXpActivities: readonly string[];
}
