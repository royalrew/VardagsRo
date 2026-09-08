export interface MotionLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface LightingEvaluation {
  luminance: number;
  quality: "optimal" | "suboptimal" | "poor";
  isDark: boolean;
  isOverexposed: boolean;
  isBacklit: boolean;
  advice: string;
}

export interface ContrastEvaluation {
  contrastRatio: number;
  isLowContrast: boolean;
  quality: "optimal" | "suboptimal" | "poor";
  advice: string;
}

export interface BodyProportionsProfile {
  isValid: boolean;
  torsoLength: number;
  legLength: number;
  shoulderWidth: number;
  scaleFactor: number;
  classification: "child" | "standard-adult" | "tall-adult";
}

/**
 * Evaluates scene illumination, detecting insufficient light, overexposure, and backlighting.
 * (Fas I, Steg 81)
 */
export function analyzeLighting(
  pixels: Uint8ClampedArray,
  width?: number,
  height?: number,
): LightingEvaluation {
  if (pixels.length < 4) {
    return {
      luminance: 0,
      quality: "poor",
      isDark: true,
      isOverexposed: false,
      isBacklit: false,
      advice: "Ingen bildström mottagen. Kontrollera kameran.",
    };
  }

  let totalLuminance = 0;
  let pixelCount = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    totalLuminance += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    pixelCount += 1;
  }

  const averageLuminance = pixelCount > 0 ? totalLuminance / pixelCount : 0;

  let isBacklit = false;
  if (width && height && width >= 4 && height >= 4) {
    let centerLum = 0;
    let centerCount = 0;
    let borderLum = 0;
    let borderCount = 0;

    const minX = Math.round(width * 0.3);
    const maxX = Math.round(width * 0.7);
    const minY = Math.round(height * 0.3);
    const maxY = Math.round(height * 0.7);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const lum = pixels[idx] * 0.2126 + pixels[idx + 1] * 0.7152 + pixels[idx + 2] * 0.0722;
        if (x >= minX && x < maxX && y >= minY && y < maxY) {
          centerLum += lum;
          centerCount++;
        } else {
          borderLum += lum;
          borderCount++;
        }
      }
    }

    const avgCenter = centerCount > 0 ? centerLum / centerCount : 0;
    const avgBorder = borderCount > 0 ? borderLum / borderCount : 0;

    if (avgBorder > 140 && avgCenter < 90 && avgBorder - avgCenter > 60) {
      isBacklit = true;
    }
  }

  const isDark = averageLuminance < 45;
  const isOverexposed = averageLuminance > 220;

  let quality: "optimal" | "suboptimal" | "poor" = "optimal";
  let advice = "Optimal belysning för rörelsespårning.";

  if (isDark) {
    quality = "poor";
    advice = "Rummet är för mörkt. Tänd taklampan eller vänd en ljuskälla mot dig.";
  } else if (isOverexposed) {
    quality = "poor";
    advice = "Kameran är bländad av starkt ljus. Vinkla bort från direkt fönster eller lampa.";
  } else if (isBacklit) {
    quality = "suboptimal";
    advice = "Starkt motljus upptäckt bakom dig. Dra för gardinen eller flytta kameran så ljuset kommer framifrån.";
  } else if (averageLuminance < 65 || averageLuminance > 195) {
    quality = "suboptimal";
    advice = "Ljusnivån är acceptabel men kan förbättras för skarpare spårning.";
  }

  return {
    luminance: Math.round(averageLuminance * 10) / 10,
    quality,
    isDark,
    isOverexposed,
    isBacklit,
    advice,
  };
}

/**
 * Evaluates foreground subject vs background contrast.
 * (Fas I, Steg 82)
 */
export function analyzeContrast(input: {
  subjectLuminance: number;
  backgroundLuminance: number;
}): ContrastEvaluation {
  const higher = Math.max(input.subjectLuminance, input.backgroundLuminance);
  const lower = Math.min(input.subjectLuminance, input.backgroundLuminance);
  // Standard relative luminance contrast formula (+ 0.05 / + 5 for 0-255 scale)
  const contrastRatio = Math.round(((higher + 5) / (lower + 5)) * 100) / 100;

  const isLowContrast = contrastRatio < 1.3;
  let quality: "optimal" | "suboptimal" | "poor" = "optimal";
  let advice = "Bra kontrast mellan person och bakgrund.";

  if (isLowContrast) {
    quality = "poor";
    advice = "Låg kontrast mellan kläder och bakgrund. Prova kläder som kontrasterar mot väggen för säkrare ledspårning.";
  } else if (contrastRatio < 1.8) {
    quality = "suboptimal";
    advice = "Måttlig kontrast. Kan fungera bra men tydligare klädkontrast rekommenderas.";
  }

  return {
    contrastRatio,
    isLowContrast,
    quality,
    advice,
  };
}

/**
 * Normalizes body proportions across children, adults, and mobility profiles.
 * Adapts reach and depth thresholds dynamically to individual limb lengths.
 * (Fas I, Steg 83)
 */
export function normalizeBodyProportions(
  landmarks: readonly MotionLandmark[],
): BodyProportionsProfile {
  if (landmarks.length < 29) {
    return {
      isValid: false,
      torsoLength: 0,
      legLength: 0,
      shoulderWidth: 0,
      scaleFactor: 1.0,
      classification: "standard-adult",
    };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const ankleY = (leftAnkle.y + rightAnkle.y) / 2;

  const torsoLength = Math.max(0.05, Math.abs(hipY - shoulderY));
  const legLength = Math.max(0.05, Math.abs(ankleY - hipY));
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);

  const totalExtent = torsoLength + legLength;
  // Standard adult total extent in 0-1 camera viewport is ~0.70 (30% torso + 40% legs)
  const scaleFactor = Math.min(1.4, Math.max(0.5, Math.round((totalExtent / 0.70) * 100) / 100));

  let classification: "child" | "standard-adult" | "tall-adult" = "standard-adult";
  if (scaleFactor < 0.85) {
    classification = "child";
  } else if (scaleFactor > 1.15) {
    classification = "tall-adult";
  }

  return {
    isValid: true,
    torsoLength: Math.round(torsoLength * 1000) / 1000,
    legLength: Math.round(legLength * 1000) / 1000,
    shoulderWidth: Math.round(shoulderWidth * 1000) / 1000,
    scaleFactor,
    classification,
  };
}
