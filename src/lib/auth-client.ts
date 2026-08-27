"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Talks to `/api/auth` on the same origin. The session lives in an httpOnly
 * cookie, so nothing here ever holds a token the page could leak.
 */
export const authClient = createAuthClient();
