import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { loadSoloProgress } from "@/server/solo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return json({ progress: await loadSoloProgress(actor) });
  } catch (error) {
    return apiError(error);
  }
}
