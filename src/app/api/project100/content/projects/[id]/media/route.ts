import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { attachProject100ContentMedia } from "@/server/project100-content";
import { attachMediaSchema } from "@/server/project100-content-schemas";
import { project100IdSchema } from "@/server/project100-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const { id } = await props.params;
    const cleanId = project100IdSchema.parse(id);
    const body = await readJsonMutation(request, { maxBytes: 16 * 1024 });
    const input = attachMediaSchema.parse(body);
    const media = await attachProject100ContentMedia(actor, cleanId, input);
    return json({ media }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
