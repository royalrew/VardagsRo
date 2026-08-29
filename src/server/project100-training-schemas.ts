import { z } from "zod";

import {
  PROJECT100_ACTIVITY_TYPES,
} from "@/lib/project100-training";
import {
  project100CalendarDateSchema as calendarDateSchema,
  project100IdSchema as routeIdSchema,
  project100IsoDateTimeSchema as isoDateTimeSchema,
  project100OptionalText as optionalText,
} from "@/server/project100-schemas";

const nullableMetric = z.number().finite().min(0).nullable().default(null);

export const project100ActivityTypeSchema = z.enum(PROJECT100_ACTIVITY_TYPES);

export const project100SetInputSchema = z
  .object({
    reps: z.number().int().min(0).max(10_000).nullable().default(null),
    weightKg: nullableMetric.pipe(z.number().max(4_999).nullable()),
    durationSeconds: z.number().int().min(0).max(604_800).nullable().default(null),
    distanceMeters: z.number().int().min(0).max(10_000_000).nullable().default(null),
    rpe: z.number().min(1).max(10).nullable().default(null),
  })
  .strict()
  .refine(
    (set) =>
      set.reps !== null ||
      set.weightKg !== null ||
      set.durationSeconds !== null ||
      set.distanceMeters !== null ||
      set.rpe !== null,
    "Setet behöver minst ett värde",
  );

export const project100ExerciseInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    notes: optionalText(500),
    sets: z.array(project100SetInputSchema).min(1).max(100),
  })
  .strict();

const exerciseArraySchema = z
  .array(project100ExerciseInputSchema)
  .max(60)
  .superRefine((exercises, ctx) => {
    const setCount = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    if (setCount > 500) {
      ctx.addIssue({ code: "custom", message: "Ett pass får innehålla högst 500 set" });
    }
  });

export const project100SessionCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    activityType: project100ActivityTypeSchema,
    status: z.enum(["planned", "completed"]),
    sessionDate: calendarDateSchema,
    templateId: routeIdSchema.nullable().default(null),
    plannedStartAt: isoDateTimeSchema.nullable().default(null),
    plannedEndAt: isoDateTimeSchema.nullable().default(null),
    durationSeconds: z.number().int().min(0).max(604_800).nullable().default(null),
    location: optionalText(200),
    effort: z.number().int().min(1).max(10).nullable().default(null),
    bodyBefore: optionalText(1_000),
    bodyAfter: optionalText(1_000),
    notes: optionalText(3_000),
    exercises: exerciseArraySchema.default([]),
  })
  .strict()
  .superRefine((session, ctx) => {
    if (session.plannedEndAt !== null && session.plannedStartAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["plannedStartAt"],
        message: "Starttid krävs när sluttid anges",
      });
    }
    if (
      session.plannedStartAt !== null &&
      session.plannedEndAt !== null &&
      Date.parse(session.plannedEndAt) <= Date.parse(session.plannedStartAt)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["plannedEndAt"],
        message: "Sluttiden måste vara efter starttiden",
      });
    }
    if (session.status === "completed" && session.exercises.length === 0 && session.durationSeconds === null) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises"],
        message: "Ett genomfört pass behöver övningar eller en totaltid",
      });
    }
  });

export const project100TemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    activityType: project100ActivityTypeSchema,
    description: optionalText(1_000),
    exercises: exerciseArraySchema.min(1),
  })
  .strict();

/**
 * What may happen to a session that has already been planned. A plan is allowed
 * to move, to be carried out, or to be dropped — but never to be rewritten into
 * something that claims it always looked that way.
 */
const performedSetSchema = z
  .object({
    id: routeIdSchema,
    reps: z.number().int().min(0).max(10_000).nullable().default(null),
    weightKg: z.number().finite().min(0).max(4_999).nullable().default(null),
    durationSeconds: z.number().int().min(0).max(604_800).nullable().default(null),
    distanceMeters: z.number().int().min(0).max(10_000_000).nullable().default(null),
    rpe: z.number().min(1).max(10).nullable().default(null),
    completed: z.boolean().default(true),
  })
  .strict();

export const project100SessionUpdateSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("complete"),
      sessionDate: calendarDateSchema,
      durationSeconds: z.number().int().min(0).max(604_800).nullable().default(null),
      location: optionalText(200),
      effort: z.number().int().min(1).max(10).nullable().default(null),
      bodyBefore: optionalText(1_000),
      bodyAfter: optionalText(1_000),
      notes: optionalText(3_000),
      sets: z.array(performedSetSchema).max(500).default([]),
    })
    .strict()
    .superRefine((session, ctx) => {
      if (session.sets.length === 0 && session.durationSeconds === null) {
        ctx.addIssue({
          code: "custom",
          path: ["sets"],
          message: "Ett genomfört pass behöver set eller en totaltid",
        });
      }
    }),
  z
    .object({
      action: z.literal("skip"),
      notes: optionalText(3_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      sessionDate: calendarDateSchema,
      plannedStartAt: isoDateTimeSchema.nullable().default(null),
      plannedEndAt: isoDateTimeSchema.nullable().default(null),
    })
    .strict()
    .superRefine((session, ctx) => {
      if (session.plannedEndAt !== null && session.plannedStartAt === null) {
        ctx.addIssue({
          code: "custom",
          path: ["plannedStartAt"],
          message: "Starttid krävs när sluttid anges",
        });
      }
      if (
        session.plannedStartAt !== null &&
        session.plannedEndAt !== null &&
        Date.parse(session.plannedEndAt) <= Date.parse(session.plannedStartAt)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["plannedEndAt"],
          message: "Sluttiden måste vara efter starttiden",
        });
      }
    }),
]);

export type Project100SessionUpdateInput = z.infer<typeof project100SessionUpdateSchema>;

export const project100TrainingIdSchema = routeIdSchema;

export type Project100SessionCreateInput = z.infer<typeof project100SessionCreateSchema>;
export type Project100TemplateCreateInput = z.infer<typeof project100TemplateCreateSchema>;
