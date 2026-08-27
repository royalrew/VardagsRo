export const ONBOARDING_VERSION = 1;

export function onboardingStorageKey(householdId: string): string {
  return `vardagsro:onboarding:v${ONBOARDING_VERSION}:${encodeURIComponent(householdId)}`;
}
