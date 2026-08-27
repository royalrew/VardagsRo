export const runtime = "nodejs";

/**
 * Always answers 401 with a Basic challenge.
 *
 * HTTP Basic Auth has no real sign-out: the browser keeps the credentials for
 * the origin until it decides to forget them. Asking for this endpoint with
 * deliberately wrong credentials makes most browsers replace what they cached
 * for the realm, which is the closest thing to logging out that the staging gate
 * can offer. It is best effort, not a guarantee.
 */
export function GET() {
  return new Response("Utloggad", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Vardagsro staging", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
