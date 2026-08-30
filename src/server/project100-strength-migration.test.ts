import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { PROJECT100_MUSCLE_GROUPS } from "@/lib/project100-strength";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("to_regclass")) {
      return Promise.resolve([{ migrations: true, households: true }]);
    }
    if (text.includes("app_schema_migrations")) {
      return Promise.resolve([{ current: true }]);
    }
    return Promise.resolve([{ count: "1" }]);
  });
  return { calls, sql };
});

vi.mock("postgres", () => ({ default: vi.fn(() => database.sql) }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));

import {
  databaseStatus,
  LATEST_DATABASE_MIGRATION,
} from "@/server/database";

describe("Projekt 100 strength migration contract", () => {
  it("requires migration 021 before readiness reports a healthy database", async () => {
    await expect(databaseStatus()).resolves.toBe("ok");

    const readinessQuery = database.calls.find((call) =>
      call.text.includes("select exists") && call.text.includes("app_schema_migrations"),
    );
    expect(LATEST_DATABASE_MIGRATION).toBe("021_project100_exercise_muscles");
    expect(readinessQuery?.values).toContain(LATEST_DATABASE_MIGRATION);
  });

  it("keeps the migration constraint aligned with the application allow-list", () => {
    const source = readFileSync(
      new URL("../../scripts/migrate.mjs", import.meta.url),
      "utf8",
    );
    const migration = source.slice(source.indexOf('version: "021_project100_exercise_muscles"'));
    const allowed = migration.match(
      /check \(muscle_groups <@ array\[([\s\S]*?)\]::text\[\]\)/,
    );
    const values = [...(allowed?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
      (match) => match[1],
    );

    expect(migration).toContain("default array[]::text[]");
    expect(values).toEqual([...PROJECT100_MUSCLE_GROUPS]);
  });
});
