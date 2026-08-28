import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { serviceReadiness } from "@/server/readiness";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const readiness = await serviceReadiness();
    return json(
      {
        status: readiness.ready ? "ok" : "not_ready",
        timestamp: new Date().toISOString(),
        services: readiness.services,
      },
      { status: readiness.ready ? 200 : 503 },
    );
  } catch (error) {
    return apiError(error);
  }
}
