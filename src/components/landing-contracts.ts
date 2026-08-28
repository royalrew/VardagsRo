/**
 * The copy on the public page, kept apart from the markup so it can be checked
 * by a test. The page is the one surface a stranger sees, so a household name
 * or a contact detail that slips into it is not a typo — it is a disclosure.
 *
 * The guard is deliberately structural rather than a list of the family's
 * names: this file is committed, and a test that spelled the children out to
 * protect them would publish them itself.
 */

export interface LandingItem {
  title: string;
  body: string;
}

export const LANDING_STEPS: readonly LandingItem[] = [
  {
    title: "Skicka in",
    body: "Foto på en skollapp, ett arbetsschema som PDF, en kallelse. Det som annars blir liggande på köksbordet.",
  },
  {
    title: "AI läser",
    body: "Tider, personer, prov, läxor och saker att ta med plockas ut ur bilden eller dokumentet.",
  },
  {
    title: "Någon godkänner",
    body: "Förslagen visas för granskning. Varje fält går att ändra. Ingenting sparas som familjedata förrän en människa säger ja.",
  },
  {
    title: "Fråga på svenska",
    body: "”Vad händer i morgon?” Svaret räknas ut ur bekräftade uppgifter och pekar på sin källa.",
  },
] as const;

export const LANDING_PRINCIPLES: readonly LandingItem[] = [
  {
    title: "Fail-closed i produktion",
    body: "Demodata kan aldrig maskera en trasig databas. Ser appen ut att fungera, så fungerar den.",
  },
  {
    title: "Granskning före förtroende",
    body: "AI:n föreslår aldrig något som blir familjedata av sig självt. Ett tomt sökresultat betyder heller inte att någon är ledig — assistenten säger att underlag saknas.",
  },
  {
    title: "Filen kontrolleras två gånger",
    body: "Originalet skrivs inte till lagring under granskningen. Vid sparande verifieras filsignatur, MIME-typ och SHA-256 på nytt.",
  },
  {
    title: "Loggat och ångerbart",
    body: "En revisionslogg som databasen vägrar ändra i, och en väg tillbaka från en borttagning.",
  },
] as const;

export const LANDING_STACK: readonly string[] = [
  "Next.js 16",
  "TypeScript",
  "PostgreSQL",
  "Cloudflare R2",
  "OpenAI Responses API",
  "Better Auth",
  "Docker",
  "Railway",
] as const;

export const LANDING_PROSE: readonly string[] = [
  "Scheman, kallelser och viktiga tider på ett ställe. Skicka in en bild eller en PDF, kontrollera vad som hittades, och fråga sedan på vanlig svenska.",
  "Kraven kom från ett verkligt hushåll: sju personer, två vuxna med varsitt arbetsschema, fem barn på en skola och en förskola, och träningar och matcher däremellan. Informationen kommer från fem håll: en lapp i en ryggsäck, en PDF i ett mejl, ett schema i en skolplattform, en träningstid i en chattgrupp, ett datum någon försöker minnas.",
  "Ett system som familjen ska lita på måste vara ärligt när det inte vet något. Det mesta av arbetet ligger där.",
  "Jag är undersköterska i hemvården och har byggt Vardagsro för min egen familj. Det är inte ett övningsprojekt. Det körs i produktion, det är familjens riktiga kalender, och det som inte fungerar märks samma kväll.",
  "Att kunna verksamheten inifrån och att kunna bygga systemet är två olika saker som sällan sitter i samma person. Vardagsro är vad det blir när de gör det.",
] as const;

export interface LandingLink {
  label: string;
  href: string;
  /** What the visitor is told they are clicking. */
  text: string;
}

/**
 * Contact details live here and nowhere else, deliberately outside
 * `landingCopy`. The leak check stays pointed at the prose, where an address
 * would arrive by accident; these two arrived on purpose.
 *
 * A published address is scraped and will draw spam. That is the price of being
 * reachable, and being reachable is the whole point of the page.
 */
export const LANDING_CONTACT: readonly LandingLink[] = [
  {
    label: "E-post",
    href: "mailto:jimmy@zickaris.se",
    text: "jimmy@zickaris.se",
  },
  {
    label: "GitHub",
    href: "https://github.com/royalrew",
    text: "github.com/royalrew",
  },
] as const;

/** Every word the public page shows, as one list for the leak check. */
export function landingCopy(): string[] {
  return [
    ...LANDING_PROSE,
    ...LANDING_STACK,
    ...LANDING_STEPS.flatMap((item) => [item.title, item.body]),
    ...LANDING_PRINCIPLES.flatMap((item) => [item.title, item.body]),
  ];
}
