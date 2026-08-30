import { z } from "zod";

import { project100CalendarDateSchema } from "@/server/project100-schemas";

export const project100InsightPeriodPresetSchema = z.enum([
  "30d",
  "90d",
  "180d",
  "year",
  "custom",
]);

export const project100InsightsQuerySchema = z.object({
  period: project100InsightPeriodPresetSchema.optional().default("30d"),
  from: project100CalendarDateSchema.optional().nullable().default(null),
  to: project100CalendarDateSchema.optional().nullable().default(null),
});

export type Project100InsightsQuery = z.infer<typeof project100InsightsQuerySchema>;
