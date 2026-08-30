import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { listJarvisCapabilityGaps } from "@/server/jarvis-gaps";
import { assertProject100Adult } from "@/server/project100";

export const runtime = "nodejs";

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
