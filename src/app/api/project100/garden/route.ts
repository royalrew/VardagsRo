import { requireActor } from "@/server/actor";
import { accessGarden } from "@/server/garden";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return json(await accessGarden(await requireActor(request))); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const input = await readJsonMutation(request, { maxBytes: 2048 });
    return json(await accessGarden(actor, input));
  } catch (error) { return apiError(error); }
}
