import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  createProject100ContentProject,
  loadProject100ContentWorkspace,
} from "@/server/project100-content";
import { createContentProjectSchema } from "@/server/project100-content-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const workspace = await loadProject100ContentWorkspace(actor);
    return json({ projects: workspace.projects });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const body = await readJsonMutation(request, { maxBytes: 64 * 1024 });
    const input = createContentProjectSchema.parse(body);
    const project = await createProject100ContentProject(actor, input);
    return json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
