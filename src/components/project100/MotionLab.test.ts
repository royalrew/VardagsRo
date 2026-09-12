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

  it("renders pushup with adaptive camera setup and motion workout panel", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "pushup",
    }));
    expect(html).toContain("Armhävningar");
    expect(html).toContain("p100-adaptive-camera");
    expect(html).not.toContain("p100-pushup-test-bench");
  });

  it("renders approved lunges in clean production mode", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "lunge",
    }));
    expect(html).toContain("Utfall");
    expect(html).toContain("p100-adaptive-camera");
    expect(html).not.toContain("p100-lunge-test-bench");
  });

  it("renders overhead press in clean production mode with adaptive camera setup", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "overhead-press",
    }));
    expect(html).toContain("Hantel-axelpress");
    expect(html).toContain("p100-adaptive-camera");
    expect(html).not.toContain("p100-overhead-test-bench");
  });

  it("renders approved bicep curls in clean production mode", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "bicep-curl",
    }));
    expect(html).toContain("Hantel-bicepscurl");
    expect(html).toContain("p100-adaptive-camera");
    expect(html).not.toContain("Bicepscurl – Kalibrering");
    expect(html).not.toContain("p100-bicep-test-bench");
  });

  it("renders approved lateral raises in clean production mode", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "lateral-raise",
    }));
    expect(html).toContain("Hantel-sidolyft");
    expect(html).toContain("p100-adaptive-camera");
    expect(html).not.toContain("p100-lateral-raise-test-bench");
  });

  it("opens the bent-over row test bench with countdown and JSON report", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "bent-over-row",
    }));
    expect(html).toContain("Framåtlutad hantelrodd – livekalibrering");
    expect(html).toContain("p100-bent-over-row-test-bench");
    expect(html).toContain("Starta kamera &amp; hantelroddstest");
    expect(html).not.toContain("p100-adaptive-camera");
  });
});
