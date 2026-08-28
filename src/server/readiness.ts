import { configuredServices } from "@/server/config";
import { databaseStatus, type DatabaseStatus } from "@/server/database";
import { storageIsHealthy } from "@/server/storage";

export type ConfiguredServiceStatus = "configured" | "not_configured";
export type R2Status = "ok" | "not_configured" | "unavailable";

export const READINESS_CACHE_TTL_MS = 5_000;
export const READINESS_CHECK_TIMEOUT_MS = 6_000;

export interface ServiceReadiness {
  ready: boolean;
  services: {
    database: DatabaseStatus;
    openai: ConfiguredServiceStatus;
    r2: R2Status;
    mail: ConfiguredServiceStatus;
  };
}

export function readinessFrom(input: {
  database: DatabaseStatus;
  openaiConfigured: boolean;
  r2Configured: boolean;
  r2Healthy: boolean;
  mailConfigured: boolean;
}): ServiceReadiness {
  const openai: ConfiguredServiceStatus = input.openaiConfigured
    ? "configured"
    : "not_configured";
  const r2: R2Status = input.r2Healthy
    ? "ok"
    : input.r2Configured
      ? "unavailable"
      : "not_configured";

  const mail: ConfiguredServiceStatus = input.mailConfigured
    ? "configured"
    : "not_configured";

  return {
    // Mail is reported but does not hold readiness back. A household can use the
    // product without it; what it cannot do is recover a forgotten password, and
    // that failure is silent unless something says so out loud.
    ready: input.database === "ok" && openai === "configured" && r2 === "ok",
    services: { database: input.database, openai, r2, mail },
  };
}

let cachedReadiness:
  | { value: ServiceReadiness; expiresAt: number }
  | undefined;
let readinessInFlight: Promise<ServiceReadiness> | undefined;

/**
 * A public readiness request must not be able to hold the route open forever.
 * The underlying client may finish later, so always observe both fulfillment
 * and rejection even after the deadline has returned the fail-closed fallback.
 */
function settleWithin<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(
      () => finish(fallback),
      READINESS_CHECK_TIMEOUT_MS,
    );
    void work.then(finish, () => finish(fallback));
  });
}

async function freshServiceReadiness(): Promise<ServiceReadiness> {
  const configured = configuredServices();
  const [database, r2Healthy] = await Promise.all([
    settleWithin(databaseStatus(), "unavailable"),
    configured.r2
      ? settleWithin(storageIsHealthy(), false)
      : Promise.resolve(false),
  ]);

  return readinessFrom({
    database,
    openaiConfigured: configured.openai,
    r2Configured: configured.r2,
    r2Healthy,
    mailConfigured: configured.mail,
  });
}

/**
 * Railway and anonymous callers share this deep dependency probe. Keep the
 * response dynamic, but coalesce concurrent work and briefly reuse the result
 * so a public endpoint cannot turn every request into database and R2 traffic.
 * A new deployment starts in a new process with an empty cache, so its first
 * health check still proves the new container against live dependencies.
 */
export function serviceReadiness(): Promise<ServiceReadiness> {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) {
    return Promise.resolve(cachedReadiness.value);
  }
  if (readinessInFlight) return readinessInFlight;

  const check = freshServiceReadiness();
  const shared: Promise<ServiceReadiness> = check
    .then((value) => {
      cachedReadiness = {
        value,
        expiresAt: Date.now() + READINESS_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      if (readinessInFlight === shared) readinessInFlight = undefined;
    });
  readinessInFlight = shared;
  return shared;
}
