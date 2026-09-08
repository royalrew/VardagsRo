import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { assessProject100TrainingLiveGate } from "@/lib/project100-training-live-gate";
import { TrainingLiveGatePanel } from "./TrainingLiveGatePanel";

describe("TrainingLiveGatePanel", () => {
  it("shows the honest live requirements and next action", () => {
    const html = renderToStaticMarkup(createElement(TrainingLiveGatePanel, {
      assessment: assessProject100TrainingLiveGate([]),
    }));

    expect(html).toContain("Live-gate: 0/2 uppdrag godkända");
    expect(html).toContain("Kod klar · livepass återstår");
    expect(html).toContain("Minst tre block");
    expect(html).toContain("Minst två miljöer");
    expect(html).toContain("Genomför ett överkroppsuppdrag");
    expect(html).toContain("Genomför ett underkroppsuppdrag");
  });
});
