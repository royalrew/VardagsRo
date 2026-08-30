import { z } from "zod";

import { PROJECT100_CONTENT_STATUSES } from "@/lib/project100-content";

export const shotlistItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Scenrubrik krävs.").max(200),
  completed: z.boolean().default(false),
  note: z.string().trim().max(500).nullable().optional(),
});

export const thumbnailIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Idérubrik krävs.").max(200),
  concept: z.string().trim().max(1000).nullable().optional(),
});

export const createContentProjectSchema = z.object({
  title: z.string().trim().min(1, "Projekttitel krävs.").max(200),
  hook: z.string().trim().max(1000).nullable().optional(),
  concept: z.string().trim().max(2000).nullable().optional(),
  script: z.string().trim().max(50000).nullable().optional(),
  status: z.enum(PROJECT100_CONTENT_STATUSES).default("idea"),
  targetPublishDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (ÅÅÅÅ-MM-DD).")
    .nullable()
    .optional(),
});

export type CreateContentProjectInput = z.infer<typeof createContentProjectSchema>;

export const updateContentProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  hook: z.string().trim().max(1000).nullable().optional(),
  concept: z.string().trim().max(2000).nullable().optional(),
  script: z.string().trim().max(50000).nullable().optional(),
  status: z.enum(PROJECT100_CONTENT_STATUSES).optional(),
  targetPublishDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datumformat (ÅÅÅÅ-MM-DD).")
    .nullable()
    .optional(),
  publishedUrl: z.string().trim().max(500).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  thumbnailIdeas: z.array(thumbnailIdeaSchema).optional(),
  shotlist: z.array(shotlistItemSchema).optional(),
});

export type UpdateContentProjectInput = z.infer<typeof updateContentProjectSchema>;

export const attachMediaSchema = z.object({
  mediaId: z.string().min(1, "Media-id krävs."),
  caption: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

export type AttachMediaInput = z.infer<typeof attachMediaSchema>;
