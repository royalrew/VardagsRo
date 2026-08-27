import "server-only";

import type { ActorContext, HouseholdRole } from "@/server/authorization-types";
import { getAuth } from "@/server/auth";
import { databaseUrl, demoFallbackAllowed } from "@/server/config";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";

/**
 * Running the app with no database at all is a development convenience that
 * predates identity: `loadDashboard` hands out demo data instead of failing.
 * The gate is deliberately double. It needs both an unconfigured database and a
 * non-production runtime, so it cannot open in production, where the database
 * is always configured and `demoFallbackAllowed` is false either way.
 */
function demoActor(channel: ActorContext["channel"]): ActorContext | null {
  if (databaseUrl() !== null || !demoFallbackAllowed()) return null;
  return {
    userId: "demo-user",
    membershipId: "demo-membership",
    householdId: "demo-household",
    // Matches the demo household's own current person, so "jag" still resolves
    // to someone who exists in the data being served.
    personId: "person-nora",
    role: "owner",
    personType: "adult",
    channel,
  };
}

interface MembershipRow {
  membership_id: string;
  user_id: string;
  household_id: string;
  person_id: string;
  role: HouseholdRole;
  person_type: "adult" | "child";
}

function unauthenticated(): AppError {
  return new AppError(401, "NOT_AUTHENTICATED", "Du behöver logga in.");
}

function withoutHousehold(): AppError {
  return new AppError(
    403,
    "NO_HOUSEHOLD_MEMBERSHIP",
    "Ditt konto hör inte till något hushåll.",
  );
}

/**
 * Membership is the single source of truth for which household a request may
 * touch. The lookup joins the person row inside the same household, so a
 * membership can never point at a person in someone else's family even if the
 * rows were tampered with directly.
 *
 * A user with several memberships resolves to the oldest one. Household
 * switching is a later step; until it exists, the answer has to be stable
 * rather than arbitrary.
 */
async function membershipForUser(userId: string): Promise<MembershipRow | null> {
  const sql = await readyClient();
  const rows = await sql<MembershipRow[]>`
    select
      m.id as membership_id,
      m.user_id,
      m.household_id,
      m.person_id,
      m.role,
      p.person_type
    from family_memberships m
    join family_people p
      on p.id = m.person_id and p.household_id = m.household_id
    where m.user_id = ${userId}
    order by m.created_at asc, m.id asc
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Resolves the verified caller for a browser request. Every field comes from
 * the session cookie and the database; nothing is read from the request body,
 * query string or headers the client controls.
 */
export async function requireActorFromHeaders(headers: Headers): Promise<ActorContext> {
  const withoutDatabase = demoActor("web");
  if (withoutDatabase) return withoutDatabase;

  const session = await getAuth().api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw unauthenticated();

  const membership = await membershipForUser(userId);
  if (!membership) throw withoutHousehold();

  return {
    userId,
    membershipId: membership.membership_id,
    householdId: membership.household_id,
    personId: membership.person_id,
    role: membership.role,
    personType: membership.person_type,
    channel: "web",
  };
}

export async function requireActor(request: Request): Promise<ActorContext> {
  return requireActorFromHeaders(request.headers);
}

interface TelegramActorRow {
  household_id: string;
  person_id: string;
  person_type: "adult" | "child";
  membership_id: string | null;
  user_id: string | null;
  role: HouseholdRole | null;
}

/**
 * The bot acts as the person its chat is linked to. Telegram user ids and
 * product account ids are separate namespaces, so the household comes from the
 * link row rather than from a membership lookup on the Telegram id.
 *
 * A linked person who has no product account of their own resolves to `viewer`.
 * The bot then cannot change anything even if a write path is added later, and
 * permission still fails closed rather than inheriting someone else's role.
 */
export async function requireTelegramActor(telegramUserId: string): Promise<ActorContext> {
  const sql = await readyClient();
  const rows = await sql<TelegramActorRow[]>`
    select
      a.household_id,
      a.person_id,
      p.person_type,
      m.id as membership_id,
      m.user_id,
      m.role
    from telegram_accounts a
    join family_people p
      on p.id = a.person_id and p.household_id = a.household_id
    left join family_memberships m
      on m.household_id = a.household_id and m.person_id = a.person_id
    where a.telegram_user_id = ${telegramUserId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw withoutHousehold();

  return {
    userId: row.user_id ?? `telegram:${telegramUserId}`,
    membershipId: row.membership_id ?? `telegram:${telegramUserId}`,
    householdId: row.household_id,
    personId: row.person_id,
    role: row.role ?? "viewer",
    personType: row.person_type,
    channel: "telegram",
  };
}

/**
 * A viewer reads the household but never changes it. Checked before the write
 * is prepared, never after it has been attempted.
 */
export function assertCanMutate(actor: ActorContext): void {
  if (actor.role === "viewer") {
    throw new AppError(
      403,
      "READ_ONLY_MEMBER",
      "Du har läsbehörighet i hushållet och kan inte ändra något.",
    );
  }
}

/**
 * Household membership, invitations and family composition are owner work.
 */
export function assertCanManageHousehold(actor: ActorContext): void {
  if (actor.role !== "owner") {
    throw new AppError(
      403,
      "OWNER_REQUIRED",
      "Bara hushållets ägare kan ändra det här.",
    );
  }
}
