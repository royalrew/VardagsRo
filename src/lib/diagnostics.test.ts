import { beforeEach, describe, expect, it } from "vitest";

import {
  buildDiagnosticsReport,
  clearDiagnostics,
  diagnosticEvents,
  diagnosticsFilename,
  recordDiagnostic,
  redactPath,
} from "@/lib/diagnostics";

describe("diagnostics report", () => {
  beforeEach(() => {
    clearDiagnostics();
  });

  it("strips identifiers out of request paths", () => {
    expect(redactPath("/api/people/91b4133d-3778-44e1-a03b-251246d6e10f")).toBe("/api/people/:id");
    expect(redactPath("/api/documents/document-skola")).toBe("/api/documents/:id");
    expect(redactPath("/api/events/event-dentist/")).toBe("/api/events/:id/");
    expect(redactPath("/api/documents/document-skola/url?expires=60")).toBe("/api/documents/:id/url");
    expect(redactPath("/api/people")).toBe("/api/people");
  });

  it("keeps the error code and status, which is what identifies the failure", () => {
    recordDiagnostic({
      kind: "api",
      operation: "fetch",
      method: "DELETE",
      path: "/api/people/person-nora",
      status: 409,
      code: "PERSON_NOT_EMPTY",
      message: "Personen har kvar 3 kalenderposter.",
      durationMs: 42,
    });

    const [event] = diagnosticEvents();
    expect(event).toMatchObject({
      status: 409,
      code: "PERSON_NOT_EMPTY",
      method: "DELETE",
      path: "/api/people/:id",
      durationMs: 42,
    });
    expect(Date.parse(event.at)).not.toBeNaN();
  });

  it("collapses and caps a long message so one failure cannot flood the report", () => {
    recordDiagnostic({
      kind: "client",
      operation: "uncaught",
      message: `${"a".repeat(400)}\n\n   b`,
    });

    const [event] = diagnosticEvents();
    expect(event.message).toHaveLength(201);
    expect(event.message?.endsWith("…")).toBe(true);
    expect(event.message).not.toContain("\n");
  });

  it("keeps only the most recent failures", () => {
    for (let index = 0; index < 60; index += 1) {
      recordDiagnostic({ kind: "api", operation: "fetch", status: index });
    }

    const events = diagnosticEvents();
    expect(events).toHaveLength(40);
    expect(events[0].status).toBe(20);
    expect(events.at(-1)?.status).toBe(59);
  });

  it("carries counts rather than any family content", () => {
    recordDiagnostic({
      kind: "api",
      operation: "fetch",
      path: "/api/documents/document-skola",
      status: 500,
    });

    const report = buildDiagnosticsReport({
      dataMode: "database",
      householdId: "household-demo",
      timezone: "Europe/Stockholm",
      activeView: "documents",
      counts: { people: 7, events: 3, tasks: 2, documents: 4, folders: 4 },
      health: { status: 200, body: { status: "ok" } },
      browser: { userAgent: "test", language: "sv-SE", viewport: "800x600", online: true },
      now: new Date("2026-08-25T18:00:00.000Z"),
    });

    // The report is meant to be pasted into a chat or an issue, so nothing the
    // family wrote or was sent may travel with it.
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain("document-skola");
    expect(report.counts).toEqual({ people: 7, events: 3, tasks: 2, documents: 4, folders: 4 });
    expect(report.generatedAt).toBe("2026-08-25T18:00:00.000Z");
    expect(report.report).toBe("vardagsro-diagnostik");
    expect(report.events[0].path).toBe("/api/documents/:id");
  });

  it("names the downloaded file so several reports can live side by side", () => {
    expect(diagnosticsFilename(new Date("2026-08-25T18:04:05.678Z"))).toBe(
      "vardagsro-diagnostik-2026-08-25T18-04-05-678Z.json",
    );
  });
});
