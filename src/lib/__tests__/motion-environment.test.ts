import { describe, expect, it } from "vitest";
import {
  analyzeLighting,
  analyzeContrast,
  normalizeBodyProportions,
  type MotionLandmark,
} from "../motion-environment";

function createSolidFrame(r: number, g: number, b: number, pixelsCount = 100): Uint8ClampedArray {
  const array = new Uint8ClampedArray(pixelsCount * 4);
  for (let i = 0; i < array.length; i += 4) {
    array[i] = r;
    array[i + 1] = g;
    array[i + 2] = b;
    array[i + 3] = 255;
  }
  return array;
}

function createBacklitFrame(width = 10, height = 10): Uint8ClampedArray {
  // 10x10 frame with bright perimeter (255) and dark center (20)
  const array = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isCenter = x >= 3 && x <= 6 && y >= 3 && y <= 6;
      const val = isCenter ? 25 : 240;
      array[idx] = val;
      array[idx + 1] = val;
      array[idx + 2] = val;
      array[idx + 3] = 255;
    }
  }
  return array;
}

function point(x: number, y: number, visibility = 0.99): MotionLandmark {
  return { x, y, z: 0, visibility };
}

describe("motion-environment (Steg 81: Ljustest)", () => {
  it("diagnoses dark lighting with actionable advice", () => {
    const darkPixels = createSolidFrame(20, 20, 20);
    const result = analyzeLighting(darkPixels);

    expect(result.quality).toBe("poor");
    expect(result.isDark).toBe(true);
    expect(result.isOverexposed).toBe(false);
    expect(result.isBacklit).toBe(false);
    expect(result.luminance).toBeLessThan(45);
    expect(result.advice).toContain("för mörkt");
  });

  it("diagnoses overexposed lighting with actionable advice", () => {
    const brightPixels = createSolidFrame(245, 245, 245);
    const result = analyzeLighting(brightPixels);

    expect(result.quality).toBe("poor");
    expect(result.isDark).toBe(false);
    expect(result.isOverexposed).toBe(true);
    expect(result.luminance).toBeGreaterThan(220);
    expect(result.advice).toContain("bländad");
  });

  it("identifies backlight silhouetting when background is bright and subject center is dark", () => {
    const backlit = createBacklitFrame(10, 10);
    const result = analyzeLighting(backlit, 10, 10);

    expect(result.isBacklit).toBe(true);
    expect(result.quality).toBe("suboptimal");
    expect(result.advice).toContain("motljus");
  });

  it("reports optimal lighting for standard well-lit indoor environment", () => {
    const optimalPixels = createSolidFrame(125, 125, 125);
    const result = analyzeLighting(optimalPixels);

    expect(result.quality).toBe("optimal");
    expect(result.isDark).toBe(false);
    expect(result.isOverexposed).toBe(false);
    expect(result.isBacklit).toBe(false);
    expect(result.advice).toContain("Optimal");
  });
});

describe("motion-environment (Steg 82: Kläder och kontrast)", () => {
  it("warns when contrast between subject area and surrounding scene is critically low", () => {
    // Subject luminance ~80, Background luminance ~82 -> contrast delta ~2
    const lowContrast = analyzeContrast({ subjectLuminance: 80, backgroundLuminance: 82 });
    expect(lowContrast.contrastRatio).toBeLessThan(1.2);
    expect(lowContrast.isLowContrast).toBe(true);
    expect(lowContrast.advice).toContain("Låg kontrast");
  });

  it("passes when subject contrasts sharply with background", () => {
    // Subject dark clothes (40), bright white background (200) -> contrast ratio 5:1
    const highContrast = analyzeContrast({ subjectLuminance: 40, backgroundLuminance: 200 });
    expect(highContrast.isLowContrast).toBe(false);
    expect(highContrast.contrastRatio).toBeGreaterThan(2.0);
    expect(highContrast.quality).toBe("optimal");
  });
});

describe("motion-environment (Steg 83: Kroppsvariation & proportioner)", () => {
  it("calculates adaptive scaling factor for adult proportions", () => {
    const adultLandmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
    // Adult: head (0.15), shoulders (0.25), hips (0.55), knees (0.75), ankles (0.95)
    adultLandmarks[0] = point(0.50, 0.15); // nose
    adultLandmarks[11] = point(0.40, 0.25); // l shoulder
    adultLandmarks[12] = point(0.60, 0.25); // r shoulder
    adultLandmarks[23] = point(0.45, 0.55); // l hip
    adultLandmarks[24] = point(0.55, 0.55); // r hip
    adultLandmarks[25] = point(0.45, 0.75); // l knee
    adultLandmarks[26] = point(0.55, 0.75); // r knee
    adultLandmarks[27] = point(0.45, 0.95); // l ankle
    adultLandmarks[28] = point(0.55, 0.95); // r ankle

    const profile = normalizeBodyProportions(adultLandmarks);
    expect(profile.isValid).toBe(true);
    expect(profile.torsoLength).toBeCloseTo(0.30, 2);
    expect(profile.legLength).toBeCloseTo(0.40, 2);
    expect(profile.scaleFactor).toBeGreaterThan(0.8);
    expect(profile.scaleFactor).toBeLessThan(1.2);
  });

  it("adapts scale factor for child proportions (shorter torso & limbs)", () => {
    const childLandmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
    // Child occupies smaller vertical extent: shoulders 0.35, hips 0.55, ankles 0.80
    childLandmarks[0] = point(0.50, 0.25);
    childLandmarks[11] = point(0.42, 0.35);
    childLandmarks[12] = point(0.58, 0.35);
    childLandmarks[23] = point(0.45, 0.55);
    childLandmarks[24] = point(0.55, 0.55);
    childLandmarks[25] = point(0.45, 0.68);
    childLandmarks[26] = point(0.55, 0.68);
    childLandmarks[27] = point(0.45, 0.80);
    childLandmarks[28] = point(0.55, 0.80);

    const profile = normalizeBodyProportions(childLandmarks);
    expect(profile.isValid).toBe(true);
    expect(profile.scaleFactor).toBeLessThan(0.85); // scaled down for child reach
    expect(profile.torsoLength).toBeCloseTo(0.20, 2);
  });
});
