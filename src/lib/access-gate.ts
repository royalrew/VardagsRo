import { createHash, timingSafeEqual } from "node:crypto";

export const READY_PATHNAME = "/api/ready";
export const TELEGRAM_WEBHOOK_PATHNAME = "/api/telegram/webhook";

export type AccessGateConfig =
  | { state: "disabled" }
  | { state: "misconfigured" }
  | { state: "enabled"; username: string; password: string };

type GateEnvironment = {
  NODE_ENV?: string;
  VARDAGSRO_GATE_USERNAME?: string;
  VARDAGSRO_GATE_PASSWORD?: string;
  ZICKARIS_ADMIN_EMAIL?: string;
  ZICKARIS_ADMIN_PASSWORD?: string;
};

export function accessGateConfig(
  environment: GateEnvironment = process.env,
): AccessGateConfig {
  const username = environment.VARDAGSRO_GATE_USERNAME;
  const password = environment.VARDAGSRO_GATE_PASSWORD;
  const hasUsername = typeof username === "string" && username.length > 0;
  const hasPassword = typeof password === "string" && password.length > 0;

  if (hasUsername && hasPassword) {
    return { state: "enabled", username, password };
  }

  if (hasUsername || hasPassword) {
    return { state: "misconfigured" };
  }

  const legacyUsername = environment.ZICKARIS_ADMIN_EMAIL;
  const legacyPassword = environment.ZICKARIS_ADMIN_PASSWORD;
  const hasLegacyUsername =
    typeof legacyUsername === "string" && legacyUsername.length > 0;
  const hasLegacyPassword =
    typeof legacyPassword === "string" && legacyPassword.length > 0;

  if (hasLegacyUsername && hasLegacyPassword) {
    return {
      state: "enabled",
      username: legacyUsername,
      password: legacyPassword,
    };
  }

  if (
    environment.NODE_ENV === "production" ||
    hasLegacyUsername ||
    hasLegacyPassword
  ) {
    return { state: "misconfigured" };
  }

  return { state: "disabled" };
}

export function isReadinessRequest(pathname: string) {
  return pathname === READY_PATHNAME;
}

export function isPublicServiceRequest(pathname: string) {
  return isReadinessRequest(pathname) || pathname === TELEGRAM_WEBHOOK_PATHNAME;
}

export function hasValidBasicCredentials(
  authorization: string | null,
  expectedUsername: string,
  expectedPassword: string,
) {
  const credentials = parseBasicCredentials(authorization);

  if (!credentials) {
    return false;
  }

  const usernameMatches = constantTimeEqual(
    credentials.username,
    expectedUsername,
  );
  const passwordMatches = constantTimeEqual(
    credentials.password,
    expectedPassword,
  );

  return usernameMatches && passwordMatches;
}

function parseBasicCredentials(authorization: string | null) {
  if (!authorization) {
    return null;
  }

  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return null;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

function constantTimeEqual(actual: string, expected: string) {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}
