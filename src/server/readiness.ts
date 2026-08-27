import { configuredServices } from "@/server/config";
import { databaseStatus, type DatabaseStatus } from "@/server/database";
import { storageIsHealthy } from "@/server/storage";

export type ConfiguredServiceStatus = "configured" | "not_configured";
export type R2Status = "ok" | "not_configured" | "unavailable";

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

export async function serviceReadiness(): Promise<ServiceReadiness> {
  const configured = configuredServices();
  const [database, r2Healthy] = await Promise.all([
    databaseStatus(),
    configured.r2 ? storageIsHealthy() : Promise.resolve(false),
  ]);

  return readinessFrom({
    database,
    openaiConfigured: configured.openai,
    r2Configured: configured.r2,
    r2Healthy,
    mailConfigured: configured.mail,
  });
}
