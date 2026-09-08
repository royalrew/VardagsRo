import { describe, expect, it } from "vitest";
import {
  parseFridgeQueryIngredients,
  generateFridgeMealSuggestions,
  isFridgeMealQuery,
  type FridgeMealSuggestion,
} from "../jarvis-recipes";

describe("jarvis-recipes (Kylskåpstömning & Matförslag)", () => {
  it("extracts ingredients from natural Swedish query phrases", () => {
    const text1 = "Vad kan vi laga på köttfärs, pasta, lök och krossade tomater?";
    const ingredients1 = parseFridgeQueryIngredients(text1);
    expect(ingredients1).toContain("köttfärs");
    expect(ingredients1).toContain("pasta");
    expect(ingredients1).toContain("lök");
    expect(ingredients1).toContain("krossade tomater");

    const text2 = "Kylskåpstömning: jag har ägg, potatis och bacon i kylen";
    const ingredients2 = parseFridgeQueryIngredients(text2);
    expect(ingredients2).toContain("ägg");
    expect(ingredients2).toContain("potatis");
    expect(ingredients2).toContain("bacon");
  });

  it("generates protein-rich meal suggestions matching supplied ingredients", () => {
    const suggestions = generateFridgeMealSuggestions(["köttfärs", "pasta", "lök"]);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    const first = suggestions[0];
    expect(first.title).toBeDefined();
    expect(first.estimatedProteinGrams).toBeGreaterThanOrEqual(30); // High protein focus for Projekt 100
    expect(first.cookingTimeMinutes).toBeLessThanOrEqual(45);
    expect(first.usedIngredients.length).toBeGreaterThanOrEqual(2);
  });

  it("identifies missing pantry staples and formats clean response with shopping list offer", () => {
    const suggestions = generateFridgeMealSuggestions(["kyckling", "ris"]);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    const first = suggestions[0];
    expect(first.suggestedAdditions).toBeDefined();
    expect(Array.isArray(first.suggestedAdditions)).toBe(true);
  });

  it("detects fridge meal and recipe queries accurately", () => {
    expect(isFridgeMealQuery("Vad kan vi laga på köttfärs och pasta?")).toBe(true);
    expect(isFridgeMealQuery("Kylskåpstömning: har ägg och potatis")).toBe(true);
    expect(isFridgeMealQuery("Middagsförslag ikväll")).toBe(true);
    expect(isFridgeMealQuery("Vad är koden till förrådet?")).toBe(false);
  });
});
