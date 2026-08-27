/**
 * A small in-memory log of things that failed, so the family can hand over a
 * report instead of describing the symptom from memory.
 *
 * The report is meant to be pasted into a chat or an issue, so it deliberately
 * carries no family content: no names, no document titles, no event titles, no
 * free text the family wrote. Ids, error codes, counts and timings only.
 */

export const DIAGNOSTICS_REPORT_VERSION = 1;
const MAX_EVENTS = 40;
const MAX_MESSAGE_LENGTH = 200;

export type DiagnosticKind = "api" | "client";

export interface DiagnosticEvent {
  at: string;
  kind: DiagnosticKind;
  operation: string;
  method?: string;
  path?: string;
  status?: number;
  code?: string;
  message?: string;
  durationMs?: number;
}

export interface DiagnosticsCounts {
  people: number;
  events: number;
  tasks: number;
  documents: number;
  folders: number;
}

export interface DiagnosticsReport {
  report: "vardagsro-diagnostik";
  version: number;
  generatedAt: string;
  app: {
    dataMode: string;
    householdId: string;
    timezone: string;
    activeView: string;
  };
  counts: DiagnosticsCounts;
  health: unknown;
  browser: {
    userAgent: string;
    language: string;
    viewport: string;
    online: boolean;
  };
  events: DiagnosticEvent[];
}

const buffer: DiagnosticEvent[] = [];

/**
 * Replace identifiers in a request path so the report stays readable and does
 * not carry a trail of which specific records the family touched.
 */
export function redactPath(path: string): string {
  return path
    .split("?")[0]
    .split("/")
    .map((segment) =>
      /^[0-9a-fA-F-]{8,}$/.test(segment) || /^(person|document|event|task|folder)-/.test(segment)
        ? ":id"
        : segment,
    )
    .join("/");
}

function trimMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  return collapsed.length > MAX_MESSAGE_LENGTH
    ? `${collapsed.slice(0, MAX_MESSAGE_LENGTH)}…`
    : collapsed;
}

export function recordDiagnostic(event: Omit<DiagnosticEvent, "at">): void {
  buffer.push({
    ...event,
    path: event.path ? redactPath(event.path) : undefined,
    message: trimMessage(event.message),
    at: new Date().toISOString(),
  });
  while (buffer.length > MAX_EVENTS) buffer.shift();
}

export function diagnosticEvents(): DiagnosticEvent[] {
  return [...buffer];
}

export function clearDiagnostics(): void {
  buffer.length = 0;
}

function pathOf(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function isAppRequest(url: string): boolean {
  return pathOf(url).startsWith("/api/");
}

/**
 * Watch the app's own network traffic and uncaught errors from one place.
 *
 * Wrapping fetch rather than each call site means the upload, extraction and
 * confirmation flows are covered too, and no future call site can forget to
 * report. Responses are cloned before being inspected so callers still get an
 * unread body.
 */
export function installDiagnosticsListeners(): () => void {
  const originalFetch = window.fetch;

  window.fetch = async function diagnosticFetch(input, init) {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const started = Date.now();
    try {
      const response = await originalFetch(input, init);
      if (!response.ok && isAppRequest(url)) {
        let code: string | undefined;
        let message: string | undefined;
        try {
          const body: unknown = await response.clone().json();
          if (typeof body === "object" && body !== null) {
            const record = body as Record<string, unknown>;
            if (typeof record.code === "string") code = record.code;
            if (typeof record.error === "string") message = record.error;
          }
        } catch {
          // A non-JSON error body tells us nothing extra; the status is enough.
        }
        recordDiagnostic({
          kind: "api",
          operation: "fetch",
          method,
          path: pathOf(url),
          status: response.status,
          code,
          message,
          durationMs: Date.now() - started,
        });
      }
      return response;
    } catch (error) {
      recordDiagnostic({
        kind: "client",
        operation: "fetch",
        method,
        path: pathOf(url),
        message: error instanceof Error ? error.message : "nätverksfel",
        durationMs: Date.now() - started,
      });
      throw error;
    }
  };

  const onError = (event: ErrorEvent) => {
    recordDiagnostic({
      kind: "client",
      operation: "uncaught",
      message: event.message,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordDiagnostic({
      kind: "client",
      operation: "unhandledrejection",
      message:
        event.reason instanceof Error ? event.reason.message : String(event.reason ?? "okänt fel"),
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.fetch = originalFetch;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

export function buildDiagnosticsReport(input: {
  dataMode: string;
  householdId: string;
  timezone: string;
  activeView: string;
  counts: DiagnosticsCounts;
  health: unknown;
  browser: { userAgent: string; language: string; viewport: string; online: boolean };
  now?: Date;
}): DiagnosticsReport {
  return {
    report: "vardagsro-diagnostik",
    version: DIAGNOSTICS_REPORT_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    app: {
      dataMode: input.dataMode,
      householdId: input.householdId,
      timezone: input.timezone,
      activeView: input.activeView,
    },
    counts: input.counts,
    health: input.health,
    browser: input.browser,
    events: diagnosticEvents(),
  };
}

async function fetchHealth(): Promise<unknown> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : "okänt fel" };
  }
}

/**
 * Assemble the report the family can hand over, including a fresh health probe.
 * Called from a click handler rather than an effect so the panel itself stays a
 * pure rendering of an already-built report.
 */
export async function collectDiagnosticsReport(input: {
  dataMode: string;
  householdId: string;
  timezone: string;
  activeView: string;
  counts: DiagnosticsCounts;
}): Promise<DiagnosticsReport> {
  const health = await fetchHealth();
  return buildDiagnosticsReport({
    ...input,
    health,
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
    },
  });
}

export function diagnosticsFilename(now = new Date()): string {
  return `vardagsro-diagnostik-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}
