import { describe, expect, it } from "vitest";

import {
  calculatePace,
  evaluateProject100Benchmarks,
  formatDurationTime,
  parseDistanceToMeters,
  parseDurationToSeconds,
} from "./project100-benchmarks";
import type { Project100TrainingSession } from "./project100-training";

describe("project100-benchmarks", () => {
  describe("Pace calculation & time parsing", () => {
    it("calculates 5:55 min/km for 5.02 km in 29:42", () => {
      const distanceMeters = 5020;
      const durationSeconds = 29 * 60 + 42; // 1782 seconds
      const { paceSecondsPerKm, formattedPace } = calculatePace(distanceMeters, durationSeconds);

      expect(formattedPace).toBe("5:55 min/km");
      expect(Math.round(paceSecondsPerKm!)).toBe(355);
    });

    it("parses Swedish comma distances and units", () => {
      expect(parseDistanceToMeters("5,02")).toBe(5020);
      expect(parseDistanceToMeters("5.02 km")).toBe(5020);
      expect(parseDistanceToMeters("5000 m")).toBe(5000);
      expect(parseDistanceToMeters("10,5")).toBe(10500);
    });

    it("parses time strings in mm:ss, hh:mm:ss, and minutes", () => {
      expect(parseDurationToSeconds("29:42")).toBe(1782);
      expect(parseDurationToSeconds("1:15:00")).toBe(4500);
      expect(parseDurationToSeconds("30")).toBe(1800);
      expect(parseDurationToSeconds("45 min")).toBe(2700);
      expect(parseDurationToSeconds("90 sek")).toBe(90);
    });

    it("formats duration times correctly", () => {
      expect(formatDurationTime(1782)).toBe("29:42");
      expect(formatDurationTime(4500)).toBe("1:15:00");
      expect(formatDurationTime(90)).toBe("1:30");
      expect(formatDurationTime(45)).toBe("0:45");
    });
  });

  describe("Strength benchmarks", () => {
    it("evaluates 30 push-ups as Stark with next requirement 40", () => {
      const sessions: Project100TrainingSession[] = [
        {
          id: "s-1",
          sourceTemplateId: null,
          title: "Överkropp",
          activityType: "strength_home",
          status: "completed",
          sessionDate: "2026-08-25",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 2400,
          location: null,
          effort: 8,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-25T10:00:00Z",
          exercises: [
            {
              id: "e-1",
              exerciseId: "ex-pushups",
              name: "Armhävningar",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-1",
                  position: 0,
                  target: null,
                  actual: { reps: 30, weightKg: 0, durationSeconds: null, distanceMeters: null, rpe: 8 },
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const benchmarks = evaluateProject100Benchmarks(sessions);
      const pushups = benchmarks.find((b) => b.id === "pushups");

      expect(pushups).toBeDefined();
      expect(pushups?.bestValue).toBe(30);
      expect(pushups?.currentLevel).toBe("Stark");
      expect(pushups?.nextLevel).toBe("Mycket stark");
      expect(pushups?.nextRequirement).toBe(40);
      expect(pushups?.remainingToNext).toBe(10);
    });

    it("evaluates 4 pull-ups as Grundtränad with next requirement 5", () => {
      const sessions: Project100TrainingSession[] = [
        {
          id: "s-2",
          sourceTemplateId: null,
          title: "Helkropp",
          activityType: "strength_home",
          status: "completed",
          sessionDate: "2026-08-26",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 2400,
          location: null,
          effort: 7,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-26T10:00:00Z",
          exercises: [
            {
              id: "e-2",
              exerciseId: "ex-pullups",
              name: "Pull-ups",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-2",
                  position: 0,
                  target: null,
                  actual: { reps: 4, weightKg: 0, durationSeconds: null, distanceMeters: null, rpe: 9 },
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const benchmarks = evaluateProject100Benchmarks(sessions);
      const pullups = benchmarks.find((b) => b.id === "pullups");

      expect(pullups).toBeDefined();
      expect(pullups?.bestValue).toBe(4);
      expect(pullups?.currentLevel).toBe("Grundtränad");
      expect(pullups?.nextLevel).toBe("Vältränad");
      expect(pullups?.nextRequirement).toBe(5);
      expect(pullups?.remainingToNext).toBe(1);
    });

    it("evaluates 120s plank as Stark with next requirement 180s", () => {
      const sessions: Project100TrainingSession[] = [
        {
          id: "s-3",
          sourceTemplateId: null,
          title: "Bål",
          activityType: "strength_home",
          status: "completed",
          sessionDate: "2026-08-27",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 1800,
          location: null,
          effort: 8,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-27T10:00:00Z",
          exercises: [
            {
              id: "e-3",
              exerciseId: "ex-plank",
              name: "Plankan",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-3",
                  position: 0,
                  target: null,
                  actual: { reps: null, weightKg: null, durationSeconds: 120, distanceMeters: null, rpe: 8 },
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const benchmarks = evaluateProject100Benchmarks(sessions);
      const plank = benchmarks.find((b) => b.id === "plank");

      expect(plank).toBeDefined();
      expect(plank?.bestValue).toBe(120);
      expect(plank?.currentLevel).toBe("Stark");
      expect(plank?.nextLevel).toBe("Mycket stark");
      expect(plank?.nextRequirement).toBe(180);
      expect(plank?.formattedBest).toBe("2:00");
    });
  });

  describe("Running 5k & 10k benchmarks & tolerances", () => {
    it("considers 29:59 as Vältränad (Sub-30 achieved)", () => {
      const sessions: Project100TrainingSession[] = [
        {
          id: "s-run-1",
          sourceTemplateId: null,
          title: "5k test",
          activityType: "running",
          status: "completed",
          sessionDate: "2026-08-28",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 29 * 60 + 59, // 1799s
          location: null,
          effort: 8,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-28T10:00:00Z",
          exercises: [
            {
              id: "e-run-1",
              exerciseId: "ex-run",
              name: "Löpning",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-run-1",
                  position: 0,
                  target: null,
                  actual: { reps: null, weightKg: null, durationSeconds: 1799, distanceMeters: 5000, rpe: 8 },
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const benchmarks = evaluateProject100Benchmarks(sessions);
      const b5k = benchmarks.find((b) => b.id === "running_5k");

      expect(b5k).toBeDefined();
      expect(b5k?.bestValue).toBe(1799);
      expect(b5k?.currentLevel).toBe("Vältränad");
      expect(b5k?.nextLevel).toBe("Stark kondition");
      expect(b5k?.nextRequirement).toBe(25 * 60);
      expect(b5k?.remainingToNext).toBe(1799 - 25 * 60); // 299s
    });

    it("considers exactly 30:00 as Grundtränad (strictly under 30:00 needed for Vältränad)", () => {
      const sessions: Project100TrainingSession[] = [
        {
          id: "s-run-2",
          sourceTemplateId: null,
          title: "5k jogg",
          activityType: "running",
          status: "completed",
          sessionDate: "2026-08-29",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 30 * 60, // 1800s
          location: null,
          effort: 7,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-29T10:00:00Z",
          exercises: [
            {
              id: "e-run-2",
              exerciseId: "ex-run",
              name: "Löpning",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-run-2",
                  position: 0,
                  target: null,
                  actual: { reps: null, weightKg: null, durationSeconds: 1800, distanceMeters: 5000, rpe: 7 },
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const benchmarks = evaluateProject100Benchmarks(sessions);
      const b5k = benchmarks.find((b) => b.id === "running_5k");

      expect(b5k).toBeDefined();
      expect(b5k?.bestValue).toBe(1800);
      expect(b5k?.currentLevel).toBe("Grundtränad");
      expect(b5k?.nextLevel).toBe("Vältränad");
      expect(b5k?.nextRequirement).toBe(30 * 60);
    });

    it("allows 5.02 km (4900m-5100m) for 5k PB, but rejects 8 km run", () => {
      const sessions: Project100TrainingSession[] = [
        {
          id: "s-run-8k",
          sourceTemplateId: null,
          title: "Långpass 8k",
          activityType: "running",
          status: "completed",
          sessionDate: "2026-08-20",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 44 * 60,
          location: null,
          effort: 7,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-20T10:00:00Z",
          exercises: [
            {
              id: "e-8k",
              exerciseId: "ex-run",
              name: "Löpning",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-8k",
                  position: 0,
                  target: null,
                  actual: { reps: null, weightKg: null, durationSeconds: 44 * 60, distanceMeters: 8000, rpe: 7 },
                  completed: true,
                },
              ],
            },
          ],
        },
        {
          id: "s-run-5k-actual",
          sourceTemplateId: null,
          title: "Runkeeper 5k",
          activityType: "running",
          status: "completed",
          sessionDate: "2026-08-25",
          plannedStartAt: null,
          plannedEndAt: null,
          startedAt: null,
          endedAt: null,
          durationSeconds: 27 * 60 + 48, // 1668s
          location: null,
          effort: 8,
          bodyBefore: null,
          bodyAfter: null,
          notes: null,
          createdAt: "2026-08-25T10:00:00Z",
          exercises: [
            {
              id: "e-5k",
              exerciseId: "ex-run",
              name: "Löpning",
              position: 0,
              notes: null,
              sets: [
                {
                  id: "set-5k",
                  position: 0,
                  target: null,
                  actual: { reps: null, weightKg: null, durationSeconds: 1668, distanceMeters: 5020, rpe: 8 },
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const benchmarks = evaluateProject100Benchmarks(sessions);
      const b5k = benchmarks.find((b) => b.id === "running_5k");

      expect(b5k).toBeDefined();
      expect(b5k?.bestValue).toBe(1668); // From the 5.02km run, not extrapolated from the 8k
      expect(b5k?.formattedBest).toBe("27:48");
      expect(b5k?.currentLevel).toBe("Vältränad");
    });
  });
});
