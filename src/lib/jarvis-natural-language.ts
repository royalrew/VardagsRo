export type JarvisBodyPart =
  | "foot"
  | "wrist"
  | "hand"
  | "knee"
  | "shoulder"
  | "elbow"
  | "back"
  | "neck"
  | "hip"
  | "calf";

export interface JarvisStrengthCapture {
  exerciseName: string;
  repsPerSet: number;
  setCount: number;
  totalReps: number;
}

export interface JarvisProteinCapture {
  title: "Proteinshake" | "Proteinmellanmål" | "Kvarg" | "Keso";
  proteinG: number | null;
}

export interface JarvisBodyStateCapture {
  status: "active" | "resolved";
  bodyPart: JarvisBodyPart;
  bodyPartLabel: string;
}

export interface JarvisTrainingAdaptation {
  avoid: string[];
  alternatives: string[];
}

const EXERCISES = [
  { pattern: /armhävningar?|push-?ups?|pushups?/i, name: "Armhävningar" },
  { pattern: /knäböj(?:ningar?)?|squats?/i, name: "Knäböj" },
  { pattern: /sit-?ups?|situps?/i, name: "Situps" },
  { pattern: /pull-?ups?|chins?/i, name: "Pull-ups" },
  { pattern: /dips?/i, name: "Dips" },
  { pattern: /utfall/i, name: "Utfall" },
  { pattern: /burpees?/i, name: "Burpees" },
  { pattern: /tåhävningar?/i, name: "Tåhävningar" },
] as const;

const BODY_PARTS: Array<{
  bodyPart: JarvisBodyPart;
  label: string;
  pattern: RegExp;
}> = [
  { bodyPart: "wrist", label: "handleden", pattern: /handlederna|handleder|handleden|handled/i },
  { bodyPart: "hand", label: "handen", pattern: /händerna|händer|handen|hand/i },
  { bodyPart: "knee", label: "knät", pattern: /knäna|knäet|knät|knä/i },
  { bodyPart: "shoulder", label: "axeln", pattern: /axlarna|axlar|axeln|axel/i },
  { bodyPart: "elbow", label: "armbågen", pattern: /armbågarna|armbågar|armbågen|armbåge/i },
  { bodyPart: "back", label: "ryggen", pattern: /ryggen|rygg/i },
  { bodyPart: "neck", label: "nacken", pattern: /nacken|nacke/i },
  { bodyPart: "hip", label: "höften", pattern: /höfterna|höfter|höften|höft/i },
  { bodyPart: "calf", label: "vaden", pattern: /vaderna|vader|vaden|vadmuskel/i },
  {
    bodyPart: "foot",
    label: "foten",
    pattern: /fötterna|fötter|foten|fotleden|fotled|ankeln|ankel|hälen|häl|tårna|tån/i,
  },
];

function normalized(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase("sv-SE")
    .replace(/[×✕*]/g, "x")
    .replace(/[,.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function completedActivityPhrase(text: string): boolean {
  return (
    /\b(?:gjorde|körde|klarade|tog)\s+jag\b/i.test(text) ||
    /\b(?:jag\s+)?(?:har\s+)?(?:gjort|kört|klarat)\b/i.test(text) ||
    /\b(?:gjorde|körde|klarade|tog)\b/i.test(text) ||
    /^\d{1,3}\s*(?:x|gånger|st|stycken|reps?\b)/i.test(text)
  );
}

export function parseJarvisStrengthCaptures(input: string): JarvisStrengthCapture[] {
  const text = normalized(input);
  if (!completedActivityPhrase(text)) return [];

  return EXERCISES.flatMap((exercise): JarvisStrengthCapture[] => {
    if (!exercise.pattern.test(text)) return [];

    const exerciseSource = exercise.pattern.source;
    const setFirst = new RegExp(
      `(\\d{1,2})\\s*(?:set|sets|omgångar)\\s*(?:med|à|a|x)?\\s*(\\d{1,3})\\s*(?:${exerciseSource})`,
      "i",
    ).exec(text);
    const repsFirst = new RegExp(
      `(\\d{1,3})\\s*(?:x|gånger)\\s*(\\d{1,2})\\s*(?:${exerciseSource})`,
      "i",
    ).exec(text);
    const singleSet = new RegExp(
      `(\\d{1,3})\\s*(?:st(?:ycken)?\\s*)?(?:${exerciseSource})`,
      "i",
    ).exec(text);

    const setCount = setFirst ? Number(setFirst[1]) : repsFirst ? Number(repsFirst[2]) : 1;
    const repsPerSet = setFirst
      ? Number(setFirst[2])
      : repsFirst
        ? Number(repsFirst[1])
        : Number(singleSet?.[1]);

    if (
      !Number.isInteger(setCount) ||
      !Number.isInteger(repsPerSet) ||
      setCount < 1 ||
      setCount > 20 ||
      repsPerSet < 1 ||
      repsPerSet > 500 ||
      setCount * repsPerSet > 2_000
    ) {
      return [];
    }

    return [{
      exerciseName: exercise.name,
      repsPerSet,
      setCount,
      totalReps: setCount * repsPerSet,
    }];
  });
}

export function parseJarvisStrengthCapture(input: string): JarvisStrengthCapture | null {
  return parseJarvisStrengthCaptures(input)[0] ?? null;
}

export function parseJarvisProteinCapture(input: string): JarvisProteinCapture | null {
  const text = normalized(input);
  const proteinMatch = /(\d{1,3}(?:[.,]\d+)?)\s*(?:g|gram)\s*(?:protein)?/i.exec(text);
  const consumed =
    /(?:^|\s)(?:drack|druckit|tog|tagit|åt|ätit)(?:\s|$)/i.test(text) ||
    /\bfick\s+i\s+mig\b/i.test(text);
  const explicitLog = /^(?:logga|notera)\s+/i.test(text) || /^\d{1,3}(?:[.,]\d+)?\s*(?:g|gram)\s*protein$/i.test(text);
  if (!consumed && !explicitLog) return null;

  let title: JarvisProteinCapture["title"] | null = null;
  if (/\b(?:protein(?:shake|drink)|vassle(?:shake|drink)|shake)\b/i.test(text)) title = "Proteinshake";
  else if (/\bkvarg\b/i.test(text)) title = "Kvarg";
  else if (/\bkeso\b/i.test(text)) title = "Keso";
  else if (proteinMatch) title = "Proteinmellanmål";
  if (!title) return null;

  const proteinG = proteinMatch ? Math.round(Number(proteinMatch[1].replace(",", "."))) : null;
  if (proteinG !== null && (proteinG < 1 || proteinG > 300)) return null;

  return { title, proteinG };
}

function bodyPartIn(text: string) {
  return BODY_PARTS.find((candidate) => candidate.pattern.test(text)) ?? null;
}

export function parseJarvisBodyState(input: string): JarvisBodyStateCapture | null {
  const text = normalized(input);
  const bodyPart = bodyPartIn(text);
  if (!bodyPart) return null;

  const resolved =
    /(?:inte\s+(?:längre\s+)?ont|inte\s+ont\s+längre|känns?\s+(?:bra|bättre|återställd)\s+igen|smärtan\s+.*\s+(?:borta|över)|har\s+läkt)/i.test(
      text,
    );
  if (resolved) {
    return { status: "resolved", bodyPart: bodyPart.bodyPart, bodyPartLabel: bodyPart.label };
  }

  const active =
    /(?:har\s+(?:jag\s+)?ont|jag\s+har\s+ont|gör(?:\s+det)?\s+ont|smärta|känner\s+av|känning|öm(?:t|ma)?)/i.test(text);
  if (!active) return null;

  return { status: "active", bodyPart: bodyPart.bodyPart, bodyPartLabel: bodyPart.label };
}

export function isJarvisSpontaneousWorkoutPrompt(input: string): boolean {
  return /^(?:jag\s+vill\s+köra\s+)?(?:ett\s+)?spontant\s+(?:pass|träningspass)$/i.test(normalized(input));
}

export function jarvisTrainingAdaptation(bodyPart: JarvisBodyPart): JarvisTrainingAdaptation {
  if (bodyPart === "foot" || bodyPart === "calf") {
    return {
      avoid: ["löpning", "hopp", "utfall", "knäböj och andra stående benövningar"],
      alternatives: [
        "liggande golvpress",
        "sittande axelpress",
        "sittande bicepscurl",
        "liggande tricepsextension",
        "dead bug utan fotbelastning",
      ],
    };
  }
  if (bodyPart === "wrist" || bodyPart === "hand" || bodyPart === "elbow") {
    return {
      avoid: ["armhävningar", "planka", "dips och andra övningar som belastar handen/handleden"],
      alternatives: [
        "knäböj utan vikt",
        "höftlyft",
        "utfall utan vikt",
        "dead bug",
        "liggande benlyft",
      ],
    };
  }
  if (bodyPart === "knee" || bodyPart === "hip") {
    return {
      avoid: ["löpning", "hopp", "utfall", "djupa knäböj"],
      alternatives: [
        "liggande golvpress",
        "sittande axelpress",
        "sittande bicepscurl",
        "liggande tricepsextension",
        "sittande sidolyft för axlarna",
      ],
    };
  }
  if (bodyPart === "shoulder") {
    return {
      avoid: ["pressar över huvudet", "dips", "armhävningar om de provocerar smärtan"],
      alternatives: ["knäböj utan vikt", "höftlyft", "utfall utan vikt", "tåhävningar", "dead bug"],
    };
  }
  return {
    avoid: ["övningar som belastar eller provocerar det ömma området"],
    alternatives: [
      "ett lugnt sittande överkroppspass",
      "lätta rörelser som inte ökar smärtan",
      "vila och en ny avstämning senare",
    ],
  };
}

export function jarvisBodyPartLabel(bodyPart: JarvisBodyPart): string {
  return BODY_PARTS.find((candidate) => candidate.bodyPart === bodyPart)?.label ?? bodyPart;
}
