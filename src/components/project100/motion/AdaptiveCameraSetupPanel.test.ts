import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdaptiveCameraSetupPanel } from "./AdaptiveCameraSetupPanel";

describe("AdaptiveCameraSetupPanel", () => {
  it("guides a user from their environment without requiring camera knowledge", () => {
    const html = renderToStaticMarkup(createElement(AdaptiveCameraSetupPanel, {
      exerciseId: "pushup",
      environment: "grass",
      environmentLocked: true,
      resolution: "640 × 480",
      isLive: false,
      poseVisible: false,
      fullBodyVisible: false,
      luminance: null,
      framing: null,
      measuredReps: 0,
      measuredHoldSeconds: 0,
      onBegin: () => undefined,
      onFinish: () => undefined,
      onCancel: () => undefined,
    }));

    expect(html).toContain("Adaptiv kamerauppställning");
    expect(html).toContain("Ställ dig snett eller i profil");
    expect(html).toContain("telefonen står plant");
    expect(html).toContain("Starta kameran först");
  });
});
