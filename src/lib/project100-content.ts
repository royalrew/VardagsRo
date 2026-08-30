import type { Project100MediaItem } from "@/lib/project100-media";

export const PROJECT100_CONTENT_STATUSES = [
  "idea",
  "draft",
  "filmed",
  "edited",
  "published",
] as const;

export type Project100ContentStatus = (typeof PROJECT100_CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Record<Project100ContentStatus, string> = {
  idea: "Idé",
  draft: "Manus",
  filmed: "Inspelad",
  edited: "Redigerad",
  published: "Publicerad",
};

export interface Project100ShotlistItem {
  id: string;
  title: string;
  completed: boolean;
  note: string | null;
}

export interface Project100ThumbnailIdea {
  id: string;
  title: string;
  concept: string | null;
}

export interface Project100AttachedMedia {
  mediaId: string;
  caption: string | null;
  position: number;
  previewUrl: string | null;
  capturedOn: string;
  category: string;
}

export interface Project100ContentProject {
  id: string;
  title: string;
  hook: string | null;
  concept: string | null;
  script: string | null;
  status: Project100ContentStatus;
  targetPublishDate: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  thumbnailIdeas: Project100ThumbnailIdea[];
  shotlist: Project100ShotlistItem[];
  media: Project100AttachedMedia[];
  createdAt: string;
  updatedAt: string;
}

export interface Project100ContentWorkspace {
  projects: Project100ContentProject[];
  activeProject: Project100ContentProject | null;
  availableMedia: Project100MediaItem[];
}

export interface EditorContextData {
  recentWorkoutsCount: number;
  totalWeightDeltaKg: number | null;
  notableMilestone: string | null;
  currentWeekTheme?: string;
}

export interface EditorSuggestion {
  hook: string;
  concept: string;
  titleIdeas: string[];
  suggestedShotlist: string[];
}

/**
 * Builds a deterministic editorial proposal for video ideas based on real weekly performance.
 */
export function buildDeterministicContentSuggestion(
  context: EditorContextData,
): EditorSuggestion {
  const workoutStr =
    context.recentWorkoutsCount > 0
      ? `${context.recentWorkoutsCount} genomförda träningspass`
      : "fokus på återhämtning och planering";

  const weightStr =
    context.totalWeightDeltaKg !== null
      ? `en viktförändring på ${context.totalWeightDeltaKg > 0 ? "+" : ""}${context.totalWeightDeltaKg} kg`
      : "stabil utveckling";

  const hook = `I den här videon går jag igenom hur veckan såg ut med ${workoutStr} och ${weightStr} runt skiftarbetet.`;
  const concept = `Transparens kring resan: hur träning och matlådor faktiskt klaffar när schemat är oregelbundet.`;

  return {
    hook,
    concept,
    titleIdeas: [
      `Projekt 100: ${context.notableMilestone ?? "Vardagen & Träningen"}`,
      `Hur jag tränar och äter runt skiftjobb (${workoutStr})`,
      `Vägen till 100 kg: Ärlig uppdatering ur träningsloggen`,
    ],
    suggestedShotlist: [
      "Intro & veckans sammanfattning (sittande vid skrivbordet)",
      "B-roll på matlådeprep ur frysen",
      "Klipp från gymmet / tyngsta setet",
      "Genomgång av veckans siffror och reflektion",
      "Outro & mål inför kommande vecka",
    ],
  };
}
