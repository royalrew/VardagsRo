import { z } from "zod";

import { isKnownProject100Metric } from "@/lib/project100-body";
import {
  project100CalendarDateSchema,
  project100OptionalText,
} from "@/server/project100-schemas";

const metricSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, "Ogiltigt mått");

/**
 * One measured thing. A value the user typed is kept as they typed it; the
 * server only refuses what a scale or a tape measure could never produce.
 */
export const project100MeasurementInputSchema = z
  .object({
    metric: metricSlugSchema,
    label: z.string().trim().min(1).max(40).nullable().default(null),
    unit: z.enum(["kg", "cm"]),
    value: z.number().finite().gt(0).lt(1_000),
  })
  .strict()
  .superRefine((measurement, ctx) => {
    if (!isKnownProject100Metric(measurement.metric) && measurement.label === null) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: "Ett eget mått behöver ett namn",
      });
    }
    if (measurement.unit === "kg" && measurement.value >= 400) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Vikten ser inte rimlig ut" });
    }
    if (measurement.unit === "cm" && measurement.value >= 300) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Måttet ser inte rimligt ut" });
    }
  });

export const project100BodyEntrySchema = z
  .object({
    measuredOn: project100CalendarDateSchema,
    note: project100OptionalText(1_000),
    measurements: z
      .array(project100MeasurementInputSchema)
      .max(30)
      .superRefine((measurements, ctx) => {
        const seen = new Set<string>();
        for (const measurement of measurements) {
          if (seen.has(measurement.metric)) {
            ctx.addIssue({
              code: "custom",
              message: `Måttet ${measurement.metric} förekommer två gånger samma dag`,
            });
          }
          seen.add(measurement.metric);
        }
      }),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.measurements.length === 0 && entry.note === null) {
      ctx.addIssue({
        code: "custom",
        path: ["measurements"],
        message: "Skriv minst ett mått eller en anteckning",
      });
    }
  });

export const project100BodyPeriodSchema = z
  .object({
    from: project100CalendarDateSchema.nullable().default(null),
    to: project100CalendarDateSchema.nullable().default(null),
  })
  .strict()
  .superRefine((period, ctx) => {
    if (period.from !== null && period.to !== null && period.from > period.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Perioden slutar före den börjar" });
    }
  });

export const project100SettingsSchema = z
  .object({
    weightGoalKg: z.number().finite().gt(0).lt(400).nullable().default(null),
    startWeightKg: z.number().finite().gt(0).lt(400).nullable().default(null),
    heightCm: z.number().finite().gt(50).lt(260).nullable().default(null),
    // The computed protein range is never stored; only the user's own override.
    proteinTargetG: z.number().finite().gt(0).lt(600).nullable().default(null),
  })
  .strict();

export type Project100BodyEntryInput = z.infer<typeof project100BodyEntrySchema>;
export type Project100BodyPeriod = z.infer<typeof project100BodyPeriodSchema>;
export type Project100SettingsInput = z.infer<typeof project100SettingsSchema>;
