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
  /** Stored size the boxes were measured against, before any rotation. */
  widthPx: number;
  heightPx: number;
  /** Clockwise degrees a viewer applies when showing the image. */
  rotation: 0 | 90 | 180 | 270;
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
interface Candidate {
  start: number;
  end: number;
  score: number;
}

function rankCandidates(page: OcrPage, excerpt: string): Candidate[] {
  const wanted = tokens(excerpt);
  if (wanted.length === 0) return [];

  const words = flatten(page);
  if (words.length === 0) return [];

  const wordTokens = words.map((word) => tokens(word.text).join(""));
  const weights = tokenWeights(wordTokens);
  const wantedWeight = wanted.reduce((total, token) => total + (weights.get(token) ?? 1), 0);
  if (wantedWeight === 0) return [];

  const candidates: Candidate[] = [];
  for (const extra of [0, 1, 2, 3]) {
    const size = wanted.length + extra;
    for (let start = 0; start + size <= words.length + extra; start += 1) {
      const end = Math.min(start + size, words.length);
      if (end - start < Math.min(wanted.length, 1)) continue;
      const score = overlap(wanted, wordTokens.slice(start, end), weights) / wantedWeight;
      if (score >= MINIMUM_MATCH_SCORE) candidates.push({ start, end, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function boxesFor(page: OcrPage, candidate: Candidate): NormalizedBox[] {
  const matched = flatten(page).slice(candidate.start, candidate.end);
  const byLine = new Map<number, PixelBox[]>();
  for (const word of matched) {
    const line = byLine.get(word.lineIndex) ?? [];
    line.push(word.box);
    byLine.set(word.lineIndex, line);
  }
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, boxes]) => normalizeBox(unionBox(boxes), page));
}

/**
 * Places several excerpts from the same document at once.
 *
 * A timetable prints the same lesson name on several days, so an excerpt looked
 * up on its own can win a place that belongs to another. Two events pointing at
 * one rectangle means at least one of them is wrong, and both look equally
 * certain. Handing out each place at most once removes that: the strongest match
 * takes it, and the others must find their own or go without.
 */
export function locateExcerpts(
  page: OcrPage,
  excerpts: readonly { id: string; text: string }[],
): Map<string, LocatedExcerpt> {
  const ranked = excerpts.map((excerpt) => ({
    id: excerpt.id,
    candidates: rankCandidates(page, excerpt.text),
  }));

  // Strongest first, so a confident match is not displaced by a weak one that
  // happened to be considered earlier.
  ranked.sort((a, b) => (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0));

  const taken: Candidate[] = [];
  const located = new Map<string, LocatedExcerpt>();

  for (const { id, candidates } of ranked) {
    const free = candidates.find(
      (candidate) =>
        !taken.some((claim) => candidate.start < claim.end && claim.start < candidate.end),
    );
    if (!free) continue;
    taken.push(free);
    located.set(id, { boxes: boxesFor(page, free), score: Number(free.score.toFixed(3)) });
  }

  return located;
}

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

/**
 * Boxes come out of OCR in the coordinates of the image as stored. A browser
 * shows a photo the way its EXIF orientation says it should, so for a phone
 * photo the picture on screen and the coordinates disagree by a quarter turn.
 *
 * Rather than leave that arithmetic to the viewer, boxes are converted here into
 * the space the viewer actually paints. The page then overlays plain
 * percentages, and the rotation cannot be forgotten in one place and applied in
 * another.
 */
export function displayPageSize(
  page: Pick<OcrPage, "widthPx" | "heightPx" | "rotation">,
): { widthPx: number; heightPx: number } {
  const turned = page.rotation === 90 || page.rotation === 270;
  return {
    widthPx: turned ? page.heightPx : page.widthPx,
    heightPx: turned ? page.widthPx : page.heightPx,
  };
}

export function toDisplayBox(
  box: NormalizedBox,
  rotation: OcrPage["rotation"],
  mirrored = false,
): NormalizedBox {
  let turned: NormalizedBox;
  switch (rotation) {
    case 90:
      turned = { x: 1 - box.y - box.height, y: box.x, width: box.height, height: box.width };
      break;
    case 180:
      turned = { x: 1 - box.x - box.width, y: 1 - box.y - box.height, width: box.width, height: box.height };
      break;
    case 270:
      turned = { x: box.y, y: 1 - box.x - box.width, width: box.height, height: box.width };
      break;
    default:
      turned = { ...box };
  }
  // EXIF mirrors after the turn, in the frame the viewer sees.
  return mirrored ? { ...turned, x: 1 - turned.x - turned.width } : turned;
}
