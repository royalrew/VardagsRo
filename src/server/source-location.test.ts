import { describe, expect, it } from "vitest";

import {
  MINIMUM_MATCH_SCORE,
  locateExcerpt,
  normalizeBox,
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
