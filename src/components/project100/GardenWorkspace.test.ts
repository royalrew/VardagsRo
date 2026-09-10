import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GardenView } from "@/lib/garden";
import { GardenWorkspace } from "./GardenWorkspace";

afterEach(() => vi.restoreAllMocks());

describe("garden server/client rendering", () => {
  it.each([0, 1, 10, 30, 100])("keeps SVG attributes identical across math runtimes at day %i", streak => {
    const initialView: GardenView = {
      started: streak > 0, date: "2026-09-10", timeZone: "Europe/Stockholm",
      nextMidnight: "2026-09-10T22:00:00Z", checks: [], streak, run: 1,
      seed: 17, resetOn: null, surprises: [],
    };
    const server = renderToStaticMarkup(createElement(GardenWorkspace, { initialView }));
    // Engines may differ in the low bits of their transcendental functions.
    // Reproduce that difference without depending on the machine running Vitest.
    const { sin, cos, sqrt } = Math;
    vi.spyOn(Math, "sin").mockImplementation(value => sin(value) + 1e-14);
    vi.spyOn(Math, "cos").mockImplementation(value => cos(value) - 1e-14);
    vi.spyOn(Math, "sqrt").mockImplementation(value => sqrt(value) + 1e-14);
    const browser = renderToStaticMarkup(createElement(GardenWorkspace, { initialView }));
    expect(browser === server).toBe(true);
  });
});
