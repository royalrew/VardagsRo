import { z } from "zod";

/**
 * Primitives shared by every Projekt 100 contract. Ids appear in routes, dates
 * are calendar days in the household's timezone rather than instants, and free
 * text is always length-capped before it reaches a table.
 */

export const project100IdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, "Ogiltigt id");

export const project100CalendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Måste vara ett datum på formen ÅÅÅÅ-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
  }, "Datumet finns inte");

export const project100IsoDateTimeSchema = z
  .string()
  .trim()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), "Ogiltigt datum eller klockslag");

export function project100OptionalText(max: number) {
  return z.string().trim().max(max).nullable().default(null);
}
