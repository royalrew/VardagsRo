import "server-only";
import { z } from "zod";
import { addCalendarDateDays, calendarDateInTimeZone, zonedDateTimeToInstant } from "@/lib/dates";
import type { GardenView } from "@/lib/garden";
import { assertCanMutate } from "@/server/actor";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { advanceGarden, applyGardenAction, gardenStreak, gardenSurprises, newGarden, type GardenState } from "@/server/garden-engine";
import { assertProject100Adult } from "@/server/project100";

const date = z.iso.date();
export const gardenActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), date }).strict(),
  z.object({ action: z.literal("check"), date, habit: z.enum(["move", "love", "learn", "teeth", "tomorrow"]), done: z.boolean() }).strict(),
  z.object({ action: z.literal("reveal"), date, id: z.uuid() }).strict(),
]);

/** Both transports share this transaction and the authenticated account ID. */
export async function accessGarden(actor: ActorContext, input?: unknown): Promise<GardenView> {
  assertProject100Adult(actor);
  const action = input === undefined ? undefined : gardenActionSchema.parse(input);
  if (action) assertCanMutate(actor);
  const sql = await readyClient();
  return await sql.begin(async tx => {
    // Also serializes concurrent first starts, when there is no row to lock yet.
    await tx`select pg_advisory_xact_lock(hashtextextended(${`garden:${actor.userId}`}, 0))`;
    const zones = await tx<{ timezone: string }[]>`select timezone from family_households where id = ${actor.householdId}`;
    const timeZone = zones[0]?.timezone;
    if (!timeZone) throw new AppError(503, "HOUSEHOLD_NOT_CONFIGURED", "Hushållets tidszon saknas.");
    const today = calendarDateInTimeZone(new Date(), timeZone);
    const rows = await tx<{ state: GardenState }[]>`select state from project100_gardens where user_id = ${actor.userId} for update`;
    const previous = rows[0]?.state;
    let state = previous ? advanceGarden(previous, today) : null;
    if (action) {
      if (action.date !== today) throw new AppError(409, "GARDEN_OLD_DAY", "Dagen har ändrats. Öppna dagens vanor och försök igen.");
      if (!state && action.action !== "start") throw new AppError(409, "GARDEN_NOT_STARTED", "Plantera ditt frö först.");
      state = applyGardenAction(state ?? newGarden(today), action);
    }
    if (state && (action || state !== previous)) {
      await tx`insert into project100_gardens (user_id, state)
        values (${actor.userId}, ${tx.json(JSON.parse(JSON.stringify(state)))})
        on conflict (user_id) do update set state = excluded.state, updated_at = now()`;
    }
    return {
      started: state !== null, date: today, timeZone,
      nextMidnight: zonedDateTimeToInstant(addCalendarDateDays(today, 1), 0, timeZone).toISOString(),
      checks: state?.checks ?? [], streak: state ? gardenStreak(state) : 0,
      run: state?.run ?? 0, seed: state?.seed ?? 17, resetOn: state?.resetOn ?? null,
      surprises: state ? gardenSurprises(state) : [],
    };
  });
}
