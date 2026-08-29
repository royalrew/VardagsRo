import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  loadProject100BodyJourney,
  saveProject100BodyEntry,
} from "@/server/project100-body";
import {
  project100BodyEntrySchema,
  project100BodyPeriodSchema,
} from "@/server/project100-body-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

const KNOWN_QUERY = new Set(["fran", "till"]);

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const params = new URL(request.url).searchParams;
    for (const [key] of params) {
      if (!KNOWN_QUERY.has(key)) {
        throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
      }
    }
    const period = project100BodyPeriodSchema.parse({
      from: params.get("fran"),
      to: params.get("till"),
    });
    return json(await loadProject100BodyJourney(actor, period));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100BodyEntrySchema.parse(
      await readJsonMutation(request, { maxBytes: 32 * 1024 }),
    );
    return json({ entry: await saveProject100BodyEntry(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
