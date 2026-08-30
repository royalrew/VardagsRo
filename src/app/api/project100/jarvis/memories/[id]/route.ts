import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  deleteProject100Memory,
  updateProject100Memory,
} from "@/server/project100-jarvis";
import { updateMemorySchema } from "@/server/project100-jarvis-schemas";
import { project100IdSchema } from "@/server/project100-schemas";
import { assertTrustedMutationRequest, readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const { id } = await props.params;
    const cleanId = project100IdSchema.parse(id);
    const body = await readJsonMutation(request, { maxBytes: 8 * 1024 });
    const input = updateMemorySchema.parse(body);
    const memory = await updateProject100Memory(actor, cleanId, input);
    return json({ memory });
  } catch (error) {
    return apiError(error);
  }
}

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
    await deleteProject100Memory(actor, cleanId);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
