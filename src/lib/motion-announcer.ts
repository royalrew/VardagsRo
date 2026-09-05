import { MOTION_GAME_COUNTDOWN_MS, type MotionGameState } from "./motion-game";

export type MotionArenaLanguage = "en" | "sv";

export interface MotionArenaCue {
  kind: "start" | "countdown" | "go" | "duck" | "praise" | "damage" | "halfway" | "final" | "finish";
  priority: boolean;
  text: string;
}

function secondsRemaining(state: MotionGameState): number {
  if (state.status === "countdown") return 60;
  return Math.max(0, Math.ceil((state.endsAt - state.nowMs) / 1_000));
}

export function motionArenaStartCue(lang: MotionArenaLanguage = "en"): MotionArenaCue {
  const countdownSeconds = Math.round(MOTION_GAME_COUNTDOWN_MS / 1_000);
  return {
    kind: "start",
    priority: true,
    text:
      lang === "sv"
        ? `Neonväktaren vaknar. Du har ${countdownSeconds} sekunder. Gå till din plats.`
        : `Neon Guardian approaches. ${countdownSeconds} seconds. Take your stance.`,
  };
}

export function motionArenaCue(
  previous: MotionGameState,
  current: MotionGameState,
  lang: MotionArenaLanguage = "en",
): MotionArenaCue | null {
  if (previous.status !== "finished" && current.status === "finished") {
    if (lang === "sv") {
      const reason = current.finishReason === "hearts" ? "Rundan är slut." : "Tiden är ute.";
      return {
        kind: "finish",
        priority: true,
        text: `${reason} ${current.score} poäng, ${current.hits} träffar och ${current.dodges} duckningar.`,
      };
    }
    const reason = current.finishReason === "hearts" ? "Defeated!" : "Time's up!";
    return {
      kind: "finish",
      priority: true,
      text: `${reason} Final score: ${current.score} points, ${current.hits} hits, and ${current.dodges} dodges.`,
    };
  }

  if (previous.status === "countdown" && current.status === "running") {
    return { kind: "go", priority: true, text: lang === "sv" ? "Kör!" : "Fight!" };
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
    return { kind: "duck", priority: true, text: lang === "sv" ? "Ducka!" : "Duck!" };
  }

  if (current.effect && current.effect.id !== previous.effect?.id) {
    if (current.effect.type === "damage") {
      if (lang === "sv") {
        return {
          kind: "damage",
          priority: true,
          text: current.hearts === 1 ? "Ett liv kvar. Fokus!" : `${current.hearts} liv kvar. Upp igen!`,
        };
      }
      return {
        kind: "damage",
        priority: true,
        text: current.hearts === 1 ? "One heart remaining! Focus!" : `${current.hearts} hearts left! Stay up!`,
      };
    }
    if (current.effect.type === "duck") {
      return { kind: "praise", priority: false, text: lang === "sv" ? "Snygg duckning!" : "Clean dodge!" };
    }
    if (current.effect.type === "hit" && current.combo >= 3 && current.combo % 3 === 0) {
      return {
        kind: "praise",
        priority: false,
        text: lang === "sv" ? `${current.combo} i combo. Snyggt!` : `${current.combo} hit combo!`,
      };
    }
  }

  const previousSeconds = secondsRemaining(previous);
  const currentSeconds = secondsRemaining(current);
  if (previousSeconds > 30 && currentSeconds <= 30) {
    return { kind: "halfway", priority: false, text: lang === "sv" ? "Halva tiden. Fortsätt!" : "Halfway! Keep moving!" };
  }
  if (previousSeconds > 10 && currentSeconds <= 10) {
    return { kind: "final", priority: true, text: lang === "sv" ? "Tio sekunder kvar!" : "Ten seconds left!" };
  }
  return null;
}
