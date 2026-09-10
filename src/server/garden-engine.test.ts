import { describe, expect, it } from "vitest";
import { addCalendarDateDays, calendarDateInTimeZone } from "@/lib/dates";
import { GARDEN_HABITS } from "@/lib/garden";
import { advanceGarden, applyGardenAction, gardenStreak, gardenSurprises, newGarden, type GardenState } from "./garden-engine";
import { gardenTelegramMessage, isGardenCommand, parseGardenCallback } from "./garden-telegram";

function complete(state: GardenState) {
  return GARDEN_HABITS.reduce((current, habit) => applyGardenAction(current, { action: "check", habit: habit.id, done: true, date: current.day }), state);
}
function grow(state: GardenState, days: number) {
  for (let i = 0; i < days; i++) {
    if (i > 0) state = advanceGarden(state, addCalendarDateDays(state.day, 1));
    state = complete(state);
  }
  return state;
}

describe("daily garden", () => {
  it("requires all five distinct habits and counts a completed day only once", () => {
    let state = newGarden("2026-09-10");
    for (let i = 0; i < 6; i++) state = applyGardenAction(state, { action: "check", habit: "move", done: true, date: state.day });
    expect(state.checks).toEqual(["move"]);
    expect(gardenStreak(state)).toBe(0);
    state = complete(state);
    expect(gardenStreak(complete(state))).toBe(1);
    expect(advanceGarden(state, state.day)).toEqual(state);
  });

  it("carries completed days forward but resets after one incomplete day or a longer absence", () => {
    const grown = grow(newGarden("2026-09-01"), 10);
    const next = advanceGarden(grown, "2026-09-11");
    expect(gardenStreak(next)).toBe(10);
    expect(next.checks).toEqual([]);
    for (const reset of [advanceGarden(next, "2026-09-12"), advanceGarden(grown, "2026-09-20")]) {
      expect(gardenStreak(reset)).toBe(0);
      expect(reset.surprises).toEqual([]);
      expect(reset.run).toBe(2);
    }
  });

  it("uses calendar days over both Swedish daylight-saving transitions", () => {
    for (const date of ["2026-03-29", "2026-10-25"]) {
      const next = advanceGarden(complete(newGarden(date)), addCalendarDateDays(date, 1));
      expect(next.previousDays).toBe(1);
      expect(next.run).toBe(1);
    }
    expect(calendarDateInTimeZone("2026-09-10T21:59:59Z", "Europe/Stockholm")).toBe("2026-09-10");
    expect(calendarDateInTimeZone("2026-09-10T22:00:00Z", "Europe/Stockholm")).toBe("2026-09-11");
  });

  it("unlocks exactly every tenth day and keeps unopened content secret", () => {
    let state = grow(newGarden("2026-09-01"), 9);
    expect(gardenSurprises(state)).toEqual([]);
    state = complete(advanceGarden(state, "2026-09-10"));
    expect(gardenSurprises(state)).toHaveLength(1);
    expect(gardenSurprises(state)[0].gift).toBeNull();
    expect(gardenSurprises(state)[0]).not.toHaveProperty("content");
    expect(gardenSurprises(complete(state))).toHaveLength(1);
    const firstId = state.surprises[0].id;
    state = applyGardenAction(state, { action: "reveal", date: state.day, id: firstId });
    expect(gardenSurprises(state)[0].gift).not.toBeNull();
    expect(applyGardenAction(state, { action: "reveal", date: state.day, id: firstId }).seen).toEqual(state.seen);
    state = grow(advanceGarden(state, "2026-09-11"), 10);
    expect(gardenSurprises(state).map(gift => gift.day)).toEqual([10, 20]);
  });

  it("undo removes today's growth and gift access, and redo does not reroll the reward", () => {
    let state = grow(newGarden("2026-09-01"), 10);
    const id = state.surprises[0].id;
    state = applyGardenAction(state, { action: "check", date: state.day, habit: "teeth", done: false });
    expect(gardenStreak(state)).toBe(9);
    expect(gardenSurprises(state)).toEqual([]);
    expect(() => applyGardenAction(state, { action: "reveal", date: state.day, id })).toThrow();
    state = complete(state);
    expect(state.surprises[0].id).toBe(id);
    expect(state.surprises).toHaveLength(1);
  });

  it("preserves surprise memory through resets and avoids seen gifts until the catalog is exhausted", () => {
    let state = newGarden("2026-01-01");
    const seen = new Set<number>();
    const locations: Record<number, number> = {};
    for (let run = 0; run < 45; run++) {
      state = grow(state, 10);
      const gift = state.surprises[0];
      if (run < 20) expect(seen.has(gift.content)).toBe(false);
      expect(gift.slot).not.toBe(locations[gift.content]);
      locations[gift.content] = gift.slot;
      seen.add(gift.content);
      state = applyGardenAction(state, { action: "reveal", date: state.day, id: gift.id });
      const memory = [...state.seen];
      state = advanceGarden(state, addCalendarDateDays(state.day, 2));
      expect(state.seen).toEqual(memory);
      expect(gardenSurprises(state)).toEqual([]);
      expect(() => applyGardenAction(state, { action: "reveal", date: state.day, id: gift.id })).toThrow();
    }
  });

  it("rejects old Telegram days instead of checking today's habit", () => {
    const state = newGarden("2026-09-11");
    expect(() => applyGardenAction(state, { action: "check", date: "2026-09-10", habit: "love", done: true })).toThrow(/Dagen har ändrats/);
    expect(state.checks).toEqual([]);
  });
});

describe("Telegram garden controls", () => {
  it("accepts menu and slash commands without intercepting ordinary conversation", () => {
    for (const text of ["/vanor", "/vanor@jarvis_bot", "/tradgard", "🌱 Min trädgård", "mina vanor"]) expect(isGardenCommand(text)).toBe(true);
    expect(isGardenCommand("jag funderar på mina vanor")).toBe(false);
  });
  it("uses dated, explicit set actions rather than retry-sensitive toggles", () => {
    const payload = "garden:check:2026-09-10:teeth:1";
    expect(parseGardenCallback(payload)?.input).toEqual({ action: "check", date: "2026-09-10", habit: "teeth", done: true });
    for (const data of ["garden:check:2026-09-10:all:1", payload + ":user-2", "garden:reset"]) expect(parseGardenCallback(data)).toBeNull();
  });
  it("fits Telegram callback limits and exposes no surprise contents", () => {
    const reply = gardenTelegramMessage({ started: true, date: "2026-09-10", timeZone: "Europe/Stockholm", nextMidnight: "2026-09-10T22:00:00Z", checks: ["love"], streak: 10, run: 1, seed: 1, resetOn: null, surprises: [{ id: "test", day: 10, x: 10, y: 10, gift: null }] });
    for (const row of reply.replyMarkup.inline_keyboard) for (const button of row) expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
    expect(reply.replyMarkup.inline_keyboard[1][0].callback_data).toBe("garden:check:2026-09-10:love:0");
    expect(reply.text).toContain("Något väntar");
  });
});
