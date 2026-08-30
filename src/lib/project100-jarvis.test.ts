import { describe, expect, it } from "vitest";

import {
  buildJarvisSystemPrompt,
  formatPromptContextSummary,
  type Project100JarvisContext,
} from "./project100-jarvis";

describe("project100-jarvis domain helpers", () => {
  const mockContext: Project100JarvisContext = {
    today: "2026-08-30",
    timeZone: "Europe/Stockholm",
    weightGoalKg: 100,
    startWeightKg: 82.0,
    currentWeightKg: 85.5,
    proteinTargetG: 180,
    upcomingWorkEvents: [
      {
        title: "Kvällspass",
        startsAt: "2026-08-31T14:00:00Z",
        endsAt: "2026-08-31T22:30:00Z",
      },
    ],
    recentSessions: [
      {
        id: "sess-1",
        date: "2026-08-29",
        title: "Helkroppsstyrka",
        activityType: "gym",
        durationSeconds: 3600,
        volumeKg: 12500,
      },
    ],
    recentMeals: [
      {
        id: "meal-1",
        date: "2026-08-30",
        title: "Kyckling och ris",
        proteinG: 55,
        kcal: 750,
      },
    ],
    recentJournal: [
      {
        date: "2026-08-30",
        sleepHours: 8,
        energy: 4,
        mood: 5,
      },
    ],
    pantryBatches: [
      {
        id: "batch-1",
        title: "Köttfärssås",
        portionsRemaining: 4,
        proteinPerPortionG: 45,
      },
    ],
    activeMemories: [
      {
        id: "mem-1",
        kind: "fact",
        category: "equipment",
        content: "Har hantlar upp till 30 kg och skivstång hemma.",
        sourceRef: "Inställningar",
        isActive: true,
        createdAt: "2026-08-01T12:00:00Z",
        updatedAt: "2026-08-01T12:00:00Z",
      },
    ],
  };

  it("formats context summary with real facts without hallucination", () => {
    const summary = formatPromptContextSummary(mockContext);
    expect(summary).toContain("DATUM IDAG: 2026-08-30");
    expect(summary).toContain("Nuvarande vikt 85.5 kg");
    expect(summary).toContain("Kvällspass");
    expect(summary).toContain("Helkroppsstyrka");
    expect(summary).toContain("Köttfärssås (4 port kvar");
    expect(summary).toContain("Har hantlar upp till 30 kg");
  });

  it("builds a strict system prompt instructing zero hallucination and structured proposals", () => {
    const prompt = buildJarvisSystemPrompt(mockContext);
    expect(prompt).toContain("NOLL HALLUCINATION");
    expect(prompt).toContain("JOBBSCHEMAT");
    expect(prompt).toContain("STRUKTURERADE UTKAST");
    expect(prompt).toContain("KÄLLBILAGA");
  });
});
