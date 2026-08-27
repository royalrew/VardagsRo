/**
 * Version 1 deliberately avoids health data.
 *
 * The decision, taken 2026-08-26: the calendar may carry a time and a place, but
 * never a diagnosis, a treatment or a referral. A care document therefore is not
 * filed at all. It is refused with a plain message, so nothing about a child's
 * health is quietly stored among ordinary school post.
 *
 * The check runs before the document is stored and before any text is read off
 * the page. Reading first and refusing afterwards would mean the text already
 * existed, which is the thing being avoided.
 *
 * The list is deliberately visible and easy to change. A hidden heuristic that
 * silently files a dentist letter would be worse than one that occasionally
 * refuses a school letter, because only the second kind gets noticed.
 */

/**
 * Stems, not whole words. `tandläkare` does not occur inside `Tandläkarbesök`,
 * and a rule that misses the most ordinary spelling of the most ordinary care
 * document is not a rule.
 */
const CARE_TERMS = [
  "tandläkar",
  "tandvård",
  "tandreglering",
  "vårdcentral",
  "sjukhus",
  "akutmottagning",
  "läkar",
  "remiss",
  "journal",
  "provsvar",
  "blodprov",
  "röntgen",
  "vaccin",
  "hälsokontroll",
  "hälsosamtal",
  "elevhälsa",
  "skolsköterska",
  "barnavårdscentral",
  "logoped",
  "habilitering",
  "psykolog",
  "fysioterapeut",
  "sjukgymnast",
  "dietist",
  "1177",
] as const;

/** Abbreviations that only mean care when they stand on their own. */
const CARE_ABBREVIATIONS = ["bvc", "bup", "vc"] as const;

function normalized(value: string): string {
  return value.toLocaleLowerCase("sv-SE");
}

export interface HealthDocumentCandidate {
  documentType: string;
  title: string;
}

/**
 * Returns the term that made this look like care material, or null when the
 * document may be filed. Only the type and the title are examined: a school
 * letter that happens to mention a nurse in passing is still a school letter,
 * and refusing it would make the product useless for what it is mostly for.
 */
export function unsupportedHealthDocument(
  candidate: HealthDocumentCandidate,
): string | null {
  const haystack = `${normalized(candidate.documentType)} ${normalized(candidate.title)}`;

  const term = CARE_TERMS.find((needle) => haystack.includes(needle));
  if (term) return term;

  const words = haystack.split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
  const abbreviation = CARE_ABBREVIATIONS.find((needle) => words.includes(needle));
  return abbreviation ?? null;
}

export const HEALTH_DOCUMENT_MESSAGE =
  "Vårddokument stöds inte än. Vardagsro sparar inte uppgifter om hälsa. " +
  "Lägg in tiden manuellt i kalendern om familjen behöver den.";
