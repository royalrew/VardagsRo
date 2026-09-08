import { NextResponse } from "next/server";

import { requireActor } from "@/server/actor";
import {
  dispatchDueTelegramReminders,
  getDueTelegramRemindersCount,
} from "@/server/jarvis-reminders";

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

  // GET is idempotent and read-only: return status and count of pending due reminders without mutating
  const pendingDueCount = await getDueTelegramRemindersCount();
  return NextResponse.json({ ok: true, pendingDueCount });
}
