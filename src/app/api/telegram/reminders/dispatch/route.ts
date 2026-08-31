import { NextResponse } from "next/server";

import { requireActor } from "@/server/actor";
import { dispatchDueTelegramReminders } from "@/server/jarvis-reminders";

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await requireActor(request);
  if (actor.personType !== "adult") {
    return NextResponse.json({ error: "Endast vuxna kan trigga påminnelser." }, { status: 403 });
  }

  const result = await dispatchDueTelegramReminders();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request): Promise<NextResponse> {
  const actor = await requireActor(request);
  if (actor.personType !== "adult") {
    return NextResponse.json({ error: "Endast vuxna kan trigga påminnelser." }, { status: 403 });
  }

  const result = await dispatchDueTelegramReminders();
  return NextResponse.json({ ok: true, ...result });
}
