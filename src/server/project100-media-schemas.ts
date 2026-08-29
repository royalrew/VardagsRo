import { z } from "zod";

import {
  project100CalendarDateSchema,
  project100IdSchema,
  project100OptionalText,
} from "@/server/project100-schemas";
import { PROJECT100_MEDIA_CATEGORIES } from "@/server/storage";

export const project100MediaCategorySchema = z.enum(PROJECT100_MEDIA_CATEGORIES);

const pixelSchema = z.coerce.number().int().min(1).max(20_000).nullable().default(null);

/**
 * Everything the client may decide about an upload. The storage key, the owner
 * and the checksum are the server's to write; asking for them here would let a
 * form claim someone else's object.
 */
export const project100MediaCreateSchema = z
  .object({
    category: project100MediaCategorySchema,
    capturedOn: project100CalendarDateSchema,
    caption: project100OptionalText(500),
    sessionId: project100IdSchema.nullable().default(null),
    width: pixelSchema,
    height: pixelSchema,
  })
  .strict();

export const project100MediaFilterSchema = z
  .object({
    category: project100MediaCategorySchema.nullable().default(null),
    limit: z.coerce.number().int().min(1).max(120).default(60),
  })
  .strict();

export const project100MediaIdSchema = project100IdSchema;

export type Project100MediaCreateInput = z.infer<typeof project100MediaCreateSchema>;
export type Project100MediaFilter = z.infer<typeof project100MediaFilterSchema>;
