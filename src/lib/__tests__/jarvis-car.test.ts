import { describe, expect, it } from "vitest";
import {
  checkWinterTyresRule,
  parseCarOdometerCommand,
  checkCarInspectionInfo,
  parseCarIntent,
} from "../jarvis-car";

describe("jarvis-car (Bil & Fordon: Däck, Besiktning & Mätarställning)", () => {
  it("evaluates Swedish winter tyre laws depending on current date", () => {
    // In November (allowed studded, winter tyres mandatory in Dec)
    const novDate = new Date("2026-11-15T12:00:00Z");
    const novStatus = checkWinterTyresRule(novDate);
    expect(novStatus.studdedAllowed).toBe(true);
    expect(novStatus.mandatoryPeriodActive).toBe(false);
    expect(novStatus.summary).toContain("1 december");

    // In January (mandatory period active if winter road conditions)
    const janDate = new Date("2026-01-15T12:00:00Z");
    const janStatus = checkWinterTyresRule(janDate);
    expect(janStatus.mandatoryPeriodActive).toBe(true);
    expect(janStatus.summary).toContain("Lagkrav på vinterdäck");

    // In June (summer period, studded tyres prohibited)
    const junDate = new Date("2026-06-15T12:00:00Z");
    const junStatus = checkWinterTyresRule(junDate);
    expect(junStatus.studdedAllowed).toBe(false);
    expect(junStatus.summary).toContain("Sommardäck");
  });

  it("parses car odometer / mileage log from natural phrases", () => {
    const text1 = "Bilen har gått 14 500 mil";
    const res1 = parseCarOdometerCommand(text1);
    expect(res1.isOdometer).toBe(true);
    expect(res1.mileageMil).toBe(14500);
    expect(res1.mileageKm).toBe(145000);

    const text2 = "Logga mätarställning 18200 mil på bilen";
    const res2 = parseCarOdometerCommand(text2);
    expect(res2.isOdometer).toBe(true);
    expect(res2.mileageMil).toBe(18200);

    const text3 = "Vad ska vi äta idag?";
    const res3 = parseCarOdometerCommand(text3);
    expect(res3.isOdometer).toBe(false);
  });

  it("identifies inspection queries and provides correct Swedish periodic inspection intervals", () => {
    const info = checkCarInspectionInfo("När ska bilen besiktigas?");
    expect(info.isInspectionQuery).toBe(true);
    expect(info.summary).toContain("3 år");
    expect(info.summary).toContain("14 månader");
  });

  it("categorizes car-related intents accurately", () => {
    expect(parseCarIntent("När måste jag byta till vinterdäck?")).toBe("tyres");
    expect(parseCarIntent("När är det dags för besiktning av bilen?")).toBe("inspection");
    expect(parseCarIntent("Bilen har rullat 12 400 mil")).toBe("odometer-store");
    expect(parseCarIntent("Hur långt har bilen gått?")).toBe("odometer-query");
    expect(parseCarIntent("Dags för bilservice")).toBe("service");
    expect(parseCarIntent("Hur är vädret?")).toBe("none");
  });
});
