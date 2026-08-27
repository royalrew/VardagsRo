import { describe, expect, it, vi } from "vitest";

import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "user-jimmy",
    membershipId: "membership-1",
    householdId: "household-real",
    personId: "person-jimmy",
    role: "owner",
    personType: "adult",
    channel: "web",
    ...overrides,
  };
}

function fakeSql() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return Promise.resolve([]);
  });
  // postgres.js wraps jsonb values; the marker keeps the assertions readable
  // while still proving the metadata is passed as a value, not a JSON string.
  Object.assign(sql, { json: (value: unknown) => ({ jsonb: value }) });
  return { calls, sql: sql as unknown as Parameters<typeof recordAudit>[0] };
}

describe("recordAudit", () => {
  it("takes household and actor from the verified actor, not from the entry", async () => {
    const { calls, sql } = fakeSql();

    await recordAudit(sql, actor(), {
      action: "event.create",
      targetType: "event",
      targetId: "event-1",
    });

    expect(calls[0]?.text).toContain("insert into family_audit_log");
    expect(calls[0]?.values.slice(0, 6)).toEqual([
      "household-real",
      "user",
      "user-jimmy",
      "event.create",
      "event",
      "event-1",
    ]);
  });

  it("separates the bot from the browser so history shows how a change arrived", async () => {
    const { calls, sql } = fakeSql();

    await recordAudit(sql, actor({ channel: "telegram" }), {
      action: "task.update",
      targetType: "task",
      targetId: "task-9",
    });

    expect(calls[0]?.values[1]).toBe("telegram");
  });

  it("records system changes without pretending a person made them", async () => {
    const { calls, sql } = fakeSql();

    await recordAudit(sql, actor({ channel: "system" }), {
      action: "document.delete",
      targetType: "document",
      targetId: null,
    });

    expect(calls[0]?.values[1]).toBe("system");
    expect(calls[0]?.values[5]).toBeNull();
  });

  it("passes metadata as a value so jsonb queries can reach it", async () => {
    const { calls, sql } = fakeSql();

    await recordAudit(sql, actor(), {
      action: "person.create",
      targetType: "person",
      targetId: "person-2",
    });

    expect(calls[0]?.values[6]).toEqual({ jsonb: {} });
  });

  it("stores structural metadata as given", async () => {
    const { calls, sql } = fakeSql();

    await recordAudit(sql, actor(), {
      action: "event.update",
      targetType: "event",
      targetId: "event-1",
      metadata: { fields: "startsAt,endsAt", allDay: false },
    });

    expect(calls[0]?.values[6]).toEqual({
      jsonb: { fields: "startsAt,endsAt", allDay: false },
    });
  });
});
