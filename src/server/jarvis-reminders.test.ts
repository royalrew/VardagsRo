import { describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";
import {
  createContextualReminder,
  parseSwedishReminder,
} from "@/server/jarvis-reminders";

const dependencies = vi.hoisted(() => ({
  loadDashboard: vi.fn(async () => ({
    events: [
      {
        id: "work-event-friday",
        title: "Arbetspass Dag",
        startsAt: "2026-09-04T07:00:00.000Z",
        endsAt: "2026-09-04T16:00:00.000Z",
        allDay: false,
        category: "work" as const,
        personId: "person-nora",
      },
    ],
    people: [{ id: "person-nora", name: "Jimmy", aliases: ["Pappa"] }],
    tasks: [],
    documents: [],
    folders: [],
  })),
  saveManualTask: vi.fn(async (_actor, input) => ({
    id: "task-rem-1",
    title: input.title,
    dueAt: input.dueAt,
    kind: input.kind,
    notes: input.notes,
  })),
}));

vi.mock("@/server/database", () => ({
  loadDashboard: dependencies.loadDashboard,
  saveManualTask: dependencies.saveManualTask,
}));

describe("Jarvis Contextual Reminder Engine", () => {
  const referenceMonday = new Date("2026-08-31T10:00:00Z"); // Måndag 31 augusti 2026

  describe("parseSwedishReminder", () => {
    it("parses 'påminn mig att jag skall storhandla på fredag efter jobbet'", () => {
      const parsed = parseSwedishReminder(
        "Påminn mig att jag skall storhandla på fredag efter jobbet",
        referenceMonday,
      );

      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("Storhandla");
      expect(parsed?.targetDate).toBe("2026-09-04"); // Kommande fredag
      expect(parsed?.contextAnchor).toBe("after_work");
    });

    it("parses explicit time: 'lägg in en påminnelse om att ringa tandläkaren imorgon kl 08:30'", () => {
      const parsed = parseSwedishReminder(
        "Lägg in en påminnelse om att ringa tandläkaren imorgon kl 08:30",
        referenceMonday,
      );

      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("Ringa tandläkaren");
      expect(parsed?.targetDate).toBe("2026-09-01"); // Tisdag imorgon
      expect(parsed?.timeString).toBe("08:30");
    });

    it("parses evening context: 'påminn mig ikväll att dricka proteinshake'", () => {
      const parsed = parseSwedishReminder(
        "Påminn mig ikväll att dricka proteinshake",
        referenceMonday,
      );

      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("Dricka proteinshake");
      expect(parsed?.targetDate).toBe("2026-08-31");
      expect(parsed?.contextAnchor).toBe("evening");
    });
  });

  describe("createContextualReminder", () => {
    it("anchors reminder to work shift end time (16:00 + 30 min = 16:30)", async () => {
      const result = await createContextualReminder(
        TEST_ACTOR,
        {
          title: "Storhandla",
          targetDate: "2026-09-04",
          contextAnchor: "after_work",
        },
      );

      expect(dependencies.saveManualTask).toHaveBeenCalledWith(
        TEST_ACTOR,
        expect.objectContaining({
          title: "Storhandla",
          dueAt: "2026-09-04T16:30:00.000Z",
        }),
      );
      expect(result.text).toContain("Storhandla");
      expect(result.text).toContain("fredag");
      expect(result.text).toContain("16:30");
      expect(result.text).toContain("16:00");
    });
  });
});
