import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  createProject100Conversation,
  loadProject100JarvisWorkspace,
} from "@/server/project100-jarvis";
import { createConversationSchema } from "@/server/project100-jarvis-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const workspace = await loadProject100JarvisWorkspace(actor);
    return json({ conversations: workspace.conversations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const body = await readJsonMutation(request, { maxBytes: 8 * 1024 });
    const input = createConversationSchema.parse(body);
    const conversation = await createProject100Conversation(actor, input);
    return json({ conversation }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
