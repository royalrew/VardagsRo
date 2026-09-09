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

  it("opens the cycling flow without the strength calibration panel", () => {
    const html = renderToStaticMarkup(createElement(MotionLab, {
      initialPairingCode: "123456",
      initialExercise: "cycling",
      initialWarmupMissionId: "mission-1",
    }));
    expect(html).toContain("Spinning framför kameran");
    expect(html).not.toContain("p100-adaptive-camera");
    expect(html).not.toContain("p100-motion-session-control");
  });
});
