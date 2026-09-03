import type { AssistantAnswer, DashboardData } from "@/lib/types";
import { requireActor } from "@/server/actor";
import { demoFallbackAllowed } from "@/server/config";
import { loadDashboard } from "@/server/database";
import { apiError, json } from "@/server/http";
import { processJarvisAgentMessage } from "@/server/jarvis-agent";
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

    if (canUseLocalContext) {
      const data: Pick<
        DashboardData,
        "people" | "events" | "tasks" | "documents" | "currentPersonId" | "timezone"
      > = input.context!;
      return json(await answerFamilyQuestion(input.question, data, actor.personId));
    }

    const dashboard = await loadDashboard(actor);
    const callerPerson = actor.personId ? dashboard.people.find((p) => p.id === actor.personId) : null;
    const personName = callerPerson?.name;

    const agentResult = await processJarvisAgentMessage(actor, input.question, {
      channel: "web",
      personName,
    });

    const response: AssistantAnswer = {
      text: agentResult.text,
      hasEnoughData: true,
      matchedEventIds: [],
      matchedTaskIds: [],
      sources: [],
      overlapMinutes: 0,
      periodLabel: "",
    };

    return json(response);
  } catch (error) {
    return apiError(error);
  }
}
