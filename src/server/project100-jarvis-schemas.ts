import { z } from "zod";

import { PROJECT100_MEMORY_CATEGORIES } from "@/lib/project100-jarvis";
import { project100IdSchema, project100OptionalText } from "@/server/project100-schemas";

export const project100MemoryKindSchema = z.enum(["fact", "event", "learning"]);
export const project100MemoryCategorySchema = z.enum(PROJECT100_MEMORY_CATEGORIES);

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(160).optional().default("Ny konversation"),
});

export const sendJarvisMessageSchema = z.object({
  conversationId: project100IdSchema.optional().nullable().default(null),
  content: z.string().trim().min(1).max(4000),
});

export const createMemorySchema = z.object({
  kind: project100MemoryKindSchema,
  category: project100MemoryCategorySchema,
  content: z.string().trim().min(1).max(1000),
  sourceRef: project100OptionalText(200),
});

export const updateMemorySchema = z.object({
  isActive: z.boolean().optional(),
  content: z.string().trim().min(1).max(1000).optional(),
  category: project100MemoryCategorySchema.optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendJarvisMessageInput = z.infer<typeof sendJarvisMessageSchema>;
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
