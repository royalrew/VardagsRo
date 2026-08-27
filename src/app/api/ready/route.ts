import { json } from "@/server/http";
import { serviceReadiness } from "@/server/readiness";

export const runtime = "nodejs";

export async function GET() {
  const { ready } = await serviceReadiness();
  return json(
    { status: ready ? "ready" : "not_ready" },
    { status: ready ? 200 : 503 },
  );
}
