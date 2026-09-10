export const GARDEN_HABITS = [
  { id: "move", title: "Röra på kroppen", detail: "Fem armhävningar eller två minuter på motionscykeln.", icon: "💪" },
  { id: "love", title: "Visa kärlek", detail: "Säg att du älskar din fru och dina barn, eller ge dem en kärleksfull stund.", icon: "❤️" },
  { id: "learn", title: "Skapa eller lära", detail: "En projektidé, en liten kodändring eller något nyttigt du lär dig.", icon: "💡" },
  { id: "teeth", title: "Mellanrumsborsten", detail: "Använd mellanrumsborsten vid dagens tandborstning.", icon: "🦷" },
  { id: "tomorrow", title: "Underlätta morgondagen", detail: "Förbered något litet. Gärna frukost eller middagsrester till nästa jobblunch.", icon: "🌅" },
] as const;

export type GardenHabit = typeof GARDEN_HABITS[number]["id"];
export type GardenAction =
  | { action: "start"; date: string }
  | { action: "check"; date: string; habit: GardenHabit; done: boolean }
  | { action: "reveal"; date: string; id: string };

export interface GardenSurprise {
  id: string;
  day: number;
  x: number;
  y: number;
  gift: { title: string; text: string; symbol: string; effect: "glow" | "flutter" | "bloom" } | null;
}

export interface GardenView {
  started: boolean;
  date: string;
  timeZone: string;
  nextMidnight: string;
  checks: GardenHabit[];
  streak: number;
  run: number;
  seed: number;
  resetOn: string | null;
  surprises: GardenSurprise[];
}
