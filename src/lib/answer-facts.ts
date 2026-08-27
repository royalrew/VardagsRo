/**
 * Guards a translated answer against losing or changing facts.
 *
 * The answer itself is computed deterministically from confirmed family data,
 * which is what stops the assistant inventing things. Translating it puts a
 * model back in the path, so everything the family could act on - times, dates,
 * durations and the titles of their own calendar posts - has to survive the trip
 * unchanged. When it does not, the caller keeps the original answer rather than
 * showing a plausible-looking wrong one.
 */

/** Numbers, clock times and dates: anything the family might act on. */
export function factTokens(text: string): string[] {
  return text.match(/\d+(?:[.:,]\d+)*/g) ?? [];
}

/** Titles the answer quotes verbatim, using the typographic quotes we emit. */
export function quotedTitles(text: string): string[] {
  return [...text.matchAll(/[”"]([^”"]{1,200})[”"]/g)].map((match) => match[1]);
}

export interface FactCheckResult {
  ok: boolean;
  missingTokens: string[];
  missingTitles: string[];
  reason?: string;
}

const MAX_LENGTH_RATIO = 3;

/**
 * A translation is accepted only when every number and every quoted title from
 * the source is still present, and the length has not run away.
 */
export function checkTranslationKeepsFacts(source: string, translation: string): FactCheckResult {
  const trimmed = translation.trim();
  if (!trimmed) {
    return { ok: false, missingTokens: [], missingTitles: [], reason: "tom översättning" };
  }

  if (
    trimmed.length > source.length * MAX_LENGTH_RATIO ||
    trimmed.length * MAX_LENGTH_RATIO < source.length
  ) {
    return { ok: false, missingTokens: [], missingTitles: [], reason: "orimlig längd" };
  }

  // Count occurrences so a repeated time cannot be collapsed into one.
  const needed = new Map<string, number>();
  for (const token of factTokens(source)) {
    needed.set(token, (needed.get(token) ?? 0) + 1);
  }
  const present = new Map<string, number>();
  for (const token of factTokens(trimmed)) {
    present.set(token, (present.get(token) ?? 0) + 1);
  }
  const missingTokens = [...needed.entries()]
    .filter(([token, count]) => (present.get(token) ?? 0) < count)
    .map(([token]) => token);

  const missingTitles = quotedTitles(source).filter((title) => !trimmed.includes(title));

  return {
    ok: missingTokens.length === 0 && missingTitles.length === 0,
    missingTokens,
    missingTitles,
  };
}
