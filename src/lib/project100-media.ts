export const PROJECT100_MEDIA_CATEGORY_LABELS = {
  body: "Kropp",
  food: "Mat",
  training: "Träning",
  content: "Innehåll",
} as const;

export type Project100MediaCategory = keyof typeof PROJECT100_MEDIA_CATEGORY_LABELS;

export const PROJECT100_MEDIA_CATEGORY_ORDER = [
  "body",
  "food",
  "training",
  "content",
] as const satisfies readonly Project100MediaCategory[];

/** Body pictures stay hidden until asked for; a plate of food does not need that. */
export const PROJECT100_SENSITIVE_MEDIA_CATEGORIES: readonly Project100MediaCategory[] = [
  "body",
];

export interface Project100MediaItem {
  id: string;
  category: Project100MediaCategory;
  capturedOn: string;
  caption: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  width: number | null;
  height: number | null;
  originalBytes: number;
  hasPreview: boolean;
  /** Short-lived and re-signed on every read; never stored anywhere. */
  previewUrl: string | null;
  createdAt: string;
}

export interface Project100MediaLibrary {
  items: Project100MediaItem[];
  counts: Record<Project100MediaCategory, number>;
  urlExpiresInSeconds: number;
  storageConfigured: boolean;
}

export function formatMediaSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

export function emptyProject100MediaCounts(): Record<Project100MediaCategory, number> {
  return { body: 0, food: 0, training: 0, content: 0 };
}
