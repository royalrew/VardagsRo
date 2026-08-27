import "server-only";

import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";

import { appBaseUrl, authSecret, databaseUrl, isProductionRuntime } from "@/server/config";
import { sendPasswordReset } from "@/server/mail";

const globalAuthPool = globalThis as typeof globalThis & { vardagsroAuthPool?: Pool };

function authPool(): Pool {
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error("Databasen måste vara konfigurerad för inloggning.");
  if (!globalAuthPool.vardagsroAuthPool) {
    globalAuthPool.vardagsroAuthPool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 20_000,
    });
  }
  return globalAuthPool.vardagsroAuthPool;
}

function createAuth() {
  const baseURL = appBaseUrl();
  return betterAuth({
    appName: "Vardagsro",
    baseURL,
    secret: authSecret(),
    database: authPool(),
    trustedOrigins: isProductionRuntime()
      ? [baseURL]
      : [baseURL, "http://localhost:3000", "http://127.0.0.1:3000"],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Without this, the only way back into a forgotten account is a shell on
      // the production container. That is workable for whoever deployed it and
      // nobody else in the family.
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordReset(user.email, url);
      },
      resetPasswordTokenExpiresIn: 60 * 60,
    },
    user: {
      modelName: "auth_users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
      modelName: "auth_rate_limits",
      fields: { lastRequest: "last_request" },
    },
    advanced: {
      cookiePrefix: "vardagsro",
      useSecureCookies: isProductionRuntime(),
      database: { generateId: "uuid" },
    },
    plugins: [
      admin({
        defaultRole: "user",
        schema: {
          user: { fields: { banReason: "ban_reason", banExpires: "ban_expires" } },
          session: { fields: { impersonatedBy: "impersonated_by" } },
        },
      }),
    ],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let cachedAuth: AuthInstance | null = null;

/**
 * Built on first use, never at import time. A module that reads secrets while
 * being imported turns `next build` into something that needs production
 * credentials, and makes every route that merely mentions auth fail to build in
 * an environment that has none.
 */
export function getAuth(): AuthInstance {
  cachedAuth ??= createAuth();
  return cachedAuth;
}

export type AuthSession = AuthInstance["$Infer"]["Session"];
