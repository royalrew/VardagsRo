import { describe, expect, it } from "vitest";

import {
  buildJarvisMotionPayload,
  createDefaultCoachMemory,
  DEFAULT_COACH_SETTINGS,
  formatCoachRepCue,
  formatCoachSetCompleteCue,
  generateGroundedCoachAdvice,
  generateWeeklyCoachReflection,
  getRestReflectionPrompt,
  proposeNextWorkoutPlan,
  updateCoachMemoryWithSession,
  validateCoachSafetyPrompt,
  validateGroundedCoachClaims,
  type CoachSettings,
  type MotionCoachMemory,
} from "../motion-coach";
import {
  createWorkoutSession,
  type WorkoutSessionReport,
  type WorkoutSetSummary,
} from "../motion-workout";

describe("Motion Coach Personas & Tone (Steg 41)", () => {
  const baseRep = {
    durationMs: 1200,
    minimumKneeAngle: 82,
    classification: "full" as const,
    romPercent: 120,
    relativeDepth: 1.15,
    tempo: { eccentricMs: 700, bottomMs: 200, concentricMs: 300, notation: "1-0-0" },
  };

  it("formats calm persona with smooth, breathing-focused phrasing", () => {
    const settings: CoachSettings = { tone: "calm", verbosity: "normal", quietDuringSet: false };
    const cue = formatCoachRepCue(2, 10, settings, baseRep);
    expect(cue.text).toContain("Två");
    expect(cue.text).toMatch(/lugn|kontroll|mjukt|fint djup/i);
  });

  it("formats motivational persona with energetic, cheering phrasing", () => {
    const settings: CoachSettings = { tone: "motivational", verbosity: "normal", quietDuringSet: false };
    const cue = formatCoachRepCue(2, 10, settings, baseRep);
    expect(cue.text).toContain("Två");
    expect(cue.text).toMatch(/grymt|starkt|bra|fortsätt/i);
  });

  it("formats analytical persona with exact metrics and angles", () => {
    const settings: CoachSettings = { tone: "analytical", verbosity: "normal", quietDuringSet: false };
    const cue = formatCoachRepCue(2, 10, settings, baseRep);
    expect(cue.text).toContain("Två");
    expect(cue.text).toMatch(/rom|grader|procent|vinkel|kontrollerad/i);
  });

  it("preserves rep count consistency across all tones", () => {
    const tones: ("calm" | "motivational" | "analytical")[] = ["calm", "motivational", "analytical"];
    for (const tone of tones) {
      const cue = formatCoachRepCue(5, 10, { tone, verbosity: "normal", quietDuringSet: false });
      expect(cue.text.startsWith("Fem")).toBe(true);
    }
  });
});
describe("Coach Verbosity & Silence as a Feature (Steg 46)", () => {
  it("never utters technical advice when quietDuringSet is enabled", () => {
    const settings: CoachSettings = { tone: "motivational", verbosity: "talkative", quietDuringSet: true };
    const halfRep = {
      durationMs: 1000,
      minimumKneeAngle: 125,
      classification: "half" as const,
      romPercent: 65,
      relativeDepth: 0.5,
    };
    const cue = formatCoachRepCue(1, 10, settings, halfRep);
    // Should ONLY utter the number, no technical correction during active lifting
    expect(cue.text).toBe("Ett");
  });

  it("restricts cues to clean counting when verbosity is minimal", () => {
    const settings: CoachSettings = { tone: "calm", verbosity: "minimal", quietDuringSet: false };
    const cue = formatCoachRepCue(5, 10, settings);
    expect(cue.text).toBe("Fem");
  });

  it("formats set complete cues across all 3 personas", () => {
    const calmCue = formatCoachSetCompleteCue(1, 10, 45, "Starkt set.", { tone: "calm", verbosity: "normal", quietDuringSet: false });
    expect(calmCue).toContain("Set 1 klart");
    expect(calmCue).toContain("Andas lugnt");

    const hypeCue = formatCoachSetCompleteCue(1, 10, 45, "Starkt set.", { tone: "motivational", verbosity: "normal", quietDuringSet: false });
    expect(hypeCue).toContain("Grymt jobbat");

    const analCue = formatCoachSetCompleteCue(1, 10, 45, "Starkt set.", { tone: "analytical", verbosity: "normal", quietDuringSet: false });
    expect(analCue).toContain("Set 1 registrerat");
  });
});

describe("Medical Safety Policy Guard (Steg 47)", () => {
  it("passes safe training advice without flags", () => {
    const check = validateCoachSafetyPrompt("Fokusera på jämnt tryck på båda fötterna och andas ut på uppvägen.");
    expect(check.safe).toBe(true);
    expect(check.flagReason).toBeUndefined();
  });

  it("strictly blocks diagnostic medical claims and replaces with safety disclaimer", () => {
    const check = validateCoachSafetyPrompt("Din knävinkel tyder på en meniskskada eller begynnande artros.");
    expect(check.safe).toBe(false);
    expect(check.flagReason).toContain("medical-diagnosis");
    expect(check.sanitizedText).toContain("avbryt övningen");
    expect(check.sanitizedText).toContain("sjukvården");
  });

  it("redirects pain complaints to safety disclaimer", () => {
    const check = validateCoachSafetyPrompt("Jag känner huggande smärta i ryggen när jag går djupt.");
    expect(check.safe).toBe(false);
    expect(check.flagReason).toContain("pain-reported");
    expect(check.sanitizedText).toContain("avbryt övningen");
  });
});

describe("Structured LLM / Jarvis Payload (Steg 43)", () => {
  it("builds privacy-clean payload containing only structured metrics without raw video", () => {
    const session = createWorkoutSession({ targetSets: 3, targetRepsPerSet: 10 });
    const payload = buildJarvisMotionPayload(session, DEFAULT_COACH_SETTINGS);

    expect(payload.version).toBe(1);
    expect(payload.kind).toBe("jarvis-motion-payload");
    expect(payload.metrics.targetSets).toBe(3);
    expect(payload.metrics.targetRepsPerSet).toBe(10);
    expect(payload.coachSettings.tone).toBe("calm");
    expect((payload as unknown as Record<string, unknown>).video).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).landmarks).toBeUndefined();
  });
});

describe("Rest Reflection Prompt (Steg 42)", () => {
  it("returns null if rest reflection is disabled in settings", () => {
    const settings: CoachSettings = { tone: "calm", verbosity: "normal", quietDuringSet: false, enableRestReflection: false };
    expect(getRestReflectionPrompt(1, 30, settings)).toBeNull();
  });

  it("returns null if rest time remaining is less than 10 seconds", () => {
    const settings: CoachSettings = { tone: "calm", verbosity: "normal", quietDuringSet: false, enableRestReflection: true };
    expect(getRestReflectionPrompt(1, 8, settings)).toBeNull();
  });

  it("returns tone-specific reflection question when enabled", () => {
    const calm = getRestReflectionPrompt(1, 30, { tone: "calm", verbosity: "normal", quietDuringSet: false, enableRestReflection: true });
    expect(calm).toMatch(/kändes/i);

    const hype = getRestReflectionPrompt(1, 30, { tone: "motivational", verbosity: "normal", quietDuringSet: false, enableRestReflection: true });
    expect(hype).toMatch(/energi|kändes/i);

    const analytical = getRestReflectionPrompt(1, 30, { tone: "analytical", verbosity: "normal", quietDuringSet: false, enableRestReflection: true });
    expect(analytical).toMatch(/ansträngning|kontakt/i);
  });
});

describe("Coach Memory Model & Personal Records (Steg 45)", () => {
  it("creates clean initial coach memory", () => {
    const memory = createDefaultCoachMemory();
    expect(memory.version).toBe(1);
    expect(memory.personalRecords.maxRepsInSet).toBe(0);
    expect(memory.personalRecords.maxSessionVolume).toBe(0);
    expect(memory.recentSessions).toHaveLength(0);
  });

  it("detects and records new PRs when session surpasses previous records", () => {
    const initialMemory = createDefaultCoachMemory();
    const mockReport: WorkoutSessionReport = {
      version: 2,
      kind: "motion-workout-report",
      protocol: "workout-step-31",
      createdAt: "2026-09-07T10:00:00Z",
      startedAt: "2026-09-07T09:45:00Z",
      completedAt: "2026-09-07T10:00:00Z",
      config: { targetSets: 3, targetRepsPerSet: 10, restDurationSeconds: 45 },
      totalSetsCompleted: 3,
      totalRepsCompleted: 30,
      totalVolumeReps: 30,
      averageRomPercent: 110,
      averageSymmetryScore: 94,
      workoutPassed: true,
      sets: [
        {
          setNumber: 1,
          targetReps: 10,
          completedReps: 10,
          halfReps: 0,
          fullReps: 10,
          durationMs: 25000,
          averageRomPercent: 112,
          primaryObservation: "Gedigen teknik.",
          startedAtMs: 1000,
          completedAtMs: 26000,
          repsList: [],
        },
        {
          setNumber: 2,
          targetReps: 10,
          completedReps: 10,
          halfReps: 0,
          fullReps: 10,
          durationMs: 25000,
          averageRomPercent: 110,
          primaryObservation: "Gedigen teknik.",
          startedAtMs: 70000,
          completedAtMs: 95000,
          repsList: [],
        },
        {
          setNumber: 3,
          targetReps: 10,
          completedReps: 10,
          halfReps: 0,
          fullReps: 10,
          durationMs: 26000,
          averageRomPercent: 108,
          primaryObservation: "Gedigen teknik.",
          startedAtMs: 140000,
          completedAtMs: 166000,
          repsList: [],
        },
      ],
    };

    const { updatedMemory, newPersonalRecords } = updateCoachMemoryWithSession(initialMemory, mockReport);

    expect(updatedMemory.personalRecords.maxRepsInSet).toBe(10);
    expect(updatedMemory.personalRecords.maxSessionVolume).toBe(30);
    expect(updatedMemory.personalRecords.bestAverageRomPercent).toBe(110);
    expect(updatedMemory.personalRecords.bestSymmetryScore).toBe(94);
    expect(updatedMemory.recentSessions).toHaveLength(1);
    expect(newPersonalRecords.length).toBeGreaterThan(0);
    expect(newPersonalRecords.some(pr => pr.includes("reps i ett set"))).toBe(true);
  });
});

describe("Grounding & Anti-Hallucination Engine (Steg 44)", () => {
  const goodSet: WorkoutSetSummary = {
    setNumber: 1,
    targetReps: 10,
    completedReps: 10,
    halfReps: 0,
    fullReps: 10,
    durationMs: 22000,
    averageRomPercent: 115,
    averageTempoNotation: "2-0-1",
    averageSymmetryScore: 95,
    primaryObservation: "Godkänt och jämnt djup.",
    startedAtMs: 0,
    completedAtMs: 22000,
    repsList: [],
  };

  const shallowSet: WorkoutSetSummary = {
    setNumber: 2,
    targetReps: 10,
    completedReps: 8,
    halfReps: 5,
    fullReps: 3,
    durationMs: 16000,
    averageRomPercent: 68,
    averageTempoNotation: "0-0-1",
    averageSymmetryScore: 74,
    primaryObservation: "Bristande djup i majoriteten av repetitionerna.",
    startedAtMs: 50000,
    completedAtMs: 66000,
    repsList: [],
  };

  it("generates grounded advice citing actual numbers from current set", () => {
    const grounded = generateGroundedCoachAdvice(goodSet);
    expect(grounded.isHallucinationFree).toBe(true);
    expect(grounded.advice).toContain("10");
    expect(grounded.groundedInMetrics).toContain("rom: 115%");
  });

  it("never claims good depth if set ROM was shallow", () => {
    const grounded = generateGroundedCoachAdvice(shallowSet);
    expect(grounded.advice).toMatch(/djupare|öka djupet|rom/i);
    expect(grounded.advice).not.toMatch(/perfekt djup|fullt djup|utmärkt djup/i);
  });

  it("catches and flags contradictory claims in test data", () => {
    // Contradiction 1: Claiming excellent depth when ROM was 68%
    const falseDepthCheck = validateGroundedCoachClaims("Fantastiskt och utmärkt djup på alla repetitioner!", shallowSet);
    expect(falseDepthCheck.isValid).toBe(false);
    expect(falseDepthCheck.contradictions.length).toBeGreaterThan(0);
    expect(falseDepthCheck.contradictions[0]).toContain("ROM");

    // Contradiction 2: Claiming 12 reps when completed was 8
    const falseRepCheck = validateGroundedCoachClaims("Du klarade 12 repetitioner med lätthet!", shallowSet);
    expect(falseRepCheck.isValid).toBe(false);
    expect(falseRepCheck.contradictions.some(c => c.toLowerCase().includes("repantal"))).toBe(true);

    // Truthful check passes
    const truthfulCheck = validateGroundedCoachClaims("Du gjorde 8 repetitioner med 68% genomsnittligt djup.", shallowSet);
    expect(truthfulCheck.isValid).toBe(true);
    expect(truthfulCheck.contradictions).toHaveLength(0);
  });
});

describe("Workout Planning & Progressive Overload (Steg 48)", () => {
  it("proposes baseline 3x10 workout when memory has no previous sessions", () => {
    const memory = createDefaultCoachMemory();
    const plan = proposeNextWorkoutPlan(memory, "hypertrophy");
    expect(plan.targetSets).toBe(3);
    expect(plan.targetRepsPerSet).toBe(10);
    expect(plan.restDurationSeconds).toBe(45);
    expect(plan.focusCue).toContain("teknik");
  });

  it("increases reps cautiously (+1) when user had clean sets and easy RPE", () => {
    const memory = createDefaultCoachMemory();
    const report: WorkoutSessionReport = {
      version: 2,
      kind: "motion-workout-report",
      protocol: "workout-step-31",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      config: { targetSets: 3, targetRepsPerSet: 10, restDurationSeconds: 45 },
      totalSetsCompleted: 3,
      totalRepsCompleted: 30,
      totalVolumeReps: 30,
      averageRomPercent: 112,
      workoutPassed: true,
      sets: [
        {
          setNumber: 1, targetReps: 10, completedReps: 10, halfReps: 0, fullReps: 10,
          durationMs: 20000, averageRomPercent: 112, primaryObservation: "Starkt set.",
          startedAtMs: 0, completedAtMs: 20000, repsList: [], rpe: "easy",
        },
      ],
    };
    const { updatedMemory } = updateCoachMemoryWithSession(memory, report);
    const plan = proposeNextWorkoutPlan(updatedMemory, "hypertrophy");

    expect(plan.targetRepsPerSet).toBe(11);
    expect(plan.rationale).toContain("framsteg");
  });

  it("holds reps and prioritizes form if dive tendency is detected", () => {
    const memory = createDefaultCoachMemory();
    const memoryWithDive: MotionCoachMemory = {
      ...memory,
      patterns: {
        diveTendencyDetected: true,
        asymmetryDetected: false,
      },
    };
    const plan = proposeNextWorkoutPlan(memoryWithDive, "hypertrophy");
    expect(plan.targetRepsPerSet).toBeLessThanOrEqual(10);
    expect(plan.focusCue.toLowerCase()).toMatch(/kontroll|tempo|bromsa/i);
  });
});

describe("Weekly Coach Reflection (Steg 49)", () => {
  it("generates grounded weekly reflection based strictly on logged sessions", () => {
    const memory = createDefaultCoachMemory();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const mockMemory: MotionCoachMemory = {
      ...memory,
      recentSessions: [
        {
          sessionId: "s1",
          date: yesterday,
          totalSets: 3,
          totalReps: 33,
          averageRomPercent: 105,
          dominantObservation: "Starkt pass.",
        },
        {
          sessionId: "s2",
          date: threeDaysAgo,
          totalSets: 3,
          totalReps: 30,
          averageRomPercent: 102,
          dominantObservation: "Starkt pass.",
        },
      ],
    };

    const reflection = generateWeeklyCoachReflection(mockMemory, 7);
    expect(reflection.totalWorkouts).toBe(2);
    expect(reflection.totalVolumeReps).toBe(63);
    expect(reflection.averageRomPercent).toBe(104);
    expect(reflection.trend).toBe("improving");
    expect(reflection.isGrounded).toBe(true);
    expect(reflection.primaryProgress).toContain("63");
  });
});
