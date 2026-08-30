import { z } from "zod";

import { PROJECT100_MUSCLE_GROUPS } from "@/lib/project100-strength";

export const project100ExerciseMuscleGroupsSchema = z
  .object({
    muscleGroups: z.array(z.enum(PROJECT100_MUSCLE_GROUPS)).max(PROJECT100_MUSCLE_GROUPS.length),
  })
  .strict()
  .transform((input) => ({
    muscleGroups: [...new Set(input.muscleGroups)],
  }));

export type Project100ExerciseMuscleGroupsInput = z.infer<
  typeof project100ExerciseMuscleGroupsSchema
>;
