import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { MotionLab } from "./MotionLab";

describe("Motion Lab focused training view", () => {
  it("keeps game entry below the camera and diagnostics unmounted until requested", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, { initialPairingCode: "123456" }));
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).not.toContain("bossfight");
    expect(header).not.toContain("Boss fight");
    expect(html).not.toContain("p100-motion-game-launch-group");
    expect(html).not.toContain("p100-motion-benchmark");
    expect(html.indexOf("Spela · valfritt")).toBeGreaterThan(html.indexOf("</video>"));
    expect(html).toContain("Starta mätning");
  });

  it("opens the cycling test bench with calibration report and proceed to workout button", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "cycling",
      initialWarmupMissionId: "mission-1",
    }));
    expect(html).toContain("Test &amp; Kalibrering av Motionscykel");
    expect(html).toContain("p100-cycling-test-bench");
    expect(html).toContain("Starta kamera &amp; cykeltest");
    expect(html).toContain("Starta 30 min Intervallpass");
    expect(html).not.toContain("p100-adaptive-camera");
    expect(html).not.toContain("p100-motion-session-control");
  });

  it("opens the 30 min cycling interval session with resistance coaching and overlay", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "cycling-intervals-30",
    }));
    expect(html).toContain("Intervallpass med motstånd");
    expect(html).toContain("30 min Intervallcykling");
    expect(html).toContain("p100-cycling-interval-overlay");
    expect(html).toContain("Lätt");
    expect(html).not.toContain("p100-adaptive-camera");
  });

  it("opens the pushup test bench with instructions and copy report button", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "pushup",
    }));
    expect(html).toContain("Armhävningstest");
    expect(html).toContain("p100-pushup-test-bench");
    expect(html).toContain("Instruktioner för vinklar &amp; kameraplacering");
    expect(html).toContain("Starta kamera &amp; armhävningstest");
    expect(html).not.toContain("p100-adaptive-camera");
  });
});
