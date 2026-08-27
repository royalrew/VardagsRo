/**
 * Ties a source excerpt to where it stands on the page.
 *
 * The model reads meaning; OCR reads position. Neither knows what the other
 * found, so the join is made here, deterministically, the same way the Medvind
 * and school-schedule rules already work: the model proposes, the code decides.
 *
 * Coordinates are fractions of the rendered page, never pixels. A pixel is only
 * meaningful next to the exact image that produced it, and the family may see
 * the page at any size on any device.
 */

/** A rectangle in rendered pixels, as OCR reports it. */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A rectangle as fractions 0-1 of the rendered page. */
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  box: PixelBox;
  confidence: number;
}

export interface OcrLine {
  words: OcrWord[];
}

export interface OcrPage {
  /** Rendered size the boxes were measured against. */
  widthPx: number;
  heightPx: number;
  /** Rotation applied before OCR, in degrees. Stored so a later render matches. */
  rotation: number;
  lines: OcrLine[];
}

export interface LocatedExcerpt {
  /** One rectangle per line the match spans, so a wrapped sentence highlights fully. */
  boxes: NormalizedBox[];
  /** 0-1. How much of the excerpt was actually found on the page. */
  score: number;
}

/**
 * Below this the match is guesswork. The caller must then fall back to the whole
 * page rather than draw a rectangle that looks precise and is not.
 */
export const MINIMUM_MATCH_SCORE = 0.6;

export function normalizeBox(box: PixelBox, page: OcrPage): NormalizedBox {
  const width = Math.max(page.widthPx, 1);
  const height = Math.max(page.heightPx, 1);
  const x0 = Math.min(box.x0, box.x1);
  const x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1);
  const y1 = Math.max(box.y0, box.y1);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp(x0 / width),
    y: clamp(y0 / height),
    width: clamp((x1 - x0) / width),
    height: clamp((y1 - y0) / height),
  };
}

/**
 * Times and dates carry meaning in this material, so digits and colons survive.
 * Everything else that only affects appearance is dropped, because OCR and the
 * model disagree about punctuation far more often than about words.
 */
function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase("sv-SE")
    .replace(/[^\p{Letter}\p{Number}:]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function unionBox(boxes: readonly PixelBox[]): PixelBox {
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

interface FlatWord extends OcrWord {
  lineIndex: number;
}

function flatten(page: OcrPage): FlatWord[] {
  return page.lines.flatMap((line, lineIndex) =>
    line.words.map((word) => ({ ...word, lineIndex })),
  );
}

/**
 * Not every word is worth the same. A timetable repeats "Samhällsorienterande
 * ämnen" on five days, so finding it says almost nothing about where you are;
 * the time beside it says almost everything. Weighting by how rare a token is on
 * the page makes the distinguishing words decide the match, which is what a
 * human does when looking for a line on a page.
 */
function tokenWeights(pageTokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of pageTokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  const weights = new Map<string, number>();
  for (const [token, count] of counts) weights.set(token, 1 / count);
  return weights;
}

/** Weight of the wanted tokens the window contains, counting repeats once each. */
function overlap(
  wanted: readonly string[],
  window: readonly string[],
  weights: Map<string, number>,
): number {
  const remaining = new Map<string, number>();
  for (const token of window) remaining.set(token, (remaining.get(token) ?? 0) + 1);

  let found = 0;
  for (const token of wanted) {
    const left = remaining.get(token) ?? 0;
    if (left > 0) {
      remaining.set(token, left - 1);
      // A token the page never contains cannot be found, so it only ever counts
      // against the score through the denominator.
      found += weights.get(token) ?? 0;
    }
  }
  return found;
}

/**
 * Finds where an excerpt stands on the page, or null when it cannot be found
 * well enough to point at. Null is a real answer, not a failure: the honest
 * fallback is the whole page.
 */
export function locateExcerpt(page: OcrPage, excerpt: string): LocatedExcerpt | null {
  const wanted = tokens(excerpt);
  if (wanted.length === 0) return null;

  const words = flatten(page);
  if (words.length === 0) return null;

  const wordTokens = words.map((word) => tokens(word.text).join(""));
  const weights = tokenWeights(wordTokens);
  // An excerpt token missing from the page still counts in the denominator, so a
  // half-remembered sentence cannot score full marks.
  const wantedWeight = wanted.reduce(
    (total, token) => total + (weights.get(token) ?? 1),
    0,
  );
  if (wantedWeight === 0) return null;

  // A window a little longer than the excerpt absorbs the stray fragments OCR
  // splits words into without letting an unrelated paragraph score well.
  const candidates: { start: number; end: number; score: number }[] = [];
  for (const extra of [0, 1, 2, 3]) {
    const size = wanted.length + extra;
    for (let start = 0; start + size <= words.length + extra; start += 1) {
      const end = Math.min(start + size, words.length);
      if (end - start < Math.min(wanted.length, 1)) continue;
      candidates.push({
        start,
        end,
        score: overlap(wanted, wordTokens.slice(start, end), weights) / wantedWeight,
      });
    }
  }

  const topScore = candidates.reduce((highest, one) => Math.max(highest, one.score), 0);
  if (topScore < MINIMUM_MATCH_SCORE) return null;

  const winners = candidates.filter((one) => one.score === topScore);
  const best = winners[0];

  // A timetable repeats the same lesson text on several days, so the best match
  // can occur in more than one place. Highlighting whichever came first would be
  // a guess dressed as a fact. Distinct places means no answer, and the caller
  // falls back to the page.
  const scattered = winners.some(
    (one) => one.start > best.end || one.end < best.start,
  );
  if (scattered) return null;

  const matched = words.slice(best.start, best.end);
  const byLine = new Map<number, PixelBox[]>();
  for (const word of matched) {
    const line = byLine.get(word.lineIndex) ?? [];
    line.push(word.box);
    byLine.set(word.lineIndex, line);
  }

  return {
    boxes: [...byLine.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, boxes]) => normalizeBox(unionBox(boxes), page)),
    score: Number(best.score.toFixed(3)),
  };
}
