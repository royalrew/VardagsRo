import { z } from "zod";

import {
  project100CalendarDateSchema as calendarDateSchema,
  project100IdSchema as routeIdSchema,
  project100OptionalText as optionalText,
} from "@/server/project100-schemas";
import { project100ActivityTypeSchema } from "@/server/project100-training-schemas";

export const project100QuickLogWorkoutSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("planned"),
      plannedSessionId: routeIdSchema,
      sessionDate: calendarDateSchema,
      durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
      effort: z.number().int().min(1).max(10).nullable().default(null),
      notes: optionalText(3_000),
      followedPlan: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      mode: z.literal("template"),
      templateId: routeIdSchema,
      title: z.string().trim().min(1).max(160).optional(),
      sessionDate: calendarDateSchema,
      durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
      effort: z.number().int().min(1).max(10).nullable().default(null),
      notes: optionalText(3_000),
      followedPlan: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      mode: z.literal("custom"),
      title: z.string().trim().min(1).max(160),
      activityType: project100ActivityTypeSchema.default("strength_home"),
      sessionDate: calendarDateSchema,
      durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
      effort: z.number().int().min(1).max(10).nullable().default(null),
      notes: optionalText(3_000),
    })
    .strict(),
]);

export const project100QuickLogJournalSchema = z
  .object({
    energy: z.number().int().min(1).max(5).nullable().default(null),
    mood: z.number().int().min(1).max(5).nullable().default(null),
    reflection: optionalText(4_000),
  })
  .strict();

export const project100QuickLogProteinShakeSchema = z
  .object({
    enabled: z.boolean().default(false),
    proteinG: z.number().finite().min(1).max(300).default(35),
    kcal: z.number().finite().min(0).max(5000).nullable().default(null),
    title: z.string().trim().min(1).max(160).default("Post-workout Proteinshake"),
  })
  .strict();

export const project100QuickLogSchema = z
  .object({
    workout: project100QuickLogWorkoutSchema,
    journal: project100QuickLogJournalSchema.nullable().default(null),
    proteinShake: project100QuickLogProteinShakeSchema.nullable().default(null),
  })
  .strict();

export type Project100QuickLogWorkoutInput = z.infer<typeof project100QuickLogWorkoutSchema>;
export type Project100QuickLogJournalInput = z.infer<typeof project100QuickLogJournalSchema>;
export type Project100QuickLogProteinShakeInput = z.infer<typeof project100QuickLogProteinShakeSchema>;
export type Project100QuickLogInput = z.infer<typeof project100QuickLogSchema>;

export interface Project100QuickLogResult {
  success: boolean;
  sessionId: string;
  sessionTitle: string;
  workoutMode: "planned" | "template" | "custom";
  journalUpdated: boolean;
  proteinAddedG: number | null;
  receipt: string;
}
