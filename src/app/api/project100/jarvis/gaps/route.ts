import { z } from "zod";

import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { listJarvisCapabilityGaps, logJarvisCapabilityGap } from "@/server/jarvis-gaps";
import { assertProject100Adult } from "@/server/project100";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

const createGapSchema = z.object({
  query: z.string().trim().min(2).max(1000),
  detectedIntent: z.string().trim().max(120).optional(),
  categoryHint: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");

    const status =
      statusParam === "pending" ||
      statusParam === "implemented" ||
      statusParam === "dismissed"
        ? statusParam
        : undefined;

    const gaps = await listJarvisCapabilityGaps(actor, status);
    return json({ gaps });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);

    const body = await readJsonMutation(request, { maxBytes: 16 * 1024 });
    const parsed = createGapSchema.parse(body);

    const gap = await logJarvisCapabilityGap(actor, parsed.query, "web", {
      detectedIntent: parsed.detectedIntent,
      categoryHint: parsed.categoryHint,
      notes: parsed.notes,
    });

    return json({ gap }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
