import { MOTION_GAME_COUNTDOWN_MS, type MotionGameState } from "./motion-game";

export interface MotionArenaCue {
  kind: "start" | "countdown" | "go" | "duck" | "praise" | "damage" | "halfway" | "final" | "finish";
  priority: boolean;
  text: string;
}

function secondsRemaining(state: MotionGameState): number {
  if (state.status === "countdown") return 60;
  return Math.max(0, Math.ceil((state.endsAt - state.nowMs) / 1_000));
}

export function motionArenaStartCue(): MotionArenaCue {
  const countdownSeconds = Math.round(MOTION_GAME_COUNTDOWN_MS / 1_000);
  return {
    kind: "start",
    priority: true,
    text: `Neonväktaren vaknar. Du har ${countdownSeconds} sekunder. Gå till din plats.`,
  };
}

export function motionArenaCue(
  previous: MotionGameState,
  current: MotionGameState,
): MotionArenaCue | null {
  if (previous.status !== "finished" && current.status === "finished") {
    const reason = current.finishReason === "hearts" ? "Rundan är slut." : "Tiden är ute.";
    return {
      kind: "finish",
      priority: true,
      text: `${reason} ${current.score} poäng, ${current.hits} träffar och ${current.dodges} duckningar.`,
    };
  }

  if (previous.status === "countdown" && current.status === "running") {
    return { kind: "go", priority: true, text: "Kör!" };
  }

  if (previous.status === "countdown" && current.status === "countdown") {
    const previousCountdown = Math.max(1, Math.ceil((previous.startedAt - previous.nowMs) / 1_000));
    const currentCountdown = Math.max(1, Math.ceil((current.startedAt - current.nowMs) / 1_000));
    if (currentCountdown <= 3 && currentCountdown < previousCountdown) {
      return {
        kind: "countdown",
        priority: true,
        text: String(currentCountdown),
      };
    }
  }

  if (current.duck && current.duck.id !== previous.duck?.id) {
    return { kind: "duck", priority: true, text: "Ducka!" };
  }

  if (current.effect && current.effect.id !== previous.effect?.id) {
    if (current.effect.type === "damage") {
      return {
        kind: "damage",
        priority: true,
        text: current.hearts === 1 ? "Ett liv kvar. Fokus!" : `${current.hearts} liv kvar. Upp igen!`,
      };
    }
    if (current.effect.type === "duck") {
      return { kind: "praise", priority: false, text: "Snygg duckning!" };
    }
    if (current.effect.type === "hit" && current.combo >= 3 && current.combo % 3 === 0) {
      return { kind: "praise", priority: false, text: `${current.combo} i combo. Snyggt!` };
    }
  }

  const previousSeconds = secondsRemaining(previous);
  const currentSeconds = secondsRemaining(current);
  if (previousSeconds > 30 && currentSeconds <= 30) {
    return { kind: "halfway", priority: false, text: "Halva tiden. Fortsätt!" };
  }
  if (previousSeconds > 10 && currentSeconds <= 10) {
    return { kind: "final", priority: true, text: "Tio sekunder kvar!" };
  }
  return null;
}
