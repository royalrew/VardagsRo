import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { deleteProject100Conversation } from "@/server/project100-jarvis";
import { project100IdSchema } from "@/server/project100-schemas";
import { assertTrustedMutationRequest } from "@/server/request-security";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    assertTrustedMutationRequest(request);
    const { id } = await props.params;
    const cleanId = project100IdSchema.parse(id);
    await deleteProject100Conversation(actor, cleanId);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
