export const HOUSEHOLD_ROLES = ["owner", "adult", "viewer"] as const;

export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];
export type ActorChannel = "web" | "telegram" | "system";

/**
 * Server-derived identity for one household. Never construct this from request
 * bodies, query parameters or client-provided household/person identifiers.
 */
export interface ActorContext {
  userId: string;
  membershipId: string;
  householdId: string;
  personId: string;
  role: HouseholdRole;
  personType: "adult" | "child";
  channel: ActorChannel;
}

export interface AuditContext {
  actor: ActorContext;
  requestId?: string;
}
