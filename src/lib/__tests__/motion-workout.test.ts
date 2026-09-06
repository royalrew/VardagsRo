import { describe, expect, it } from "vitest";

import { createSquatTrackerState } from "../motion-squat";
import {
  advanceWorkoutSession,
  buildWorkoutSessionReport,
  createWorkoutSession,
  formatSwedishRepWord,
  getRestDurationForSet,
  getRestSecondsRemaining,
  getWorkoutRepSpeechCue,
  skipWorkoutRest,
  startWorkoutSession,
} from "../motion-workout";

describe("Workout session state machine (Steg 31)", () => {
  it("initializes an idle workout session with default 3x10 config", () => {
    const session = createWorkoutSession();
    expect(session.status).toBe("idle");
    expect(session.config.targetSets).toBe(3);
    expect(session.config.targetRepsPerSet).toBe(10);
    expect(session.config.restDurationSeconds).toBe(45);
    expect(session.currentSetIndex).toBe(0);
    expect(session.completedSets).toHaveLength(0);
  });

  it("starts the workout session and transitions to active-set", () => {
    const session = createWorkoutSession({ targetSets: 3, targetRepsPerSet: 10 });
    const started = startWorkoutSession(session, 10_000);
    expect(started.status).toBe("active-set");
    expect(started.currentSetStartedAtMs).toBe(10_000);
    expect(started.currentSetIndex).toBe(0);
    expect(started.startedAt).toBeDefined();
  });

  it("automatically completes Set 1 when target reps are reached and enters resting", () => {
    let session = startWorkoutSession(createWorkoutSession({ targetSets: 3, targetRepsPerSet: 5, restDurationSeconds: 30 }), 10_000);
    
    // Simulate squat tracker reaching 5 reps
    let squatTracker = createSquatTrackerState(5);
    squatTracker = {
      ...squatTracker,
      reps: 5,
      halfReps: 0,
      fullReps: 5,
      repsHistory: [
        { durationMs: 1200, minimumKneeAngle: 85, classification: "full", romPercent: 120, relativeDepth: 1.1 },
        { durationMs: 1250, minimumKneeAngle: 86, classification: "full", romPercent: 118, relativeDepth: 1.1 },
        { durationMs: 1300, minimumKneeAngle: 84, classification: "full", romPercent: 122, relativeDepth: 1.1 },
        { durationMs: 1220, minimumKneeAngle: 85, classification: "full", romPercent: 120, relativeDepth: 1.1 },
        { durationMs: 1280, minimumKneeAngle: 83, classification: "full", romPercent: 124, relativeDepth: 1.1 },
      ],
    };

    const result = advanceWorkoutSession(session, squatTracker, 25_000);
    session = result.session;

    expect(session.status).toBe("resting");
    expect(session.completedSets).toHaveLength(1);
    expect(session.completedSets[0].setNumber).toBe(1);
    expect(session.completedSets[0].completedReps).toBe(5);
    expect(session.completedSets[0].durationMs).toBe(15_000);
    expect(session.completedSets[0].averageRomPercent).toBe(121);
    expect(result.shouldResetSquatTracker).toBe(true);
    expect(result.cue?.sound).toBe("set-complete");
    expect(result.cue?.text).toContain("Set 1 klart");
  });

  it("counts down rest seconds and transitions to Set 2 when rest expires", () => {
    let session = startWorkoutSession(createWorkoutSession({ targetSets: 3, targetRepsPerSet: 3, restDurationSeconds: 20 }), 10_000);
    const squatTracker = { ...createSquatTrackerState(3), reps: 3, fullReps: 3 };

    // Finish set 1 at 20_000
    const finishSet1 = advanceWorkoutSession(session, squatTracker, 20_000);
    session = finishSet1.session;
    expect(session.status).toBe("resting");

    // During rest at 25_000 (5 seconds into rest of 20 seconds)
    expect(getRestSecondsRemaining(session, 25_000)).toBe(15);

    // Advance during rest before expiry
    const duringRest = advanceWorkoutSession(session, createSquatTrackerState(0), 30_000);
    expect(duringRest.session.status).toBe("resting");

    // Advance when rest expires at 40_000 (20s rest reached)
    const restExpired = advanceWorkoutSession(session, createSquatTrackerState(0), 40_001);
    session = restExpired.session;

    expect(session.status).toBe("active-set");
    expect(session.currentSetIndex).toBe(1);
    expect(restExpired.cue?.sound).toBe("rest-end");
    expect(restExpired.cue?.text).toContain("Vilan är slut");
    expect(restExpired.shouldResetSquatTracker).toBe(true);
  });

  it("allows user to skip rest early", () => {
    let session = startWorkoutSession(createWorkoutSession({ targetSets: 3, targetRepsPerSet: 3, restDurationSeconds: 45 }), 10_000);
    session = advanceWorkoutSession(session, { ...createSquatTrackerState(3), reps: 3 }, 20_000).session;
    expect(session.status).toBe("resting");

    session = skipWorkoutRest(session, 25_000);
    expect(session.status).toBe("active-set");
    expect(session.currentSetIndex).toBe(1);
    expect(session.currentSetStartedAtMs).toBe(25_000);
    expect(session.completedSets[0].restDurationMs).toBe(5_000);
  });

  it("completes the workout after all target sets are done and builds report", () => {
    let session = startWorkoutSession(createWorkoutSession({ targetSets: 2, targetRepsPerSet: 2, restDurationSeconds: 10 }), 10_000);
    
    // Set 1
    session = advanceWorkoutSession(session, { ...createSquatTrackerState(2), reps: 2, fullReps: 2 }, 15_000).session;
    expect(session.status).toBe("resting");

    // Skip rest to set 2
    session = skipWorkoutRest(session, 16_000);
    expect(session.status).toBe("active-set");
    expect(session.currentSetIndex).toBe(1);

    // Set 2
    const finishWorkout = advanceWorkoutSession(session, { ...createSquatTrackerState(2), reps: 2, fullReps: 2 }, 22_000);
    session = finishWorkout.session;

    expect(session.status).toBe("completed");
    expect(session.completedSets).toHaveLength(2);
    expect(finishWorkout.cue?.sound).toBe("workout-complete");
    expect(finishWorkout.cue?.text).toContain("Träningspasset är slutfört");

    // Build report
    const report = buildWorkoutSessionReport(session);
    expect(report.protocol).toBe("workout-step-31");
    expect(report.totalSetsCompleted).toBe(2);
    expect(report.totalRepsCompleted).toBe(4);
    expect(report.workoutPassed).toBe(true);
  });

  describe("Steg 32: Viloklocka & anpassad vilotid", () => {
    it("supports variable rest durations per set via array config", () => {
      const config = { targetSets: 3, targetRepsPerSet: 10, restDurationSeconds: [30, 45, 60] as const };
      expect(getRestDurationForSet(config, 0)).toBe(30);
      expect(getRestDurationForSet(config, 1)).toBe(45);
      expect(getRestDurationForSet(config, 2)).toBe(60);
      expect(getRestDurationForSet(config, 5)).toBe(60); // clamps to last
    });

    it("triggers a 5-second preparation warning cue before rest ends", () => {
      let session = startWorkoutSession(createWorkoutSession({ targetSets: 3, targetRepsPerSet: 2, restDurationSeconds: 20 }), 10_000);
      // Finish Set 1 at 15_000 -> Rest ends at 35_000
      session = advanceWorkoutSession(session, { ...createSquatTrackerState(2), reps: 2 }, 15_000).session;
      expect(session.status).toBe("resting");
      expect(session.warnedRestCountdown).toBe(false);

      // At 25_000 (10 seconds left): no warning yet
      const at10s = advanceWorkoutSession(session, createSquatTrackerState(0), 25_000);
      expect(at10s.session.warnedRestCountdown).toBe(false);
      expect(at10s.cue).toBeUndefined();

      // At 30_000 (5 seconds left): trigger warning cue
      const at5s = advanceWorkoutSession(session, createSquatTrackerState(0), 30_000);
      expect(at5s.session.warnedRestCountdown).toBe(true);
      expect(at5s.cue?.sound).toBe("rest-warning");
      expect(at5s.cue?.text).toContain("Fem sekunder kvar");

      // At 32_000 (3 seconds left): does not spam warning cue again
      const at3s = advanceWorkoutSession(at5s.session, createSquatTrackerState(0), 32_000);
      expect(at3s.cue).toBeUndefined();
    });

    it("records actual rest duration on the completed set when advancing naturally", () => {
      let session = startWorkoutSession(createWorkoutSession({ targetSets: 2, targetRepsPerSet: 2, restDurationSeconds: 15 }), 10_000);
      // Finish Set 1 at 15_000 -> Rest starts
      session = advanceWorkoutSession(session, { ...createSquatTrackerState(2), reps: 2 }, 15_000).session;
      expect(session.status).toBe("resting");

      // Rest expires at 30_000 (15 seconds of rest)
      const afterRest = advanceWorkoutSession(session, createSquatTrackerState(0), 30_000);
      expect(afterRest.session.status).toBe("active-set");
      expect(afterRest.session.completedSets[0].restDurationMs).toBe(15_000);
    });
  });

  describe("Workout spoken rep counting and agile coaching prompts (Steg 33)", () => {
    it("formats Swedish cardinal numbers accurately up to 30", () => {
      expect(formatSwedishRepWord(1)).toBe("Ett");
      expect(formatSwedishRepWord(2)).toBe("Två");
      expect(formatSwedishRepWord(3)).toBe("Tre");
      expect(formatSwedishRepWord(10)).toBe("Tio");
      expect(formatSwedishRepWord(15)).toBe("Femton");
      expect(formatSwedishRepWord(20)).toBe("Tjugo");
      expect(formatSwedishRepWord(30)).toBe("Trettio");
      expect(formatSwedishRepWord(35)).toBe("35");
    });

    it("generates crisp regular count for normal rep", () => {
      const cue = getWorkoutRepSpeechCue(1, 10, {
        durationMs: 1200,
        minimumKneeAngle: 90,
        classification: "full",
        romPercent: 100,
        relativeDepth: 1.0,
      });
      expect(cue.text).toBe("Ett");
      expect(cue.isMilestone).toBe(false);
    });

    it("encourages deeper motion on half repetition", () => {
      const cue = getWorkoutRepSpeechCue(4, 10, {
        durationMs: 1200,
        minimumKneeAngle: 140,
        classification: "half",
        romPercent: 50,
        relativeDepth: 0.3,
      });
      expect(cue.text).toBe("Fyra. Lite djupare nästa.");
      expect(cue.displayCue).toContain("Lite djupare nästa!");
      expect(cue.isMilestone).toBe(false);
    });

    it("acknowledges halfway milestone at rep 5 of 10", () => {
      const cue = getWorkoutRepSpeechCue(5, 10, {
        durationMs: 1200,
        minimumKneeAngle: 85,
        classification: "full",
        romPercent: 105,
        relativeDepth: 1.0,
      });
      expect(cue.text).toBe("Fem. Halvvägs!");
      expect(cue.isMilestone).toBe(false);
    });

    it("alerts two reps remaining at rep 8 of 10", () => {
      const cue = getWorkoutRepSpeechCue(8, 10, {
        durationMs: 1200,
        minimumKneeAngle: 85,
        classification: "full",
        romPercent: 105,
        relativeDepth: 1.0,
      });
      expect(cue.text).toBe("Åtta. Två kvar!");
    });

    it("gives final rep alert at rep 9 of 10", () => {
      const cue = getWorkoutRepSpeechCue(9, 10, {
        durationMs: 1200,
        minimumKneeAngle: 85,
        classification: "full",
        romPercent: 105,
        relativeDepth: 1.0,
      });
      expect(cue.text).toBe("Nio. Sista nu!");
      expect(cue.isMilestone).toBe(true);
    });

    it("gives celebratory count on target completion", () => {
      const cue = getWorkoutRepSpeechCue(10, 10, {
        durationMs: 1200,
        minimumKneeAngle: 85,
        classification: "full",
        romPercent: 110,
        relativeDepth: 1.1,
      });
      expect(cue.text).toBe("Tio!");
      expect(cue.isMilestone).toBe(true);
    });

    it("provides early praise for excellent depth at rep 2", () => {
      const cue = getWorkoutRepSpeechCue(2, 10, {
        durationMs: 1200,
        minimumKneeAngle: 75,
        classification: "full",
        romPercent: 125,
        relativeDepth: 1.2,
      });
      expect(cue.text).toBe("Två. Fint djup!");
    });
  });

  describe("Coaching discipline & feedback rules (Steg 34 & Steg 35)", () => {
    it("NEVER repeats 'Fint djup' back-to-back across consecutive good reps", () => {
      // Rep 2 has great depth -> gets praise
      const rep2 = getWorkoutRepSpeechCue(2, 10, {
        durationMs: 1200,
        minimumKneeAngle: 75,
        classification: "full",
        romPercent: 125,
        relativeDepth: 1.2,
      });
      expect(rep2.text).toBe("Två. Fint djup!");
      expect(rep2.nextDiscipline.praisedDepthInSet).toBe(true);

      // Rep 3 ALSO has great depth -> coachen HÅLLER TYST och säger endast "Tre"!
      const rep3 = getWorkoutRepSpeechCue(
        3,
        10,
        {
          durationMs: 1200,
          minimumKneeAngle: 74,
          classification: "full",
          romPercent: 128,
          relativeDepth: 1.22,
        },
        rep2.nextDiscipline,
      );
      expect(rep3.text).toBe("Tre");
      expect(rep3.text).not.toContain("Fint djup");
    });

    it("strictly enforces 3-rep cooldown between technical corrections", () => {
      // Rep 1: Half rep -> gets corrected
      const rep1 = getWorkoutRepSpeechCue(1, 10, {
        durationMs: 1000,
        minimumKneeAngle: 135,
        classification: "half",
        romPercent: 55,
        relativeDepth: 0.4,
      });
      expect(rep1.text).toBe("Ett. Lite djupare nästa.");

      // Rep 2: Another half rep, but within cooldown (2 - 1 = 1 < 3) -> only counts "Två"
      const rep2 = getWorkoutRepSpeechCue(
        2,
        10,
        {
          durationMs: 1000,
          minimumKneeAngle: 135,
          classification: "half",
          romPercent: 55,
          relativeDepth: 0.4,
        },
        rep1.nextDiscipline,
      );
      expect(rep2.text).toBe("Två");
      expect(rep2.text).not.toContain("Lite djupare");

      // Rep 3: Another half rep, still within cooldown (3 - 1 = 2 < 3) -> only counts "Tre"
      const rep3 = getWorkoutRepSpeechCue(
        3,
        10,
        {
          durationMs: 1000,
          minimumKneeAngle: 135,
          classification: "half",
          romPercent: 55,
          relativeDepth: 0.4,
        },
        rep2.nextDiscipline,
      );
      expect(rep3.text).toBe("Tre");

      // Rep 4: Cooldown has now passed (4 - 1 = 3 >= 3) -> can give advice again
      const rep4 = getWorkoutRepSpeechCue(
        4,
        10,
        {
          durationMs: 1000,
          minimumKneeAngle: 135,
          classification: "half",
          romPercent: 55,
          relativeDepth: 0.4,
        },
        rep3.nextDiscipline,
      );
      expect(rep4.text).toBe("Fyra. Lite djupare nästa.");
    });

    it("triggers tempo feedback on uncontrolled descent (<250ms)", () => {
      const rep = getWorkoutRepSpeechCue(1, 10, {
        durationMs: 700,
        minimumKneeAngle: 85,
        classification: "full",
        romPercent: 105,
        relativeDepth: 1.0,
        tempo: {
          eccentricMs: 150, // fast dive
          bottomMs: 250,
          concentricMs: 300,
          notation: "0-0-0",
        },
      });
      expect(rep.text).toBe("Ett. Lugnare på nervägen.");
    });

    it("triggers symmetry feedback on marked lateral shift (kneeAngleDiff >= 25°)", () => {
      const rep = getWorkoutRepSpeechCue(1, 10, {
        durationMs: 1200,
        minimumKneeAngle: 85,
        classification: "full",
        romPercent: 105,
        relativeDepth: 1.0,
        symmetry: {
          kneeAngleDiff: 28,
          hipHeightDiff: 0.04,
          lateralShift: 0,
          symmetryScore: 50,
          dominantSide: "left",
          observation: "Vänster knä böjs något djupare än höger i vändningen.",
        },
      });
      expect(rep.text).toBe("Ett. Jämnt tryck på båda benen.");
    });
  });
});
