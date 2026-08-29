import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { deleteProject100JournalEntry } from "@/server/project100-journal";
import { project100CalendarDateSchema } from "@/server/project100-schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ date: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const date = project100CalendarDateSchema.parse((await context.params).date);
    if (!(await deleteProject100JournalEntry(actor, date))) {
      throw new AppError(404, "PROJECT100_JOURNAL_NOT_FOUND", "Det finns ingen anteckning den dagen.");
    }
    return json({ deleted: true, writtenOn: date });
  } catch (error) {
    return apiError(error);
  }
}
