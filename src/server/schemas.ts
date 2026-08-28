import { z } from "zod";

import type {
  ConfirmDocumentInput,
  DashboardData,
  FamilyEvent,
  FamilyTask,
  QuestionPlan,
} from "@/lib/types";
import {
  SOLO_ACTION_KINDS,
  soloActionRule,
  type SoloActionKind,
} from "@/lib/solo";

const isoDateTime = z
  .string()
  .trim()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), "Måste vara ett giltigt datum och klockslag");

/** A calendar day in the household's own timezone, as YYYY-MM-DD. */
const calendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Måste vara ett datum på formen ÅÅÅÅ-MM-DD");

export const eventCategorySchema = z.enum([
  "work",
  "school",
  "sport",
  "health",
  "family",
  "other",
]);

const sourceBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();

export const extractedEventSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(200),
    category: eventCategorySchema,
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    allDay: z.boolean(),
    location: z.string().trim().max(300).nullable(),
    notes: z.string().trim().min(1).max(2_000).nullable(),
    confidence: z.number().min(0).max(1),
    sourceExcerpt: z.string().trim().max(800),
    sourceBoxes: z.array(sourceBoxSchema).max(20).nullable().optional(),
  })
  .strict()
  .refine(
    (event) => Date.parse(event.endsAt) > Date.parse(event.startsAt),
    { message: "Sluttiden måste vara efter starttiden", path: ["endsAt"] },
  );

export const taskKindSchema = z.enum([
  "homework",
  "exam",
  "bring",
  "form",
  "preparation",
  "other",
]);

export const extractedTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(200),
    kind: taskKindSchema,
    dueAt: isoDateTime.nullable(),
    notes: z.string().trim().min(1).max(1_000).nullable(),
    confidence: z.number().min(0).max(1),
    sourceExcerpt: z.string().trim().max(800),
  })
  .strict();

export const documentExtractionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    documentType: z.string().trim().min(1).max(100),
    summary: z.string().trim().max(1_000),
    personHint: z.string().trim().max(100),
    personId: z.string().trim().max(128).nullable(),
    periodLabel: z.string().trim().max(100),
    events: z.array(extractedEventSchema).max(100),
    tasks: z.array(extractedTaskSchema).max(100),
    originalFilename: z.string().trim().min(1).max(200),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    storageKey: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/documents\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp|pdf)$/i,
      )
      .nullable(),
    hash: z.string().trim().min(1).max(128),
    sourcePage: z
      .object({ widthPx: z.number().int().positive(), heightPx: z.number().int().positive() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export const confirmDocumentSchema: z.ZodType<ConfirmDocumentInput> = z
  .object({
    extraction: documentExtractionSchema,
    personId: z.string().trim().min(1).max(128),
    events: z.array(extractedEventSchema).max(100),
    tasks: z.array(extractedTaskSchema).max(100),
    repeatWeeklyUntil: calendarDateSchema.nullable().optional(),
  })
  .strict();

export const questionPlanSchema: z.ZodType<QuestionPlan> = z
  .object({
    language: z.enum(["sv", "so"]).optional(),
    from: isoDateTime,
    to: isoDateTime,
    personIds: z.array(z.string().trim().min(1).max(128)).max(20),
    activityTerms: z.array(z.string().trim().min(1).max(80)).max(20),
    intent: z.enum(["schedule", "work", "overlap", "reminder"]),
    needsOverlap: z.boolean(),
  })
  .strict()
  .refine((plan) => Date.parse(plan.to) > Date.parse(plan.from), {
    message: "Slutdatumet måste vara efter startdatumet",
    path: ["to"],
  });

const personSchema = z
  .object({
    id: z.string().max(128),
    householdId: z.string().max(128),
    name: z.string().max(100),
    role: z.string().max(100),
    personType: z.enum(["adult", "child"]),
    aliases: z.array(z.string().max(100)).max(20),
    initials: z.string().max(10),
    color: z.string().max(50),
    tint: z.string().max(50),
  })
  .strict();

const eventSchema: z.ZodType<FamilyEvent> = z
  .object({
    id: z.string().max(128),
    householdId: z.string().max(128),
    personId: z.string().max(128).nullable(),
    documentId: z.string().max(128).nullable(),
    title: z.string().max(200),
    category: eventCategorySchema,
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    allDay: z.boolean(),
    location: z.string().max(300).nullable(),
    notes: z.string().max(2_000).nullable(),
    status: z.enum(["confirmed", "needs_review"]),
    confidence: z.number().min(0).max(1),
    sourceExcerpt: z.string().max(800).nullable(),
  })
  .strict();

const taskSchema: z.ZodType<FamilyTask> = z
  .object({
    id: z.string().max(128),
    householdId: z.string().max(128),
    personId: z.string().max(128),
    documentId: z.string().max(128).nullable(),
    title: z.string().max(200),
    kind: taskKindSchema,
    dueAt: isoDateTime.nullable(),
    completedAt: isoDateTime.nullable(),
    notes: z.string().max(1_000).nullable(),
    reviewStatus: z.enum(["confirmed", "needs_review"]),
    confidence: z.number().min(0).max(1),
    sourceExcerpt: z.string().max(800).nullable(),
  })
  .strict();

const documentSchema = z
  .object({
    id: z.string().max(128),
    householdId: z.string().max(128),
    title: z.string().max(200),
    filename: z.string().max(200),
    mimeType: z.string().max(100),
    documentType: z.string().max(100),
    personId: z.string().max(128).nullable(),
    folderId: z.string().max(128).nullable(),
    status: z.enum(["confirmed", "needs_review"]),
    uploadedAt: isoDateTime,
    periodLabel: z.string().max(100),
    summary: z.string().max(1_000),
    storageKey: z.string().max(300).nullable(),
    hash: z.string().max(128).nullable().optional(),
    eventsCount: z.number().int().min(0).max(10_000),
    tasksCount: z.number().int().min(0).max(10_000),
  })
  .strict();

export const askContextSchema: z.ZodType<
  Pick<
    DashboardData,
    "people" | "events" | "tasks" | "documents" | "currentPersonId" | "timezone"
  >
> = z
  .object({
    people: z.array(personSchema).max(30),
    events: z.array(eventSchema).max(2_000),
    tasks: z.array(taskSchema).max(2_000),
    documents: z.array(documentSchema).max(1_000),
    currentPersonId: z.string().max(128),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();

export const askRequestSchema = z
  .object({
    question: z.string().trim().min(2).max(1_000),
    context: askContextSchema.optional(),
  })
  .strict();

export const undoRequestSchema = z
  .object({ id: z.string().trim().regex(/^\d{1,19}$/, "Ogiltigt ångra-id") })
  .strict();

export const householdLoginSchema = z
  .object({
    personId: z.string().trim().min(1).max(128),
    email: z.string().trim().min(3).max(200).toLowerCase().refine(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Ange en giltig e-postadress",
    ),
    // Same floor as the login form itself, so a password made here is never
    // one the person could not have chosen themselves.
    password: z.string().min(12).max(128),
    role: z.enum(["adult", "viewer"]),
  })
  .strict();

export type HouseholdLoginInput = z.infer<typeof householdLoginSchema>;

export const telegramLinkSchema = z
  .object({
    code: z.string().trim().min(8).max(16),
    personId: z.string().trim().min(1).max(128),
  })
  .strict();

export const telegramUnlinkSchema = z
  .object({ personId: z.string().trim().min(1).max(128) })
  .strict();

export const manualEventSchema = z
  .object({
    // null is the whole family, not a missing value.
    personId: z.string().trim().min(1).max(128).nullable(),
    title: z.string().trim().min(1).max(200),
    category: eventCategorySchema.default("other"),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    allDay: z.boolean().default(false),
    location: z.string().trim().max(300).nullable().default(null),
    notes: z.string().trim().min(1).max(2_000).nullable().default(null),
  })
  .strict()
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: "Sluttiden måste vara efter starttiden",
    path: ["endsAt"],
  });

export type ManualEventInput = z.infer<typeof manualEventSchema>;

export const eventUpdateSchema = z
  .object({
    personId: z.string().trim().min(1).max(128).nullable(),
    title: z.string().trim().min(1).max(200),
    category: eventCategorySchema,
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    allDay: z.boolean(),
    location: z.string().trim().max(300).nullable(),
    notes: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: "Sluttiden måste vara efter starttiden",
    path: ["endsAt"],
  });

export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const manualTaskSchema = z
  .object({
    personId: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(200),
    kind: taskKindSchema.default("other"),
    dueAt: isoDateTime.nullable().default(null),
    notes: z.string().trim().min(1).max(1_000).nullable().default(null),
  })
  .strict();

export const taskCompletionSchema = z
  .object({
    completed: z.boolean(),
  })
  .strict();

export type ManualTaskInput = z.infer<typeof manualTaskSchema>;

const folderIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, "Ogiltigt mapp-id");

const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Mappnamnet saknas")
  .max(80, "Mappnamnet f\u00e5r vara h\u00f6gst 80 tecken")
  .refine((value) => !/[\u0000-\u001f\\/]/.test(value), "Mappnamnet inneh\u00e5ller ogiltiga tecken");

export const folderCreateSchema = z
  .object({
    name: folderNameSchema,
    parentId: folderIdSchema.nullable().default(null),
  })
  .strict();

export const folderUpdateSchema = z
  .object({
    name: folderNameSchema.optional(),
    parentId: folderIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.parentId !== undefined, {
    message: "Ingen mapp\u00e4ndring angavs",
  });

const personNameSchema = z
  .string()
  .trim()
  .min(1, "Namnet saknas")
  .max(60, "Namnet får vara högst 60 tecken")
  .refine((value) => !/[\u0000-\u001f]/.test(value), "Namnet innehåller ogiltiga tecken");

const personRoleSchema = z
  .string()
  .trim()
  .min(1, "Rollen saknas")
  .max(40, "Rollen får vara högst 40 tecken")
  .refine((value) => !/[\u0000-\u001f]/.test(value), "Rollen innehåller ogiltiga tecken");

/**
 * Aliases feed name matching in the question engine, so they are trimmed,
 * de-duplicated case-insensitively and stripped of empties before storage.
 */
const personTypeSchema = z.enum(["adult", "child"]);

const personAliasesSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(20, "Högst 20 smeknamn per person")
  .transform((values) => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const value of values) {
      const key = value.toLocaleLowerCase("sv-SE");
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(value);
    }
    return unique;
  });

export const personCreateSchema = z
  .object({
    name: personNameSchema,
    role: personRoleSchema,
    personType: personTypeSchema,
    aliases: personAliasesSchema.default([]),
  })
  .strict();

export const personUpdateSchema = z
  .object({
    name: personNameSchema.optional(),
    role: personRoleSchema.optional(),
    personType: personTypeSchema.optional(),
    aliases: personAliasesSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.role !== undefined ||
      value.personType !== undefined ||
      value.aliases !== undefined,
    { message: "Ingen personändring angavs" },
  );

export const householdUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Familjenamnet saknas")
      .max(80, "Familjenamnet får vara högst 80 tecken")
      .refine((value) => !/[\u0000-\u001f]/.test(value), "Familjenamnet innehåller ogiltiga tecken"),
  })
  .strict();

export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
export type HouseholdUpdateInput = z.infer<typeof householdUpdateSchema>;

export const documentOrganizationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    folderId: folderIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.folderId !== undefined, {
    message: "Ingen dokument\u00e4ndring angavs",
  });

export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type FolderUpdateInput = z.infer<typeof folderUpdateSchema>;
export type DocumentOrganizationInput = z.infer<typeof documentOrganizationSchema>;

/**
 * Derived from the rules rather than restated, so the accepted kinds cannot
 * drift away from the ones that carry experience. The list is never empty.
 */
const soloActionKinds = SOLO_ACTION_KINDS as [SoloActionKind, ...SoloActionKind[]];

export const soloActionKindSchema = z.enum(soloActionKinds);

/**
 * Evidence is the whole point of the ledger, so it is required here and again
 * in the database. An entry nobody could check is a wish, and wishes already
 * had a decade.
 */
export const soloActionSchema = z
  .object({
    kind: soloActionKindSchema,
    occurredOn: calendarDateSchema,
    evidence: z.string().trim().min(3).max(500),
    amountOre: z.number().int().min(0).max(100_000_000).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const rule = soloActionRule(value.kind);
    if (rule.amount === "required" && (value.amountOre ?? 0) <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amountOre"],
        message: "Ett belopp krävs när pengar faktiskt kommit in.",
      });
    }
    if (rule.amount === "none" && value.amountOre !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["amountOre"],
        message: "Den här handlingen har inget belopp.",
      });
    }
  });

export const soloHealthSchema = z
  .object({
    date: calendarDateSchema,
    sleepHours: z.number().min(0).max(24).nullable().default(null),
    workouts: z.number().int().min(0).max(10).default(0),
    weightKg: z.number().min(20).max(400).nullable().default(null),
    energy: z.number().int().min(1).max(5).nullable().default(null),
    dietHeld: z.boolean().nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

export type SoloActionInput = z.infer<typeof soloActionSchema>;
export type SoloHealthInput = z.infer<typeof soloHealthSchema>;
