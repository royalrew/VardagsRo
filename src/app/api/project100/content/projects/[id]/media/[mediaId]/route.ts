import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { detachProject100ContentMedia } from "@/server/project100-content";
import { project100IdSchema } from "@/server/project100-schemas";
import { assertTrustedMutationRequest } from "@/server/request-security";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; mediaId: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    assertTrustedMutationRequest(request);
    const { id, mediaId } = await props.params;
    const cleanId = project100IdSchema.parse(id);
    const cleanMediaId = project100IdSchema.parse(mediaId);
    await detachProject100ContentMedia(actor, cleanId, cleanMediaId);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
