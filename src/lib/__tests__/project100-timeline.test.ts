import { describe, expect, it } from "vitest";

import {
  journalExcerpt,
  journalWordCount,
  PROJECT100_JOURNAL_PROMPTS,
  promptForDay,
} from "@/lib/project100-journal";
import {
  countProject100TimelineKinds,
  groupProject100Timeline,
  type Project100TimelineItem,
  type Project100TimelineKind,
} from "@/lib/project100-timeline";

function item(
  kind: Project100TimelineKind,
  on: string,
  title: string,
  sensitive = false,
  atMinute: number | null = null,
): Project100TimelineItem {
  return {
    kind,
    id: `${kind}-${on}-${title}`,
    on,
    atMinute,
    title,
    detail: null,
    href: null,
    sensitive,
  };
}

describe("Projekt 100 timeline", () => {
  it("puts the newest day first", () => {
    const days = groupProject100Timeline([
      item("journal", "2026-08-20", "En tung dag"),
      item("training", "2026-08-26", "Helkropp hemma"),
      item("body", "2026-08-23", "Vikt 83,4 kg"),
    ]);

    expect(days.map((day) => day.on)).toEqual(["2026-08-26", "2026-08-23", "2026-08-20"]);
  });

  it("reads a day in the order the day was lived, not by table", () => {
    const days = groupProject100Timeline([
      item("media", "2026-08-26", "Matbild"),
      item("body", "2026-08-26", "Vikt 83,4 kg"),
      item("meal", "2026-08-26", "Kyckling och ris", false, 720),
      item("training", "2026-08-26", "Helkropp hemma"),
      item("journal", "2026-08-26", "Kändes starkt"),
    ]);

    expect(days[0].items.map((entry) => entry.kind)).toEqual([
      "journal",
      "training",
      "meal",
      "body",
      "media",
    ]);
  });

  it("orders meals by their logged clock time and leaves an unknown time last", () => {
    const days = groupProject100Timeline([
      item("meal", "2026-08-26", "Middag", false, 1_080),
      item("meal", "2026-08-26", "Tid saknas"),
      item("meal", "2026-08-26", "Frukost", false, 450),
    ]);

    expect(days[0].items.map((entry) => entry.title)).toEqual([
      "Frukost",
      "Middag",
      "Tid saknas",
    ]);
  });

  it("keeps two things of the same kind on one day in a stable order", () => {
    const days = groupProject100Timeline([
      item("media", "2026-08-26", "Ägg och gröt"),
      item("media", "2026-08-26", "Bild efter passet"),
    ]);

    expect(days[0].items.map((entry) => entry.title)).toEqual([
      "Bild efter passet",
      "Ägg och gröt",
    ]);
  });

  it("carries the sensitive flag through the grouping untouched", () => {
    const days = groupProject100Timeline([item("media", "2026-08-26", "Kroppsbild", true)]);

    expect(days[0].items[0].sensitive).toBe(true);
  });

  it("counts what a period actually holds", () => {
    expect(
      countProject100TimelineKinds([
        item("journal", "2026-08-26", "A"),
        item("journal", "2026-08-25", "B"),
        item("media", "2026-08-25", "C"),
        item("meal", "2026-08-25", "D"),
      ]),
    ).toEqual({ journal: 2, training: 0, meal: 1, body: 0, media: 1 });
  });

  it("returns nothing for a period with nothing in it", () => {
    expect(groupProject100Timeline([])).toEqual([]);
  });
});

describe("Projekt 100 journal helpers", () => {
  it("gives the same day the same question every time it is opened", () => {
    const first = promptForDay("2026-08-26");
    expect(promptForDay("2026-08-26")).toBe(first);
    expect(PROJECT100_JOURNAL_PROMPTS).toContain(first);
  });

  it("shortens an excerpt without cutting a word in half mid-space", () => {
    const long = `${"ord ".repeat(120)}slut`;
    const excerpt = journalExcerpt(long, 40);

    expect(excerpt.length).toBeLessThanOrEqual(40);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(journalExcerpt("Kort text", 40)).toBe("Kort text");
    expect(journalExcerpt(null)).toBe("");
  });

  it("flattens line breaks so a preview stays one paragraph", () => {
    expect(journalExcerpt("Först\n\n   sedan  \n detta")).toBe("Först sedan detta");
  });

  it("counts words rather than characters", () => {
    expect(journalWordCount("Tre ord här")).toBe(3);
    expect(journalWordCount("  ")).toBe(0);
    expect(journalWordCount(null)).toBe(0);
  });
});
