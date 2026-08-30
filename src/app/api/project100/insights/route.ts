import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { loadProject100Insights } from "@/server/project100-insights";
import { project100InsightsQuerySchema } from "@/server/project100-insights-schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const { searchParams } = new URL(request.url);
    const query = project100InsightsQuerySchema.parse({
      period: searchParams.get("period") || "30d",
      from: searchParams.get("from") || null,
      to: searchParams.get("to") || null,
    });
    const insights = await loadProject100Insights(actor, query);
    return json({ insights });
  } catch (error) {
    return apiError(error);
  }
}
