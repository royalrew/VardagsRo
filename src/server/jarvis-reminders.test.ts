import { describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";
import {
  createContextualReminder,
  dispatchDueTelegramReminders,
  parseSwedishReminder,
} from "@/server/jarvis-reminders";

const dependencies = vi.hoisted(() => ({
  loadDashboard: vi.fn(async () => ({
    events: [
      {
        id: "work-event-friday",
        title: "Arbetspass Dag",
        startsAt: "2026-09-04T05:00:00.000Z", // 07:00 CEST
        endsAt: "2026-09-04T14:00:00.000Z", // 16:00 CEST
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
  sendTelegramMessage: vi.fn(async () => undefined),
  sqlQuery: vi.fn(),
}));

vi.mock("@/server/database", () => ({
  loadDashboard: dependencies.loadDashboard,
  saveManualTask: dependencies.saveManualTask,
  readyClient: vi.fn(async () => {
    const fn = (strings: TemplateStringsArray, ...values: unknown[]) =>
      dependencies.sqlQuery(strings.join("?"), values);
    return fn as unknown as ReturnType<typeof vi.fn>;
  }),
}));

vi.mock("@/server/telegram", () => ({
  sendTelegramMessage: dependencies.sendTelegramMessage,
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

    it("parses 'Påminn mig om att packa lådor hemma kl 20:00'", () => {
      const parsed = parseSwedishReminder(
        "Påminn mig om att packa lådor hemma kl 20:00",
        referenceMonday,
      );

      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("Packa lådor hemma");
      expect(parsed?.targetDate).toBe("2026-08-31");
      expect(parsed?.timeString).toBe("20:00");
    });
  });

  describe("createContextualReminder", () => {
    it("anchors reminder to work shift end time with timezone awareness", async () => {
      const result = await createContextualReminder(
        TEST_ACTOR,
        {
          title: "Storhandla",
          targetDate: "2026-09-04",
          contextAnchor: "after_work",
        },
      );

      // 16:00 CEST end time + 30 min = 16:30 CEST = 14:30 UTC
      expect(dependencies.saveManualTask).toHaveBeenCalledWith(
        TEST_ACTOR,
        expect.objectContaining({
          title: "Storhandla",
          dueAt: "2026-09-04T14:30:00.000Z",
        }),
      );
      expect(result.text).toContain("Storhandla");
      expect(result.text).toContain("fredag");
      expect(result.text).toContain("16:30");
    });
  });

  describe("dispatchDueTelegramReminders", () => {
    it("finds due tasks and sends Telegram push messages", async () => {
      dependencies.sqlQuery
        .mockResolvedValueOnce([
          {
            id: "task-due-1",
            title: "Packa lådor hemma",
            notes: null,
            due_at: "2026-08-31T18:00:00.000Z", // 20:00 CEST
            person_id: "person-nora",
            person_name: "Jimmy",
            telegram_chat_id: "123456789",
          },
        ])
        .mockResolvedValueOnce([]); // update query

      const result = await dispatchDueTelegramReminders(new Date("2026-08-31T18:05:00.000Z"));

      expect(result.dispatchedCount).toBe(1);
      expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith(
        "123456789",
        expect.stringContaining("Packa lådor hemma"),
      );
    });
  });
});
