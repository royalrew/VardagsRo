import { z } from "zod";

import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import {
  generateEveningBriefing,
  generateMorningBriefing,
} from "@/server/jarvis-briefing";
import { assertProject100Adult } from "@/server/project100";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

const briefingSchema = z.object({
  type: z.enum(["morning", "evening"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);

    const url = new URL(request.url);
    const rawType = url.searchParams.get("type") || "morning";
    const rawDate = url.searchParams.get("date") || undefined;

    const parsed = briefingSchema.parse({
      type: rawType,
      date: rawDate,
    });

    const result =
      parsed.type === "evening"
        ? await generateEveningBriefing(actor, { date: parsed.date })
        : await generateMorningBriefing(actor, { date: parsed.date });

    return json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);

    const body = await readJsonMutation(request, { maxBytes: 4 * 1024 });
    const parsed = briefingSchema.parse(body);

    const result =
      parsed.type === "evening"
        ? await generateEveningBriefing(actor, { date: parsed.date })
        : await generateMorningBriefing(actor, { date: parsed.date });

    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
