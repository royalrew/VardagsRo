export const PROJECT100_TIMELINE_KINDS = [
  "journal",
  "training",
  "meal",
  "body",
  "media",
] as const;

export type Project100TimelineKind = (typeof PROJECT100_TIMELINE_KINDS)[number];

export interface Project100TimelineItem {
  kind: Project100TimelineKind;
  id: string;
  on: string;
  /** Minutes after midnight when the source carries a real clock time. */
  atMinute: number | null;
  title: string;
  detail: string | null;
  href: string | null;
  /** Body pictures stay covered here too, not only in the gallery. */
  sensitive: boolean;
}

export interface Project100TimelineDay {
  on: string;
  items: Project100TimelineItem[];
}

export const PROJECT100_TIMELINE_LABELS: Record<Project100TimelineKind, string> = {
  journal: "Dagbok",
  training: "Träning",
  meal: "Måltid",
  body: "Kropp",
  media: "Bild",
};

/**
 * The order things are shown inside one day. It is not chronological — most of
 * these carry a date but no clock — so the day reads in the order the user
 * thinks about it: what I wrote, what I did, what I ate, what I measured,
 * what I saw. Multiple meals do carry a clock time and are ordered by it.
 */
const KIND_ORDER: Record<Project100TimelineKind, number> = {
  journal: 0,
  training: 1,
  meal: 2,
  body: 3,
  media: 4,
};

function compareWithinKind(
  left: Project100TimelineItem,
  right: Project100TimelineItem,
): number {
  if (left.atMinute !== null && right.atMinute !== null) {
    const byTime = left.atMinute - right.atMinute;
    if (byTime !== 0) return byTime;
  } else if (left.atMinute !== null) {
    return -1;
  } else if (right.atMinute !== null) {
    return 1;
  }
  return left.title.localeCompare(right.title, "sv-SE");
}

export function groupProject100Timeline(
  items: Project100TimelineItem[],
): Project100TimelineDay[] {
  const days = new Map<string, Project100TimelineItem[]>();
  for (const item of items) {
    const list = days.get(item.on) ?? [];
    list.push(item);
    days.set(item.on, list);
  }
  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([on, dayItems]) => ({
      on,
      items: dayItems.sort(
        (left, right) =>
          KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
          compareWithinKind(left, right),
      ),
    }));
}

export function countProject100TimelineKinds(
  items: Project100TimelineItem[],
): Record<Project100TimelineKind, number> {
  const counts: Record<Project100TimelineKind, number> = {
    journal: 0,
    training: 0,
    meal: 0,
    body: 0,
    media: 0,
  };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}
