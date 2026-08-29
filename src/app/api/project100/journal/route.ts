import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  loadProject100Journal,
  saveProject100JournalEntry,
} from "@/server/project100-journal";
import {
  project100JournalEntrySchema,
  project100JournalFilterSchema,
} from "@/server/project100-journal-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

const KNOWN_QUERY = new Set(["fran", "till", "sok"]);

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
    const filter = project100JournalFilterSchema.parse({
      from: params.get("fran"),
      to: params.get("till"),
      query: params.get("sok"),
    });
    return json(await loadProject100Journal(actor, filter));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100JournalEntrySchema.parse(
      await readJsonMutation(request, { maxBytes: 64 * 1024 }),
    );
    return json({ entry: await saveProject100JournalEntry(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
