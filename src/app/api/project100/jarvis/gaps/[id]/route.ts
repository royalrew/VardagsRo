import { z } from "zod";

import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { updateJarvisCapabilityGapStatus } from "@/server/jarvis-gaps";
import { assertProject100Adult } from "@/server/project100";
import { project100IdSchema } from "@/server/project100-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(["pending", "implemented", "dismissed"]),
});

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
    const parsed = updateSchema.parse(body);

    const updated = await updateJarvisCapabilityGapStatus(
      actor,
      cleanId,
      parsed.status,
    );
    return json({ gap: updated });
  } catch (error) {
    return apiError(error);
  }
}
