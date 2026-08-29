import { z } from "zod";

import {
  PROJECT100_MEAL_TYPES,
  PROJECT100_SUPPLEMENT_KINDS,
} from "@/lib/project100-nutrition";
import {
  project100CalendarDateSchema,
  project100IdSchema,
  project100OptionalText,
} from "@/server/project100-schemas";

const per100gSchema = z.number().finite().min(0).max(100);

export const project100FoodSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    proteinPer100g: per100gSchema,
    carbsPer100g: per100gSchema,
    fatPer100g: per100gSchema,
    kcalPer100g: z.number().finite().min(0).max(950).nullable().default(null),
    isStaple: z.boolean().default(false),
    stapleTargetGrams: z.number().int().min(1).max(100_000).nullable().default(null),
  })
  .strict()
  .superRefine((food, ctx) => {
    if (food.proteinPer100g + food.carbsPer100g + food.fatPer100g > 100.5) {
      ctx.addIssue({
        code: "custom",
        path: ["proteinPer100g"],
        message: "Protein, kolhydrater och fett kan inte vara mer än 100 g per 100 g",
      });
    }
    if (!food.isStaple && food.stapleTargetGrams !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["stapleTargetGrams"],
        message: "Bara en basvara har en mängd att alltid ha hemma",
      });
    }
  });

export const project100BatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    cookedOn: project100CalendarDateSchema,
    portionsTotal: z.number().finite().gt(0).max(100),
    note: project100OptionalText(1_000),
    items: z
      .array(
        z
          .object({
            foodId: project100IdSchema,
            grams: z.number().finite().gt(0).max(100_000),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

/**
 * A meal is either measured by the user or taken from a batch. The macros of a
 * batch portion are computed on the server; a client that could send its own
 * numbers for a batch meal could quietly rewrite what a portion contains.
 */
export const project100MealSchema = z
  .discriminatedUnion("source", [
    z
      .object({
        source: z.literal("batch"),
        batchId: project100IdSchema,
        portions: z.number().finite().gt(0).max(20).default(1),
        eatenOn: project100CalendarDateSchema,
        eatenAtMinute: z.number().int().min(0).max(1_439).nullable().default(null),
        mealType: z.enum(PROJECT100_MEAL_TYPES),
        hungerBefore: z.number().int().min(1).max(5).nullable().default(null),
        fullnessAfter: z.number().int().min(1).max(5).nullable().default(null),
        note: project100OptionalText(1_000),
        mediaId: project100IdSchema.nullable().default(null),
      })
      .strict(),
    z
      .object({
        source: z.enum(["manual", "estimate"]),
        title: z.string().trim().min(1).max(160),
        eatenOn: project100CalendarDateSchema,
        eatenAtMinute: z.number().int().min(0).max(1_439).nullable().default(null),
        mealType: z.enum(PROJECT100_MEAL_TYPES),
        proteinG: z.number().finite().min(0).max(1_000).nullable().default(null),
        carbsG: z.number().finite().min(0).max(2_000).nullable().default(null),
        fatG: z.number().finite().min(0).max(1_000).nullable().default(null),
        kcal: z.number().finite().min(0).max(20_000).nullable().default(null),
        hungerBefore: z.number().int().min(1).max(5).nullable().default(null),
        fullnessAfter: z.number().int().min(1).max(5).nullable().default(null),
        note: project100OptionalText(1_000),
        mediaId: project100IdSchema.nullable().default(null),
      })
      .strict(),
  ]);

export const project100SupplementSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(PROJECT100_SUPPLEMENT_KINDS),
    doseAmount: z.number().finite().gt(0).max(10_000).nullable().default(null),
    doseUnit: z.enum(["g", "mg", "ml", "st"]).nullable().default(null),
    purpose: project100OptionalText(300),
    timingMatters: z.boolean().default(false),
    timingNote: project100OptionalText(300),
  })
  .strict()
  .superRefine((supplement, ctx) => {
    if (supplement.timingNote !== null && !supplement.timingMatters) {
      ctx.addIssue({
        code: "custom",
        path: ["timingNote"],
        message: "En tidpunkt anges bara när tidpunkten har betydelse",
      });
    }
    if ((supplement.doseAmount === null) !== (supplement.doseUnit === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["doseUnit"],
        message: "Ange både mängd och enhet, eller ingendera",
      });
    }
  });

export const project100NutritionDaySchema = z
  .object({ day: project100CalendarDateSchema.nullable().default(null) })
  .strict();

export type Project100FoodInput = z.infer<typeof project100FoodSchema>;
export type Project100BatchInput = z.infer<typeof project100BatchSchema>;
export type Project100MealInput = z.infer<typeof project100MealSchema>;
export type Project100SupplementInput = z.infer<typeof project100SupplementSchema>;
