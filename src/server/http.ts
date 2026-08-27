import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { ApiErrorShape } from "@/lib/types";
import { AppError } from "@/server/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE, ...init?.headers },
  });
}

export function apiError(error: unknown): NextResponse<ApiErrorShape> {
  if (error instanceof AppError) {
    return json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const details = error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return json(
      { error: "Ogiltiga uppgifter.", code: "VALIDATION_ERROR", details },
      { status: 400 },
    );
  }

  return json(
    { error: "Något gick fel. Försök igen.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
