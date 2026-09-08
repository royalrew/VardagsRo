export interface WinterTyresStatus {
  mandatoryPeriodActive: boolean;
  studdedAllowed: boolean;
  summary: string;
}

/**
 * Evaluates Swedish winter tyre regulations based on the current date.
 * - Lagkrav på vinterdäck: 1 december – 31 mars om vinterväglag råder (minst 3 mm mönsterdjup).
 * - Dubbdäck tillåtna: 1 oktober – 15 april (och annan tid om det är eller befaras bli vinterväglag).
 * - Förbud mot dubbdäck: 16 april – 30 september (såvida inte vinterväglag råder).
 */
export function checkWinterTyresRule(currentDate: Date = new Date()): WinterTyresStatus {
  const month = currentDate.getUTCMonth(); // 0 = Jan, 11 = Dec
  const day = currentDate.getUTCDate();

  // Mandatory period: 1 Dec - 31 March
  const isMandatory = month === 11 || month === 0 || month === 1 || month === 2;

  // Studded allowed: 1 Oct - 15 April
  const isStudded =
    month === 9 || // Oct
    month === 10 || // Nov
    month === 11 || // Dec
    month === 0 || // Jan
    month === 1 || // Feb
    month === 2 || // Mar
    (month === 3 && day <= 15); // Apr 1-15

  let summary = "";
  if (isMandatory) {
    summary =
      "⚠️ **Lagkrav på vinterdäck gäller nu (1 dec – 31 mars)** vid vinterväglag. Mönsterdjupet måste vara minst 3 mm för personbil.";
  } else if (isStudded) {
    summary =
      "✅ **Dubbdäck är tillåtna nu (1 okt – 15 april).** Lagkravet på vinterdäck träder i kraft den 1 december vid vinterväglag.";
  } else {
    summary =
      "☀️ **Sommardäckssäsong.** Dubbdäck är i normalfallet förbjudna mellan 16 april och 30 september (får dock användas om det råder eller befaras bli vinterväglag). Vinterdäckskravet börjar gälla 1 december.";
  }

  return {
    mandatoryPeriodActive: isMandatory,
    studdedAllowed: isStudded,
    summary,
  };
}

/**
 * Parses car mileage / odometer numbers from natural language input.
 */
export function parseCarOdometerCommand(text: string): {
  isOdometer: boolean;
  mileageMil?: number;
  mileageKm?: number;
} {
  const match = text.match(
    /(?:bilen|bilen\s*har|har\s*gått|har\s*rullat|mätarställning(?:en)?).*?(\d[\d\s.,]*)\s*(mil|km|kilometer)?/i,
  );

  if (!match) {
    return { isOdometer: false };
  }

  const rawNum = match[1].replace(/\s+/g, "").replace(",", ".");
  const val = parseFloat(rawNum);

  if (isNaN(val) || val <= 0 || val > 1_000_000) {
    return { isOdometer: false };
  }

  const unit = (match[2] || "").toLowerCase();
  let mileageMil: number;
  let mileageKm: number;

  if (unit.startsWith("km") || unit.startsWith("kilo")) {
    mileageKm = Math.round(val);
    mileageMil = Math.round(val / 10);
  } else {
    mileageMil = Math.round(val);
    mileageKm = Math.round(val * 10);
  }

  return {
    isOdometer: true,
    mileageMil,
    mileageKm,
  };
}

/**
 * Returns Swedish vehicle inspection rules and intervals.
 */
export function checkCarInspectionInfo(text: string): {
  isInspectionQuery: boolean;
  summary: string;
} {
  const isInspectionQuery =
    /(?:besikt|besikta|besiktas|besiktiga|besiktning|kontrollbesiktning)/i.test(text);

  return {
    isInspectionQuery,
    summary:
      "🚗 **Besiktningsintervall i Sverige för personbil:**\n" +
      "1. Första besiktningen sker senast **3 år** (36 månader) efter att bilen togs i bruk.\n" +
      "2. Andra besiktningen senast **2 år** (24 månader) efter första besiktningen.\n" +
      "3. Därefter ska bilen besiktigas senast var **14:e månad** (intervall på 14 månader).\n" +
      "Slutsiffran i registreringsnumret styr inte längre besiktningsmånaden utan du kan besiktiga när som helst under din 14-månadersperiod.",
  };
}

/**
 * Classifies car-related user queries.
 */
export function parseCarIntent(
  text: string,
): "tyres" | "inspection" | "odometer-store" | "odometer-query" | "service" | "none" {
  const lower = text.toLowerCase();

  if (/(?:vinterdäck|sommardäck|dubbdäck|däckbyte|byta\s*däck|skifta\s*däck|däcklag)/i.test(lower)) {
    return "tyres";
  }

  if (/(?:besikt|besiktas|besiktiga|besiktning|kontrollbesiktning)/i.test(lower)) {
    return "inspection";
  }

  if (/(?:hur\s*långt\s*har\s*bilen\s*gått|mätarställning\s*på\s*bilen|vad\s*står\s*mätaren\s*på)/i.test(lower)) {
    return "odometer-query";
  }

  if (
    /(?:bilen\s*(?:har)?\s*(?:gått|rullat)|logga\s*mätarställning|spara\s*mätarställning)/i.test(lower) &&
    /\d+/.test(lower)
  ) {
    return "odometer-store";
  }

  if (/(?:bilservice|serva\s*bilen|dags\s*för\s*service\s*på\s*bilen|serviceintervall)/i.test(lower)) {
    return "service";
  }

  return "none";
}
