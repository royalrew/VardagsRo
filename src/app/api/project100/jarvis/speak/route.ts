import { z } from "zod";

import { requireActor } from "@/server/actor";
import { synthesizeJarvisSpeech } from "@/server/audio-synthesis";
import { apiError } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

const speakSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  voice: z.enum(["onyx", "alloy", "echo", "fable", "nova", "shimmer"]).optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);

    const body = await readJsonMutation(request, { maxBytes: 8 * 1024 });
    const parsed = speakSchema.parse(body);

    const audioBuffer = await synthesizeJarvisSpeech(parsed.text, {
      voice: parsed.voice || "onyx",
      format: "mp3",
    });

    return new Response(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
