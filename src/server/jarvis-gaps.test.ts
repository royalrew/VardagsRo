import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const dependencies = vi.hoisted(() => ({
  sql: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/server/database", () => ({
  readyClient: vi.fn(async () => dependencies.sql),
}));
vi.mock("@/server/audit", () => ({
  recordAudit: dependencies.recordAudit,
}));

import {
  listJarvisCapabilityGaps,
  logJarvisCapabilityGap,
  updateJarvisCapabilityGapStatus,
} from "@/server/jarvis-gaps";

describe("Jarvis Capability Gaps Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a new capability gap and writes audit record", async () => {
    const mockRow = {
      id: "gap-101",
      user_id: TEST_ACTOR.userId,
      raw_query: "När ska bilen besiktigas?",
      detected_intent: "car_inspection",
      category_hint: "car",
      channel: "telegram",
      status: "pending",
      notes: null,
      created_at: "2026-08-30T21:00:00Z",
      updated_at: "2026-08-30T21:00:00Z",
    };

    dependencies.sql.mockResolvedValueOnce([mockRow]);

    const result = await logJarvisCapabilityGap(
      TEST_ACTOR,
      "När ska bilen besiktigas?",
      "telegram",
      {
        detectedIntent: "car_inspection",
        categoryHint: "car",
      },
    );

    expect(result.id).toBe("gap-101");
    expect(result.rawQuery).toBe("När ska bilen besiktigas?");
    expect(result.detectedIntent).toBe("car_inspection");
    expect(result.channel).toBe("telegram");
    expect(result.status).toBe("pending");
    expect(dependencies.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      TEST_ACTOR,
      expect.objectContaining({
        action: "jarvis.gap.logged",
        targetType: "jarvis_capability_gap",
        targetId: expect.any(String),
      }),
    );
  });

  it("lists capability gaps for the adult user", async () => {
    const mockRows = [
      {
        id: "gap-101",
        user_id: TEST_ACTOR.userId,
        raw_query: "Räkna ut elkostnad för juli",
        detected_intent: "electricity_cost",
        category_hint: "finance",
        channel: "web",
        status: "pending",
        notes: null,
        created_at: "2026-08-30T21:00:00Z",
        updated_at: "2026-08-30T21:00:00Z",
      },
    ];

    dependencies.sql.mockResolvedValueOnce(mockRows);

    const gaps = await listJarvisCapabilityGaps(TEST_ACTOR, "pending");

    expect(gaps).toHaveLength(1);
    expect(gaps[0].rawQuery).toBe("Räkna ut elkostnad för juli");
    expect(gaps[0].categoryHint).toBe("finance");
  });

  it("updates capability gap status and records audit", async () => {
    const mockRow = {
      id: "gap-101",
      user_id: TEST_ACTOR.userId,
      raw_query: "Räkna ut elkostnad för juli",
      detected_intent: "electricity_cost",
      category_hint: "finance",
      channel: "web",
      status: "implemented",
      notes: null,
      created_at: "2026-08-30T21:00:00Z",
      updated_at: "2026-08-30T21:05:00Z",
    };

    dependencies.sql.mockResolvedValueOnce([mockRow]);

    const updated = await updateJarvisCapabilityGapStatus(
      TEST_ACTOR,
      "gap-101",
      "implemented",
    );

    expect(updated.status).toBe("implemented");
    expect(dependencies.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      TEST_ACTOR,
      expect.objectContaining({
        action: "jarvis.gap.update",
        targetType: "jarvis_capability_gap",
        targetId: "gap-101",
      }),
    );
  });
});
