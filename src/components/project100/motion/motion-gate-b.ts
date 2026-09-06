export interface GateBPhase {
  id: string;
  startsAtMs: number;
  endsAtMs: number;
  title: string;
  instruction: string;
}

export const GATE_B_DURATION_MS = 600_000;
export const GATE_B_COUNTDOWN_MS = 7_000;

export const GATE_B_PHASES: readonly GateBPhase[] = [
  { id: "punch-1", startsAtMs: 0, endsAtMs: 60_000, title: "Slag", instruction: "Stå framifrån och växla lugna raka slag med båda händerna." },
  { id: "squat-1", startsAtMs: 60_000, endsAtMs: 120_000, title: "Knäböj", instruction: "Gör kontrollerade knäböj. Håll hela kroppen kvar i bild." },
  { id: "duck-1", startsAtMs: 120_000, endsAtMs: 180_000, title: "Duckningar", instruction: "Växla stående position med tydliga duckningar och res dig helt." },
  { id: "mixed-1", startsAtMs: 180_000, endsAtMs: 300_000, title: "Blandad rörelse", instruction: "Blanda slag, sidosteg, knäböj och duckningar i lugnt tempo." },
  { id: "punch-2", startsAtMs: 300_000, endsAtMs: 360_000, title: "Slag igen", instruction: "Växla höga, raka och breda slag. Stanna framför kameran." },
  { id: "squat-2", startsAtMs: 360_000, endsAtMs: 420_000, title: "Knäböj igen", instruction: "Fortsätt med kontrollerade knäböj och full resning." },
  { id: "duck-2", startsAtMs: 420_000, endsAtMs: 480_000, title: "Duckningar igen", instruction: "Ducka tydligt, res dig och lägg in lugna sidosteg." },
  { id: "mixed-2", startsAtMs: 480_000, endsAtMs: 600_000, title: "Sluttest", instruction: "Blanda alla rörelser. Fortsätt tills rösten säger att testet är klart." },
] as const;

export function gateBPhase(elapsedMs: number): GateBPhase {
  return GATE_B_PHASES.find((phase) => elapsedMs >= phase.startsAtMs && elapsedMs < phase.endsAtMs)
    ?? GATE_B_PHASES[GATE_B_PHASES.length - 1];
}
