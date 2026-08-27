import { vi } from "vitest";

import type { ActorContext } from "@/server/authorization-types";

/**
 * A verified actor for route tests that are about the route's own behaviour.
 * Permission enforcement itself is covered separately in
 * `src/app/api/route-permissions.test.ts`, which does not stub these guards.
 */
export const TEST_ACTOR: ActorContext = {
  userId: "user-test",
  membershipId: "membership-test",
  householdId: "household-demo",
  personId: "person-nora",
  role: "owner",
  personType: "adult",
  channel: "web",
};

export function actorModuleMock() {
  return {
    requireActor: vi.fn(async () => TEST_ACTOR),
    requireActorFromHeaders: vi.fn(async () => TEST_ACTOR),
    requireTelegramActor: vi.fn(async () => TEST_ACTOR),
    assertCanMutate: vi.fn(),
    assertCanManageHousehold: vi.fn(),
  };
}
