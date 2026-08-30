import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { generateProject100ContentSuggestions } from "@/server/project100-content";
import { assertTrustedMutationRequest } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertTrustedMutationRequest(request);
    const suggestions = await generateProject100ContentSuggestions(actor);
    return json({ suggestions });
  } catch (error) {
    return apiError(error);
  }
}
