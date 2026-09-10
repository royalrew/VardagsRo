import { randomInt, randomUUID } from "node:crypto";
import { addCalendarDateDays } from "@/lib/dates";
import { GARDEN_HABITS, type GardenAction, type GardenHabit, type GardenSurprise } from "@/lib/garden";
import { AppError } from "@/server/errors";

// Kept on the server. Neither the catalog nor unopened gifts enter the client bundle.
const gifts: NonNullable<GardenSurprise["gift"]>[] = [
  { title: "Trädgårdens första hyresgäst", text: "En humla har flyttat in. Hyran betalas i surr. Referenser saknas, men arbetsmoralen verkar god.", symbol: "🐝", effect: "flutter" },
  { title: "Ett brev från framtiden", text: "Tack för att du började innan du kände dig redo. Hälsningar, du lite längre fram.", symbol: "💌", effect: "glow" },
  { title: "Nattvakten", text: "Den här lilla lyktan lyser för alla gånger du gjorde det lilla, trots att soffan hade ett övertygande argument.", symbol: "🏮", effect: "glow" },
  { title: "En mycket långsam applåd", text: "Snigeln började klappa när du planterade fröet. Nu kom ljudet fram. Den är imponerad.", symbol: "🐌", effect: "bloom" },
  { title: "Det osynliga arbetet", text: "Rötterna syns inte. De växer ändå. Precis som det du bygger under helt vanliga dagar.", symbol: "🌷", effect: "bloom" },
  { title: "Familjeträdet", text: "Någon du älskar fick känna det idag. Det är en större sak än en bock på en lista.", symbol: "🪺", effect: "glow" },
  { title: "En oväntad inspektion", text: "Igelkotten har granskat trädgården. Fem av fem taggar. Den rekommenderar fler rester i matlådan.", symbol: "🦔", effect: "bloom" },
  { title: "Två minuter", text: "Du behövde inte lösa hela livet. Du behövde bara börja med två minuter. Titta vad som växer här.", symbol: "🦋", effect: "flutter" },
  { title: "Ett litet observatorium", text: "En ny tanke kan vara ett frö. Fortsätt vara nyfiken, också på sådant du ännu inte är bra på.", symbol: "🔭", effect: "glow" },
  { title: "Kunglig utnämning", text: "Du är härmed trädgårdens överste mellanrumsborstmästare. Titeln är lång. Ceremonin var kort.", symbol: "👑", effect: "glow" },
  { title: "Morgondagens tack", text: "Någon har lämnat en lapp: Frukosten var färdig. Det gjorde morgonen lättare. Tack, gårdagens jag.", symbol: "🧺", effect: "bloom" },
  { title: "Den lilla orkestern", text: "En fågel sjunger för dig. Den kan bara tre toner, men den menar varenda en.", symbol: "🐦", effect: "flutter" },
  { title: "Ett hemligt växthus", text: "Här får ofärdiga idéer växa. De behöver inte vara geniala när de skrivs ner. Bara få finnas.", symbol: "🍄", effect: "bloom" },
  { title: "Brevbäraren", text: "Den här fjärilen har inget viktigt ärende. Den ville bara visa att din trädgård har blivit en plats att stanna på.", symbol: "🦋", effect: "flutter" },
  { title: "En stjärna i gräset", text: "Alla dina små handlingar ryms inte i en stor berättelse. Men de ryms i en dag. Och dagar bygger ett liv.", symbol: "✨", effect: "glow" },
  { title: "Trädgårdens filosof", text: "Grodan säger: Ett litet hopp är också ett hopp. Sedan satte den sig på en sten och tog rast.", symbol: "🐸", effect: "bloom" },
  { title: "En dörr på glänt", text: "Bakom den här dörren bor lusten att fortsätta. Den öppnas oftare av ett litet försök än av en perfekt plan.", symbol: "🚪", effect: "glow" },
  { title: "En blomma utan anledning", text: "Den här blomman behöver ingen smart förklaring. Den är här för att göra din dag lite finare.", symbol: "🌸", effect: "bloom" },
  { title: "Ett mycket litet gym", text: "Myrorna har öppnat gym under trädet. De tycker att fem armhävningar är en utmärkt början. Medlemsavgift: en smula.", symbol: "🐜", effect: "flutter" },
  { title: "En stilla bänk", text: "Sätt dig en stund och se vad du har odlat. Du får uppskatta det du har gjort, också innan du är framme.", symbol: "🪑", effect: "bloom" },
];

interface StoredSurprise {
  id: string; day: number; content: number; slot: number; opened: boolean;
}
export interface GardenState {
  day: string;
  checks: GardenHabit[];
  previousDays: number;
  run: number;
  seed: number;
  resetOn: string | null;
  surprises: StoredSurprise[];
  seen: number[];
  positions: Record<string, number>;
}

export function newGarden(day: string): GardenState {
  return { day, checks: [], previousDays: 0, run: 1, seed: randomInt(1, 1_000_000), resetOn: null, surprises: [], seen: [], positions: {} };
}

export function gardenComplete(state: GardenState): boolean {
  return GARDEN_HABITS.every(habit => state.checks.includes(habit.id));
}
export function gardenStreak(state: GardenState): number {
  return state.previousDays + Number(gardenComplete(state));
}

/** Calendar dates, never elapsed 24-hour intervals (DST days can have 23/25 hours). */
export function advanceGarden(state: GardenState, today: string): GardenState {
  if (today <= state.day) return state;
  if (addCalendarDateDays(state.day, 1) === today && gardenComplete(state)) {
    return { ...state, day: today, previousDays: gardenStreak(state), checks: [] };
  }
  return { ...newGarden(today), run: state.run + 1, resetOn: today, seen: state.seen, positions: state.positions };
}

function unlock(state: GardenState): void {
  const day = gardenStreak(state);
  if (!gardenComplete(state) || day % 10 !== 0 || state.surprises.some(gift => gift.day === day)) return;
  // Exhaust unseen content before beginning a fresh shuffled cycle.
  let choices = gifts.map((_, index) => index).filter(index => !state.seen.includes(index) && !state.surprises.some(gift => gift.content === index));
  if (!choices.length) choices = gifts.map((_, index) => index).filter(index => index !== state.surprises.at(-1)?.content && index !== state.seen.at(-1));
  const content = choices[randomInt(choices.length)];
  const occupied = new Set(state.surprises.slice(-12).map(gift => gift.slot));
  const slots = Array.from({ length: 30 }, (_, i) => i).filter(slot => slot !== state.positions[content] && !occupied.has(slot));
  const slot = slots[randomInt(slots.length)];
  state.positions[content] = slot;
  state.surprises.push({ id: randomUUID(), day, content, slot, opened: false });
}

export function applyGardenAction(state: GardenState, action: GardenAction): GardenState {
  if (action.date !== state.day) throw new AppError(409, "GARDEN_OLD_DAY", "Dagen har ändrats. Öppna dagens vanor och försök igen.");
  const next = structuredClone(state);
  if (action.action === "check") {
    next.checks = next.checks.filter(habit => habit !== action.habit);
    if (action.done) next.checks.push(action.habit);
    unlock(next);
  }
  if (action.action === "reveal") {
    const gift = next.surprises.find(gift => gift.id === action.id && gift.day <= gardenStreak(next));
    if (!gift) throw new AppError(404, "GARDEN_GIFT_MISSING", "Den upptäckten finns inte i din nuvarande trädgård.");
    if (!gift.opened) {
      gift.opened = true;
      // Keep the current shuffled cycle bounded; location memory survives cycles and resets.
      if (next.seen.length >= gifts.length) next.seen = [];
      next.seen = [...next.seen.filter(id => id !== gift.content), gift.content];
    }
  }
  return next;
}

export function gardenSurprises(state: GardenState): GardenSurprise[] {
  return state.surprises.filter(gift => gift.day <= gardenStreak(state)).map(gift => ({
    id: gift.id, day: gift.day,
    x: 12 + (gift.slot % 6) * 15,
    y: 40 + Math.floor(gift.slot / 6) * 11,
    gift: gift.opened ? gifts[gift.content] : null,
  }));
}
