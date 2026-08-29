import { z } from "zod";

import {
  project100CalendarDateSchema,
  project100OptionalText,
} from "@/server/project100-schemas";

const scaleSchema = z.number().int().min(1).max(5).nullable().default(null);

export const project100JournalEntrySchema = z
  .object({
    writtenOn: project100CalendarDateSchema,
    body: project100OptionalText(20_000),
    mood: scaleSchema,
    energy: scaleSchema,
    sleepHours: z.number().finite().min(0).max(24).nullable().default(null),
    excludedFromAi: z.boolean().default(false),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.body === null &&
      entry.mood === null &&
      entry.energy === null &&
      entry.sleepHours === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Skriv något eller fyll i dagsformen",
      });
    }
  });

export const project100JournalFilterSchema = z
  .object({
    from: project100CalendarDateSchema.nullable().default(null),
    to: project100CalendarDateSchema.nullable().default(null),
    // Searching your own writing is a read of your own rows; the text is only
    // ever used as a bound parameter, never spliced into a statement.
    query: z.string().trim().min(2).max(120).nullable().default(null),
  })
  .strict()
  .superRefine((filter, ctx) => {
    if (filter.from !== null && filter.to !== null && filter.from > filter.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Perioden slutar före den börjar" });
    }
  });

export type Project100JournalEntryInput = z.infer<typeof project100JournalEntrySchema>;
export type Project100JournalFilter = z.infer<typeof project100JournalFilterSchema>;
