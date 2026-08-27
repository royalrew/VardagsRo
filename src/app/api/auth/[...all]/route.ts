import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth";

export const runtime = "nodejs";

/**
 * Better Auth owns sign-in, sign-out and session refresh. Everything else in
 * the product reads the resulting session through `requireActor`, so this is
 * the only place where credentials are handled.
 */
export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));
