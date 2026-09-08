import { describe, expect, it, vi } from "vitest";

import {
  computeDuckingGainMultiplier,
  duckAudioGainNode,
  playParrySound,
  playHazardAlertSound,
} from "../motion-sound";

describe("Ljuddesign & Audio Ducking (Steg 66)", () => {
  it("computes instantaneous ducking multiplier smoothly during speech", () => {
    const duckDurationMs = 2000;
    const duckLevel = 0.25;

    // Before ducking
    expect(computeDuckingGainMultiplier(-100, duckDurationMs, duckLevel)).toBe(1.0);

    // Initial fade in to duck level (first 100ms)
    const midFade = computeDuckingGainMultiplier(50, duckDurationMs, duckLevel);
    expect(midFade).toBeLessThan(1.0);
    expect(midFade).toBeGreaterThan(duckLevel);

    // Deep in ducking window
    expect(computeDuckingGainMultiplier(500, duckDurationMs, duckLevel)).toBeCloseTo(duckLevel, 2);
    expect(computeDuckingGainMultiplier(1500, duckDurationMs, duckLevel)).toBeCloseTo(duckLevel, 2);

    // Fading back up towards end of ducking window
    const recovering = computeDuckingGainMultiplier(2050, duckDurationMs, duckLevel);
    expect(recovering).toBeGreaterThan(duckLevel);

    // Fully recovered after window + fade-out
    expect(computeDuckingGainMultiplier(2500, duckDurationMs, duckLevel)).toBe(1.0);
  });

  it("schedules Web Audio gain ramps on GainNode when ducking is triggered", () => {
    const mockGainParam = {
      value: 1.0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    };

    const mockGainNode = {
      gain: mockGainParam,
    } as unknown as GainNode;

    duckAudioGainNode(mockGainNode, {
      nowSeconds: 10.0,
      durationSeconds: 2.5,
      duckLevel: 0.2,
    });

    expect(mockGainParam.cancelScheduledValues).toHaveBeenCalledWith(10.0);
    expect(mockGainParam.setValueAtTime).toHaveBeenCalledWith(1.0, 10.0);
    expect(mockGainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.2, 10.0 + 0.08);
    expect(mockGainParam.setValueAtTime).toHaveBeenCalledWith(0.2, 10.0 + 2.5);
    expect(mockGainParam.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, 10.0 + 2.5 + 0.25);
  });

  it("safely triggers playParrySound and playHazardAlertSound on AudioContext", () => {
    const mockAudioContext = {
      currentTime: 1.0,
      destination: {},
      createOscillator: vi.fn(() => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
    } as unknown as AudioContext;

    expect(() => playParrySound(mockAudioContext)).not.toThrow();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();

    expect(() => playHazardAlertSound(mockAudioContext)).not.toThrow();
  });
});
