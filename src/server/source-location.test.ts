import { describe, expect, it } from "vitest";

import {
  MINIMUM_MATCH_SCORE,
  displayPageSize,
  locateExcerpt,
  locateExcerpts,
  normalizeBox,
  toDisplayBox,
  type OcrPage,
} from "@/server/source-location";

function word(text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90) {
  return { text, box: { x0, y0, x1, y1 }, confidence };
}

/** A short letter from school, laid out as three lines on an A4-ish page. */
function letter(): OcrPage {
  return {
    widthPx: 1000,
    heightPx: 2000,
    rotation: 0,
    lines: [
      {
        words: [
          word("Kallelse", 100, 100, 260, 140),
          word("till", 270, 100, 330, 140),
          word("utvecklingssamtal", 340, 100, 700, 140),
        ],
      },
      {
        words: [
          word("Tisdag", 100, 200, 220, 240),
          word("den", 230, 200, 290, 240),
          word("15", 300, 200, 340, 240),
          word("september", 350, 200, 560, 240),
          word("klockan", 570, 200, 700, 240),
          word("16:30", 710, 200, 800, 240),
        ],
      },
      {
        words: [
          word("Ta", 100, 300, 140, 340),
          word("med", 150, 300, 220, 340),
          word("blanketten", 230, 300, 430, 340),
        ],
      },
    ],
  };
}

describe("normalizeBox", () => {
  it("expresses a rectangle as fractions of the rendered page", () => {
    const page = letter();

    expect(normalizeBox({ x0: 100, y0: 200, x1: 600, y1: 400 }, page)).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.1,
    });
  });

  it("survives a rectangle given with its corners the wrong way round", () => {
    const page = letter();

    expect(normalizeBox({ x0: 600, y0: 400, x1: 100, y1: 200 }, page)).toEqual(
      normalizeBox({ x0: 100, y0: 200, x1: 600, y1: 400 }, page),
    );
  });

  it("never points outside the page", () => {
    const page = letter();
    const box = normalizeBox({ x0: -50, y0: -50, x1: 5000, y1: 9000 }, page);

    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(box.y + box.height).toBeLessThanOrEqual(1);
  });
});

describe("locateExcerpt", () => {
  it("finds a sentence and returns it as one rectangle on its line", () => {
    const found = locateExcerpt(letter(), "Tisdag den 15 september klockan 16:30");

    expect(found).not.toBeNull();
    expect(found!.score).toBe(1);
    expect(found!.boxes).toHaveLength(1);
    expect(found!.boxes[0].y).toBeCloseTo(0.1, 3);
  });

  it("ignores punctuation the model and OCR disagree about", () => {
    const found = locateExcerpt(letter(), "Kallelse till utvecklingssamtal.");

    expect(found!.score).toBe(1);
  });

  it("keeps times intact, so a wrong time is not treated as a match", () => {
    const exact = locateExcerpt(letter(), "klockan 16:30");
    const wrong = locateExcerpt(letter(), "klockan 18:45");

    expect(exact!.score).toBe(1);
    expect(wrong === null || wrong.score < 1).toBe(true);
  });

  it("returns one rectangle per line when the excerpt wraps", () => {
    const page: OcrPage = {
      widthPx: 1000,
      heightPx: 2000,
      rotation: 0,
      lines: [
        { words: [word("Ta", 100, 100, 140, 140), word("med", 150, 100, 220, 140)] },
        { words: [word("simkläder", 100, 200, 300, 240)] },
      ],
    };

    const found = locateExcerpt(page, "Ta med simkläder");

    expect(found!.boxes).toHaveLength(2);
    expect(found!.boxes[0].y).toBeLessThan(found!.boxes[1].y);
  });

  it("says nothing rather than pointing at the wrong place", () => {
    expect(locateExcerpt(letter(), "Träning på lördag i sporthallen")).toBeNull();
  });

  it("still finds a line when OCR misread one word", () => {
    const found = locateExcerpt(letter(), "Tisdag den 15 septemher klockan 16:30");

    expect(found).not.toBeNull();
    expect(found!.score).toBeGreaterThanOrEqual(MINIMUM_MATCH_SCORE);
    expect(found!.score).toBeLessThan(1);
  });

  it("has nothing to say about an empty excerpt or an empty page", () => {
    expect(locateExcerpt(letter(), "   ")).toBeNull();
    expect(
      locateExcerpt({ widthPx: 100, heightPx: 100, rotation: 0, lines: [] }, "Kallelse"),
    ).toBeNull();
  });
});

describe("display space", () => {
  const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

  it("leaves an upright image alone", () => {
    expect(toDisplayBox(box, 0)).toEqual(box);
  });

  it("swaps the page's sides when the viewer turns it a quarter", () => {
    expect(displayPageSize({ widthPx: 1200, heightPx: 800, rotation: 90 })).toEqual({
      widthPx: 800,
      heightPx: 1200,
    });
    expect(displayPageSize({ widthPx: 1200, heightPx: 800, rotation: 180 })).toEqual({
      widthPx: 1200,
      heightPx: 800,
    });
  });

  it("moves a box the same quarter turn the viewer applies", () => {
    // The ordinary portrait phone photo: stored sideways, shown upright.
    expect(toDisplayBox(box, 90)).toEqual({ x: 0.4, y: 0.1, width: 0.4, height: 0.3 });
    expect(toDisplayBox(box, 270)).toEqual({
      x: 0.2,
      y: 0.6000000000000001,
      width: 0.4,
      height: 0.3,
    });
  });

  it("turns a box upside down with the page", () => {
    expect(toDisplayBox(box, 180)).toMatchObject({ width: 0.3, height: 0.4 });
    expect(toDisplayBox(box, 180).x).toBeCloseTo(0.6, 6);
    expect(toDisplayBox(box, 180).y).toBeCloseTo(0.4, 6);
  });

  it("returns to where it started after four quarter turns", () => {
    const once = toDisplayBox(box, 90);
    const twice = toDisplayBox(once, 90);
    const thrice = toDisplayBox(twice, 90);
    const full = toDisplayBox(thrice, 90);

    expect(full.x).toBeCloseTo(box.x, 6);
    expect(full.y).toBeCloseTo(box.y, 6);
    expect(full.width).toBeCloseTo(box.width, 6);
    expect(full.height).toBeCloseTo(box.height, 6);
  });

  it("mirrors after the turn, the way EXIF defines it", () => {
    expect(toDisplayBox(box, 0, true).x).toBeCloseTo(0.6, 6);
    expect(toDisplayBox(box, 90, true).x).toBeCloseTo(1 - 0.4 - 0.4, 6);
  });

  it("keeps every corner on the page", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const moved = toDisplayBox({ x: 0, y: 0, width: 1, height: 1 }, rotation);
      expect(moved.x).toBeCloseTo(0, 6);
      expect(moved.y).toBeCloseTo(0, 6);
      expect(moved.width).toBeCloseTo(1, 6);
      expect(moved.height).toBeCloseTo(1, 6);
    }
  });
});

describe("locateExcerpts", () => {
  /** A timetable where the same lesson name stands on two different days. */
  function timetable(): OcrPage {
    return {
      widthPx: 1000,
      heightPx: 1000,
      rotation: 0,
      lines: [
        {
          words: [
            word("09:10", 100, 100, 180, 130),
            word("Samhällsorienterande", 190, 100, 500, 130),
            word("ämnen", 510, 100, 600, 130),
          ],
        },
        {
          words: [
            word("13:35", 100, 300, 180, 330),
            word("Samhällsorienterande", 190, 300, 500, 330),
            word("ämnen", 510, 300, 600, 330),
          ],
        },
      ],
    };
  }

  it("gives two lessons with the same name two different places", () => {
    const located = locateExcerpts(timetable(), [
      { id: "morning", text: "09:10 Samhällsorienterande ämnen" },
      { id: "afternoon", text: "13:35 Samhällsorienterande ämnen" },
    ]);

    expect(located.size).toBe(2);
    expect(located.get("morning")!.boxes[0].y).not.toBe(located.get("afternoon")!.boxes[0].y);
    expect(located.get("morning")!.boxes[0].y).toBeCloseTo(0.1, 3);
    expect(located.get("afternoon")!.boxes[0].y).toBeCloseTo(0.3, 3);
  });

  it("hands out each place at most once, even when the times were misread", () => {
    // Both excerpts now look identical, so only one can honestly claim a place.
    const located = locateExcerpts(timetable(), [
      { id: "one", text: "Samhällsorienterande ämnen" },
      { id: "two", text: "Samhällsorienterande ämnen" },
    ]);

    const places = [...located.values()].map((found) => found.boxes[0].y);
    expect(new Set(places).size).toBe(places.length);
  });

  it("leaves out an excerpt that is not on the page at all", () => {
    const located = locateExcerpts(timetable(), [
      { id: "real", text: "09:10 Samhällsorienterande ämnen" },
      { id: "absent", text: "Simhall och busstider" },
    ]);

    expect(located.has("real")).toBe(true);
    expect(located.has("absent")).toBe(false);
  });
});
