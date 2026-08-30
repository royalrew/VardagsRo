import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  deleteProject100ContentProject,
  loadProject100ContentWorkspace,
  updateProject100ContentProject,
} from "@/server/project100-content";
import { updateContentProjectSchema } from "@/server/project100-content-schemas";
import { project100IdSchema } from "@/server/project100-schemas";
import { assertTrustedMutationRequest, readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const { id } = await props.params;
    const cleanId = project100IdSchema.parse(id);
    const workspace = await loadProject100ContentWorkspace(actor, cleanId);
    if (!workspace.activeProject || workspace.activeProject.id !== cleanId) {
      return json({ error: "Projektet hittades inte." }, { status: 404 });
    }
    return json({ project: workspace.activeProject });
  } catch (error) {
    return apiError(error);
  }
}

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
    const body = await readJsonMutation(request, { maxBytes: 128 * 1024 });
    const input = updateContentProjectSchema.parse(body);
    const project = await updateProject100ContentProject(actor, cleanId, input);
    return json({ project });
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
    await deleteProject100ContentProject(actor, cleanId);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
