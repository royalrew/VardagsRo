import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  accessGateConfig,
  hasValidBasicCredentials,
  isPublicServiceRequest,
} from "@/lib/access-gate";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function proxy(request: NextRequest) {
  if (isPublicServiceRequest(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const gate = accessGateConfig();

  if (gate.state === "disabled") {
    return NextResponse.next();
  }

  if (gate.state === "misconfigured") {
    return new NextResponse("Service unavailable", {
      status: 503,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }

  if (
    !hasValidBasicCredentials(
      request.headers.get("authorization"),
      gate.username,
      gate.password,
    )
  ) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        "WWW-Authenticate":
          'Basic realm="Vardagsro staging", charset="UTF-8"',
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
