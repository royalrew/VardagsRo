import type { DashboardData } from "@/lib/types";
import { requireActor } from "@/server/actor";
import { demoFallbackAllowed } from "@/server/config";
import { loadDashboard } from "@/server/database";
import { apiError, json } from "@/server/http";
import { answerFamilyQuestion } from "@/server/questions";
import { readJsonMutation } from "@/server/request-security";
import { askRequestSchema } from "@/server/schemas";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = askRequestSchema.parse(await readJsonMutation(request));
    const canUseLocalContext = demoFallbackAllowed() && Boolean(input.context);
    const stored = canUseLocalContext ? null : await loadDashboard(actor);
    const data: Pick<
      DashboardData,
      "people" | "events" | "tasks" | "documents" | "currentPersonId" | "timezone"
    > = canUseLocalContext ? input.context! : stored!;
    // "Jag" is the signed-in member, never whoever happens to hold the role.
    return json(await answerFamilyQuestion(input.question, data, actor.personId));
  } catch (error) {
    return apiError(error);
  }
}
