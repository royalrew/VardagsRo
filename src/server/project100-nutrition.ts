import "server-only";

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  batchPortionMacros,
  buildProject100MealSuggestions,
  buildProject100ProteinTarget,
  deriveShoppingList,
  scaleRecipeIngredients,
  sumMealMacros,
  type Project100Food,
  type Project100Macros,
  type Project100Meal,
  type Project100MealBatch,
  type Project100MealPlan,
  type Project100MealType,
  type Project100NutritionDay,
  type Project100NutritionView,
  type Project100Recipe,
  type Project100RecipeItem,
  type Project100Supplement,
  type Project100SupplementKind,
  type Project100WeeklyMealPlanView,
} from "@/lib/project100-nutrition";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import {
  assertProject100Adult,
  loadProject100WorkHorizon,
  loadProject100WorkSchedule,
  minutesUntilProject100WorkStart,
  nextProject100WorkStart,
} from "@/server/project100";
import type {
  Project100BatchInput,
  Project100CookBatchFromRecipeInput,
  Project100FoodInput,
  Project100MealInput,
  Project100MealPlanInput,
  Project100PantryStockInput,
  Project100ProteinTargetInput,
  Project100RecipeFromBatchInput,
  Project100RecipeFromMealInput,
  Project100RecipeInput,
  Project100RecipeUpdateInput,
  Project100SupplementInput,
} from "@/server/project100-nutrition-schemas";
import { signedProject100MediaUrl, storageIsConfigured } from "@/server/storage";

const FOOD_LIMIT = 200;
const BATCH_LIMIT = 40;
const PREVIEW_TTL_SECONDS = 300;

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function day(value: string): string {
  return value.slice(0, 10);
}

function normalized(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
}

interface FoodRow {
  id: string;
  name: string;
  protein_per_100g: number | string;
  carbs_per_100g: number | string;
  fat_per_100g: number | string;
  kcal_per_100g: number | string | null;
  is_staple: boolean;
  staple_target_grams: number | null;
  in_stock_grams: number | string | null;
}

interface BatchRow {
  id: string;
  name: string;
  cooked_on: string;
  portions_total: number | string;
  portions_left: number | string;
  note: string | null;
}

interface BatchItemRow {
  id: string;
  batch_id: string;
  food_id: string;
  name: string;
  grams: number | string;
  protein_per_100g: number | string;
  carbs_per_100g: number | string;
  fat_per_100g: number | string;
  kcal_per_100g: number | string | null;
}

interface MealRow {
  id: string;
  eaten_on: string;
  eaten_at_minute: number | null;
  meal_type: Project100MealType;
  title: string;
  source: "manual" | "batch" | "estimate";
  batch_id: string | null;
  portions: number | string | null;
  protein_g: number | string | null;
  carbs_g: number | string | null;
  fat_g: number | string | null;
  kcal: number | string | null;
  hunger_before: number | null;
  fullness_after: number | null;
  note: string | null;
  media_id: string | null;
  preview_key: string | null;
}

interface SupplementRow {
  id: string;
  name: string;
  kind: Project100SupplementKind;
  dose_amount: number | string | null;
  dose_unit: "g" | "mg" | "ml" | "st" | null;
  purpose: string | null;
  timing_matters: boolean;
  timing_note: string | null;
}

interface RecipeRow {
  id: string;
  name: string;
  description: string | null;
  servings_default: number | string;
  is_favorite: boolean;
  instructions: string | null;
}

interface RecipeItemRow {
  id: string;
  recipe_id: string;
  food_id: string;
  name: string;
  grams: number | string;
  protein_per_100g: number | string;
  carbs_per_100g: number | string;
  fat_per_100g: number | string;
  kcal_per_100g: number | string | null;
}

interface MealPlanRow {
  id: string;
  planned_date: string;
  planned_minute: number | null;
  meal_type: Project100MealType;
  source: "recipe" | "batch" | "custom";
  recipe_id: string | null;
  batch_id: string | null;
  title: string;
  portions: number | string;
  is_cooked: boolean;
  note: string | null;
}

function food(row: FoodRow): Project100Food {
  return {
    id: row.id,
    name: row.name,
    proteinPer100g: asNumber(row.protein_per_100g) ?? 0,
    carbsPer100g: asNumber(row.carbs_per_100g) ?? 0,
    fatPer100g: asNumber(row.fat_per_100g) ?? 0,
    kcalPer100g: asNumber(row.kcal_per_100g),
    isStaple: row.is_staple,
    stapleTargetGrams: row.staple_target_grams,
    inStockGrams: asNumber(row.in_stock_grams),
  };
}

function supplement(row: SupplementRow): Project100Supplement {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    doseAmount: asNumber(row.dose_amount),
    doseUnit: row.dose_unit,
    purpose: row.purpose,
    timingMatters: row.timing_matters,
    timingNote: row.timing_note,
  };
}

function mapRecipes(rows: RecipeRow[], items: RecipeItemRow[]): Project100Recipe[] {
  const byRecipe = new Map<string, Project100RecipeItem[]>();
  for (const item of items) {
    const list = byRecipe.get(item.recipe_id) ?? [];
    list.push({
      id: item.id,
      foodId: item.food_id,
      name: item.name,
      grams: asNumber(item.grams) ?? 0,
      proteinPer100g: asNumber(item.protein_per_100g) ?? 0,
      carbsPer100g: asNumber(item.carbs_per_100g) ?? 0,
      fatPer100g: asNumber(item.fat_per_100g) ?? 0,
      kcalPer100g: asNumber(item.kcal_per_100g),
    });
    byRecipe.set(item.recipe_id, list);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    servingsDefault: asNumber(row.servings_default) ?? 1,
    isFavorite: row.is_favorite,
    instructions: row.instructions,
    items: byRecipe.get(row.id) ?? [],
  }));
}

function mapMealPlans(rows: MealPlanRow[]): Project100MealPlan[] {
  return rows.map((row) => ({
    id: row.id,
    plannedDate: day(row.planned_date),
    plannedMinute: row.planned_minute,
    mealType: row.meal_type,
    source: row.source,
    recipeId: row.recipe_id,
    batchId: row.batch_id,
    title: row.title,
    portions: asNumber(row.portions) ?? 1,
    isCooked: row.is_cooked,
    note: row.note,
  }));
}

function mapBatches(rows: BatchRow[], items: BatchItemRow[]): Project100MealBatch[] {
  const byBatch = new Map<string, Project100MealBatch["items"]>();
  for (const item of items) {
    const list = byBatch.get(item.batch_id) ?? [];
    list.push({
      id: item.id,
      foodId: item.food_id,
      name: item.name,
      grams: asNumber(item.grams) ?? 0,
      proteinPer100g: asNumber(item.protein_per_100g) ?? 0,
      carbsPer100g: asNumber(item.carbs_per_100g) ?? 0,
      fatPer100g: asNumber(item.fat_per_100g) ?? 0,
      kcalPer100g: asNumber(item.kcal_per_100g),
    });
    byBatch.set(item.batch_id, list);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cookedOn: day(row.cooked_on),
    portionsTotal: asNumber(row.portions_total) ?? 0,
    portionsLeft: asNumber(row.portions_left) ?? 0,
    note: row.note,
    items: byBatch.get(row.id) ?? [],
  }));
}

async function mapMeals(userId: string, rows: MealRow[]): Promise<Project100Meal[]> {
  return Promise.all(
    rows.map(async (row) => {
      let previewUrl: string | null = null;
      if (row.preview_key !== null && storageIsConfigured()) {
        try {
          previewUrl = await signedProject100MediaUrl(
            userId,
            row.preview_key,
            PREVIEW_TTL_SECONDS,
          );
        } catch {
          previewUrl = null;
        }
      }
      return {
        id: row.id,
        eatenOn: day(row.eaten_on),
        eatenAtMinute: row.eaten_at_minute,
        mealType: row.meal_type,
        title: row.title,
        source: row.source,
        batchId: row.batch_id,
        portions: asNumber(row.portions),
        proteinG: asNumber(row.protein_g),
        carbsG: asNumber(row.carbs_g),
        fatG: asNumber(row.fat_g),
        kcal: asNumber(row.kcal),
        hungerBefore: row.hunger_before,
        fullnessAfter: row.fullness_after,
        note: row.note,
        mediaId: row.media_id,
        previewUrl,
      };
    }),
  );
}

/**
 * One day of eating, with everything the page needs to explain itself: the
 * protein range and what it was computed from, what is left in the freezer, and
 * the suggestions those two facts can justify.
 */
export async function loadProject100NutritionDay(
  actor: ActorContext,
  selectedDay: string | null = null,
  nextWorkInMinutes: number | null = null,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<Project100NutritionDay> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const chosen = selectedDay ?? today;
  // A historical day keeps the weight and training evidence that existed then;
  // opening last Tuesday must not silently apply this Sunday's body or pass.
  const trainingThrough = chosen <= today ? chosen : today;
  const weekStart = addCalendarDateDays(trainingThrough, -6);

  const [mealRows, batchRows, batchItemRows, supplementRows, foodRows, weightRows, loadRows, settingsRows] =
    await Promise.all([
      sql<MealRow[]>`
        select m.id, to_char(m.eaten_on, 'YYYY-MM-DD') as eaten_on, m.eaten_at_minute,
               m.meal_type, m.title, m.source, m.batch_id, m.portions, m.protein_g,
               m.carbs_g, m.fat_g, m.kcal, m.hunger_before, m.fullness_after, m.note,
               m.media_id, media.preview_key
        from project100_meals m
        left join project100_media media
          on media.id = m.media_id and media.user_id = m.user_id
        where m.user_id = ${actor.userId} and m.eaten_on = ${chosen}
        order by m.eaten_at_minute nulls last, m.created_at, m.id
      `,
      sql<BatchRow[]>`
        select id, name, to_char(cooked_on, 'YYYY-MM-DD') as cooked_on,
               portions_total, portions_left, note
        from project100_meal_batches
        where user_id = ${actor.userId} and archived_at is null
        order by portions_left > 0 desc, cooked_on desc, id
        limit ${BATCH_LIMIT}
      `,
      sql<BatchItemRow[]>`
        select bi.id, bi.batch_id, bi.food_id, f.name, bi.grams,
               f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.kcal_per_100g
        from project100_meal_batch_items bi
        join project100_foods f on f.id = bi.food_id and f.user_id = bi.user_id
        join project100_meal_batches b on b.id = bi.batch_id and b.user_id = bi.user_id
        where bi.user_id = ${actor.userId} and b.archived_at is null
        order by bi.batch_id, bi.position, bi.id
      `,
      sql<SupplementRow[]>`
        select id, name, kind, dose_amount, dose_unit, purpose, timing_matters, timing_note
        from project100_supplements
        where user_id = ${actor.userId} and archived_at is null
        order by kind, name
      `,
      sql<FoodRow[]>`
        select id, name, protein_per_100g, carbs_per_100g, fat_per_100g,
               kcal_per_100g, is_staple, staple_target_grams, in_stock_grams
        from project100_foods
        where user_id = ${actor.userId} and archived_at is null
        order by is_staple desc, name
        limit ${FOOD_LIMIT}
      `,
      // The basis for the protein range: a real logged weight, never the goal.
      sql<{ value: number | string; measured_on: string }[]>`
        select value, to_char(measured_on, 'YYYY-MM-DD') as measured_on
        from project100_body_measurements
        where user_id = ${actor.userId} and metric = 'weight' and measured_on <= ${trainingThrough}
        order by measured_on desc
        limit 1
      `,
      sql<{ sessions: number | string; minutes: number | string }[]>`
        select count(*)::int as sessions,
               coalesce(sum(duration_seconds), 0)::int / 60 as minutes
        from project100_training_sessions
        where user_id = ${actor.userId}
          and status = 'completed'
          and session_date >= ${weekStart}
          and session_date <= ${trainingThrough}
      `,
      sql<{ protein_target_g: number | string | null }[]>`
        select protein_target_g from project100_settings
        where user_id = ${actor.userId}
        limit 1
      `,
    ]);

  const meals = await mapMeals(actor.userId, mealRows);
  const batches = mapBatches(batchRows, batchItemRows);
  const supplements = supplementRows.map(supplement);
  const foods = foodRows.map(food);
  const target = buildProject100ProteinTarget({
    weightKg: asNumber(weightRows[0]?.value ?? null),
    weightMeasuredOn: weightRows[0] ? day(weightRows[0].measured_on) : null,
    sessionsLast7: asNumber(loadRows[0]?.sessions ?? null) ?? 0,
    minutesLast7: asNumber(loadRows[0]?.minutes ?? null) ?? 0,
    trainingFrom: weekStart,
    trainingThrough,
    overrideGrams: asNumber(settingsRows[0]?.protein_target_g ?? null),
  });
  const eaten = sumMealMacros(meals);

  return {
    today,
    day: chosen,
    meals,
    eaten,
    target,
    batches,
    supplements,
    staples: foods.filter((item) => item.isStaple),
    foods,
    // Suggestions are only offered for today; a past day has already happened.
    suggestions:
      chosen === today
        ? buildProject100MealSuggestions({
            target,
            eatenProteinG: eaten.proteinG,
            batches,
            supplements,
            nextWorkInMinutes,
          })
        : [],
    nextWorkInMinutes,
  };
}

/**
 * Page/API entry point: enrich the private nutrition day with the actor's
 * read-only family-calendar context without copying a work event into storage.
 */
export async function loadProject100NutritionView(
  actor: ActorContext,
  selectedDay: string | null = null,
): Promise<Project100NutritionView> {
  const horizon = await loadProject100WorkHorizon(actor);
  const now = new Date();
  const nextWorkEvent = nextProject100WorkStart(horizon.workEvents, now);
  const nutrition = await loadProject100NutritionDay(
    actor,
    selectedDay,
    minutesUntilProject100WorkStart(nextWorkEvent, now),
    horizon.timeZone,
  );
  return {
    ...nutrition,
    timeZone: horizon.timeZone,
    nextWorkEvent,
  };
}

export async function saveProject100Food(
  actor: ActorContext,
  input: Project100FoodInput,
): Promise<Project100Food> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<FoodRow[]>`
    insert into project100_foods
      (id, user_id, name, normalized_name, protein_per_100g, carbs_per_100g,
       fat_per_100g, kcal_per_100g, is_staple, staple_target_grams, in_stock_grams)
    values
      (${crypto.randomUUID()}, ${actor.userId}, ${input.name}, ${normalized(input.name)},
       ${input.proteinPer100g}, ${input.carbsPer100g}, ${input.fatPer100g},
       ${input.kcalPer100g}, ${input.isStaple}, ${input.stapleTargetGrams}, ${input.inStockGrams})
    on conflict (user_id, normalized_name) do update
      set name = excluded.name,
          protein_per_100g = excluded.protein_per_100g,
          carbs_per_100g = excluded.carbs_per_100g,
          fat_per_100g = excluded.fat_per_100g,
          kcal_per_100g = excluded.kcal_per_100g,
          is_staple = excluded.is_staple,
          staple_target_grams = excluded.staple_target_grams,
          in_stock_grams = coalesce(excluded.in_stock_grams, project100_foods.in_stock_grams),
          archived_at = null,
          updated_at = now()
    returning id, name, protein_per_100g, carbs_per_100g, fat_per_100g,
              kcal_per_100g, is_staple, staple_target_grams, in_stock_grams
  `;
  return food(rows[0]);
}

export async function updateProject100PantryStock(
  actor: ActorContext,
  input: Project100PantryStockInput,
): Promise<Project100Food> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<FoodRow[]>`
      update project100_foods
      set in_stock_grams = ${input.inStockGrams}, updated_at = now()
      where id = ${input.foodId} and user_id = ${actor.userId} and archived_at is null
      returning id, name, protein_per_100g, carbs_per_100g, fat_per_100g,
                kcal_per_100g, is_staple, staple_target_grams, in_stock_grams
    `;
    if (!rows[0]) {
      throw new AppError(404, "PROJECT100_FOOD_NOT_FOUND", "Råvaran finns inte.");
    }
    await recordAudit(tx, actor, {
      action: "project100.nutrition.pantry.update",
      targetType: "project100_food",
      targetId: input.foodId,
    });
    return food(rows[0]);
  });
}

export async function saveProject100Recipe(
  actor: ActorContext,
  input: Project100RecipeInput,
): Promise<Project100Recipe> {
  assertProject100Adult(actor);
  const recipeId = crypto.randomUUID();
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const owned = await tx<{ id: string }[]>`
      select id from project100_foods
      where user_id = ${actor.userId}
        and id in ${tx(input.items.map((item) => item.foodId))}
    `;
    if (owned.length !== new Set(input.items.map((item) => item.foodId)).size) {
      throw new AppError(404, "PROJECT100_FOOD_NOT_FOUND", "En av råvarorna finns inte.");
    }

    await tx`
      insert into project100_recipes
        (id, user_id, name, description, servings_default, is_favorite, instructions)
      values
        (${recipeId}, ${actor.userId}, ${input.name}, ${input.description},
         ${input.servingsDefault}, ${input.isFavorite}, ${input.instructions})
    `;
    for (const [position, item] of input.items.entries()) {
      await tx`
        insert into project100_recipe_items
          (id, user_id, recipe_id, food_id, grams, position)
        values
          (${crypto.randomUUID()}, ${actor.userId}, ${recipeId}, ${item.foodId},
           ${item.grams}, ${position})
      `;
    }
    await recordAudit(tx, actor, {
      action: "project100.nutrition.recipe.create",
      targetType: "project100_recipe",
      targetId: recipeId,
      metadata: { servings: input.servingsDefault },
    });
  });

  const recipes = await loadProject100Recipes(actor);
  const created = recipes.find((r) => r.id === recipeId);
  if (!created) {
    throw new AppError(500, "PROJECT100_RECIPE_NOT_READABLE", "Receptet kunde inte läsas tillbaka.");
  }
  return created;
}

export async function updateProject100Recipe(
  actor: ActorContext,
  id: string,
  input: Project100RecipeUpdateInput,
): Promise<Project100Recipe> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update project100_recipes
      set name = ${input.name},
          description = ${input.description},
          servings_default = ${input.servingsDefault},
          is_favorite = ${input.isFavorite},
          instructions = ${input.instructions},
          updated_at = now()
      where id = ${id} and user_id = ${actor.userId} and archived_at is null
      returning id
    `;
    if (!updated[0]) {
      throw new AppError(404, "PROJECT100_RECIPE_NOT_FOUND", "Receptet finns inte.");
    }

    const owned = await tx<{ id: string }[]>`
      select id from project100_foods
      where user_id = ${actor.userId}
        and id in ${tx(input.items.map((item) => item.foodId))}
    `;
    if (owned.length !== new Set(input.items.map((item) => item.foodId)).size) {
      throw new AppError(404, "PROJECT100_FOOD_NOT_FOUND", "En av råvarorna finns inte.");
    }

    await tx`
      delete from project100_recipe_items
      where recipe_id = ${id} and user_id = ${actor.userId}
    `;
    for (const [position, item] of input.items.entries()) {
      await tx`
        insert into project100_recipe_items
          (id, user_id, recipe_id, food_id, grams, position)
        values
          (${crypto.randomUUID()}, ${actor.userId}, ${id}, ${item.foodId},
           ${item.grams}, ${position})
      `;
    }
    await recordAudit(tx, actor, {
      action: "project100.nutrition.recipe.update",
      targetType: "project100_recipe",
      targetId: id,
      metadata: { servings: input.servingsDefault },
    });
  });

  const recipes = await loadProject100Recipes(actor);
  const updated = recipes.find((recipe) => recipe.id === id);
  if (!updated) {
    throw new AppError(500, "PROJECT100_RECIPE_NOT_READABLE", "Receptet kunde inte läsas tillbaka.");
  }
  return updated;
}

export async function loadProject100Recipes(actor: ActorContext): Promise<Project100Recipe[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const [recipeRows, itemRows] = await Promise.all([
    sql<RecipeRow[]>`
      select id, name, description, servings_default, is_favorite, instructions
      from project100_recipes
      where user_id = ${actor.userId} and archived_at is null
      order by is_favorite desc, name asc, id asc
    `,
    sql<RecipeItemRow[]>`
      select ri.id, ri.recipe_id, ri.food_id, f.name, ri.grams,
             f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.kcal_per_100g
      from project100_recipe_items ri
      join project100_foods f on f.id = ri.food_id and f.user_id = ri.user_id
      join project100_recipes r on r.id = ri.recipe_id and r.user_id = ri.user_id
      where ri.user_id = ${actor.userId} and r.archived_at is null
      order by ri.recipe_id, ri.position, ri.id
    `,
  ]);
  return mapRecipes(recipeRows, itemRows);
}

export async function archiveProject100Recipe(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update project100_recipes
      set archived_at = now(), updated_at = now()
      where id = ${id} and user_id = ${actor.userId} and archived_at is null
      returning id
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.nutrition.recipe.delete",
      targetType: "project100_recipe",
      targetId: id,
    });
    return true;
  });
}

export async function saveProject100RecipeFromBatch(
  actor: ActorContext,
  input: Project100RecipeFromBatchInput,
): Promise<Project100Recipe> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const [batchRows, itemRows] = await Promise.all([
    sql<BatchRow[]>`
      select id, name, to_char(cooked_on, 'YYYY-MM-DD') as cooked_on,
             portions_total, portions_left, note
      from project100_meal_batches
      where id = ${input.batchId} and user_id = ${actor.userId} and archived_at is null
      limit 1
    `,
    sql<BatchItemRow[]>`
      select bi.id, bi.batch_id, bi.food_id, f.name, bi.grams,
             f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.kcal_per_100g
      from project100_meal_batch_items bi
      join project100_foods f on f.id = bi.food_id and f.user_id = bi.user_id
      where bi.user_id = ${actor.userId} and bi.batch_id = ${input.batchId}
      order by bi.position, bi.id
    `,
  ]);
  const [batch] = mapBatches(batchRows, itemRows);
  if (!batch) {
    throw new AppError(404, "PROJECT100_BATCH_NOT_FOUND", "Satsen finns inte.");
  }

  return saveProject100Recipe(actor, {
    name: input.name ?? batch.name,
    description: input.description ?? batch.note,
    servingsDefault: batch.portionsTotal,
    isFavorite: input.isFavorite,
    instructions: null,
    items: batch.items.map((item) => ({
      foodId: item.foodId,
      grams: item.grams,
    })),
  });
}

export async function saveProject100RecipeFromMeal(
  actor: ActorContext,
  input: Project100RecipeFromMealInput,
): Promise<Project100Recipe> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const mealRows = await sql<MealRow[]>`
    select id, eaten_on, eaten_at_minute, meal_type, title, source, batch_id,
           portions, protein_g, carbs_g, fat_g, kcal, hunger_before, fullness_after,
           note, media_id, null as preview_key
    from project100_meals
    where id = ${input.mealId} and user_id = ${actor.userId}
    limit 1
  `;
  const mealRow = mealRows[0];
  if (!mealRow) {
    throw new AppError(404, "PROJECT100_MEAL_NOT_FOUND", "Måltiden finns inte.");
  }

  if (mealRow.source === "batch" && mealRow.batch_id) {
    return saveProject100RecipeFromBatch(actor, {
      batchId: mealRow.batch_id,
      name: input.name,
      description: input.description ?? mealRow.note,
      isFavorite: input.isFavorite,
    });
  }

  const foodName = `${input.name} (bas)`;
  const proteinG = asNumber(mealRow.protein_g) ?? 0;
  const carbsG = asNumber(mealRow.carbs_g) ?? 0;
  const fatG = asNumber(mealRow.fat_g) ?? 0;
  const kcal = asNumber(mealRow.kcal);
  const portions = input.servingsDefault > 0 ? input.servingsDefault : 1;

  const savedFood = await saveProject100Food(actor, {
    name: foodName,
    proteinPer100g: Math.min(100, Math.round((proteinG / portions) * 10) / 10),
    carbsPer100g: Math.min(100, Math.round((carbsG / portions) * 10) / 10),
    fatPer100g: Math.min(100, Math.round((fatG / portions) * 10) / 10),
    kcalPer100g: kcal !== null ? Math.round(kcal / portions) : null,
    isStaple: false,
    stapleTargetGrams: null,
    inStockGrams: null,
  });

  return saveProject100Recipe(actor, {
    name: input.name,
    description: input.description ?? mealRow.note,
    servingsDefault: input.servingsDefault,
    isFavorite: input.isFavorite,
    instructions: null,
    items: [{ foodId: savedFood.id, grams: 100 * portions }],
  });
}

export async function cookBatchFromRecipe(
  actor: ActorContext,
  input: Project100CookBatchFromRecipeInput,
): Promise<Project100MealBatch> {
  assertProject100Adult(actor);
  const recipes = await loadProject100Recipes(actor);
  const recipe = recipes.find((r) => r.id === input.recipeId);
  if (!recipe) {
    throw new AppError(404, "PROJECT100_RECIPE_NOT_FOUND", "Receptet finns inte.");
  }

  const scaledItems = scaleRecipeIngredients(recipe, input.portionsTotal);
  return saveProject100Batch(actor, {
    name: input.name ?? `${recipe.name} (${input.portionsTotal} port)`,
    cookedOn: input.cookedOn,
    portionsTotal: input.portionsTotal,
    note: input.note ?? recipe.instructions ?? null,
    items: scaledItems.map((item) => ({
      foodId: item.foodId,
      grams: item.grams,
    })),
  });
}

export async function saveProject100MealPlan(
  actor: ActorContext,
  input: Project100MealPlanInput,
): Promise<Project100MealPlan> {
  assertProject100Adult(actor);
  const planId = crypto.randomUUID();
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<MealPlanRow[]>`
      insert into project100_meal_plans
        (id, user_id, planned_date, planned_minute, meal_type, source,
         recipe_id, batch_id, title, portions, is_cooked, note)
      values
        (${planId}, ${actor.userId}, ${input.plannedDate}, ${input.plannedMinute},
         ${input.mealType}, ${input.source}, ${input.recipeId}, ${input.batchId},
         ${input.title}, ${input.portions}, ${input.isCooked}, ${input.note})
      returning id, to_char(planned_date, 'YYYY-MM-DD') as planned_date,
                planned_minute, meal_type, source, recipe_id, batch_id,
                title, portions, is_cooked, note
    `;
    await recordAudit(tx, actor, {
      action: "project100.nutrition.plan.create",
      targetType: "project100_meal_plan",
      targetId: planId,
    });
    return mapMealPlans(rows)[0];
  });
}

export async function deleteProject100MealPlan(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      delete from project100_meal_plans
      where id = ${id} and user_id = ${actor.userId}
      returning id
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.nutrition.plan.delete",
      targetType: "project100_meal_plan",
      targetId: id,
    });
    return true;
  });
}

export async function loadProject100MealPlanWeek(
  actor: ActorContext,
  selectedWeekStart: string | null = null,
): Promise<Project100WeeklyMealPlanView> {
  assertProject100Adult(actor);
  const schedule = await loadProject100WorkSchedule(actor, selectedWeekStart ?? undefined);
  const sql = await readyClient();

  const today = schedule.today;
  const weekStart = schedule.weekStart;
  const weekEnd = addCalendarDateDays(schedule.weekEndExclusive, -1);

  const [mealPlanRows, mealRows, recipeRows, recipeItemRows, batchRows, batchItemRows, foodRows] =
    await Promise.all([
      sql<MealPlanRow[]>`
        select id, to_char(planned_date, 'YYYY-MM-DD') as planned_date,
               planned_minute, meal_type, source, recipe_id, batch_id,
               title, portions, is_cooked, note
        from project100_meal_plans
        where user_id = ${actor.userId}
          and planned_date >= ${weekStart}
          and planned_date <= ${weekEnd}
        order by planned_date asc, planned_minute nulls last, id asc
      `,
      sql<MealRow[]>`
        select m.id, to_char(m.eaten_on, 'YYYY-MM-DD') as eaten_on, m.eaten_at_minute,
               m.meal_type, m.title, m.source, m.batch_id, m.portions, m.protein_g,
               m.carbs_g, m.fat_g, m.kcal, m.hunger_before, m.fullness_after, m.note,
               m.media_id, media.preview_key
        from project100_meals m
        left join project100_media media
          on media.id = m.media_id and media.user_id = m.user_id
        where m.user_id = ${actor.userId}
          and m.eaten_on >= ${weekStart}
          and m.eaten_on <= ${weekEnd}
        order by m.eaten_on asc, m.eaten_at_minute nulls last, m.id asc
      `,
      sql<RecipeRow[]>`
        select id, name, description, servings_default, is_favorite, instructions
        from project100_recipes
        where user_id = ${actor.userId} and archived_at is null
        order by is_favorite desc, name asc
      `,
      sql<RecipeItemRow[]>`
        select ri.id, ri.recipe_id, ri.food_id, f.name, ri.grams,
               f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.kcal_per_100g
        from project100_recipe_items ri
        join project100_foods f on f.id = ri.food_id and f.user_id = ri.user_id
        join project100_recipes r on r.id = ri.recipe_id and r.user_id = ri.user_id
        where ri.user_id = ${actor.userId} and r.archived_at is null
        order by ri.recipe_id, ri.position, ri.id
      `,
      sql<BatchRow[]>`
        select id, name, to_char(cooked_on, 'YYYY-MM-DD') as cooked_on,
               portions_total, portions_left, note
        from project100_meal_batches
        where user_id = ${actor.userId} and archived_at is null
        order by portions_left > 0 desc, cooked_on desc
        limit ${BATCH_LIMIT}
      `,
      sql<BatchItemRow[]>`
        select bi.id, bi.batch_id, bi.food_id, f.name, bi.grams,
               f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.kcal_per_100g
        from project100_meal_batch_items bi
        join project100_foods f on f.id = bi.food_id and f.user_id = bi.user_id
        join project100_meal_batches b on b.id = bi.batch_id and b.user_id = bi.user_id
        where bi.user_id = ${actor.userId} and b.archived_at is null
        order by bi.batch_id, bi.position, bi.id
      `,
      sql<FoodRow[]>`
        select id, name, protein_per_100g, carbs_per_100g, fat_per_100g,
               kcal_per_100g, is_staple, staple_target_grams, in_stock_grams
        from project100_foods
        where user_id = ${actor.userId} and archived_at is null
        order by is_staple desc, name asc
        limit ${FOOD_LIMIT}
      `,
    ]);

  const mealPlans = mapMealPlans(mealPlanRows);
  const meals = await mapMeals(actor.userId, mealRows);
  const recipes = mapRecipes(recipeRows, recipeItemRows);
  const batches = mapBatches(batchRows, batchItemRows);
  const foods = foodRows.map(food);

  const shoppingList = deriveShoppingList({
    mealPlans,
    recipes,
    foods,
  });

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDateDays(weekStart, index);
    const dayPlans = mealPlans.filter((p) => p.plannedDate === date);
    const dayMeals = meals.filter((m) => m.eatenOn === date);
    const dayWorkEvents = schedule.workEvents.filter((event) => {
      const eventDate = calendarDateInTimeZone(new Date(event.startsAt), schedule.timeZone);
      return eventDate === date;
    });

    return {
      date,
      isToday: date === today,
      workEvents: dayWorkEvents,
      plans: dayPlans,
      meals: dayMeals,
      totalMacros: sumMealMacros(dayMeals),
    };
  });

  return {
    weekStart,
    weekEnd,
    timeZone: schedule.timeZone,
    days,
    recipes,
    batches,
    foods,
    shoppingList,
  };
}


export async function saveProject100Batch(
  actor: ActorContext,
  input: Project100BatchInput,
): Promise<Project100MealBatch> {
  assertProject100Adult(actor);
  const batchId = crypto.randomUUID();
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const owned = await tx<{ id: string }[]>`
      select id from project100_foods
      where user_id = ${actor.userId}
        and id in ${tx(input.items.map((item) => item.foodId))}
    `;
    if (owned.length !== new Set(input.items.map((item) => item.foodId)).size) {
      throw new AppError(404, "PROJECT100_FOOD_NOT_FOUND", "En av råvarorna finns inte.");
    }

    await tx`
      insert into project100_meal_batches
        (id, user_id, name, cooked_on, portions_total, portions_left, note)
      values
        (${batchId}, ${actor.userId}, ${input.name}, ${input.cookedOn},
         ${input.portionsTotal}, ${input.portionsTotal}, ${input.note})
    `;
    for (const [position, item] of input.items.entries()) {
      await tx`
        insert into project100_meal_batch_items
          (id, user_id, batch_id, food_id, grams, position)
        values
          (${crypto.randomUUID()}, ${actor.userId}, ${batchId}, ${item.foodId},
           ${item.grams}, ${position})
      `;
    }
    await recordAudit(tx, actor, {
      action: "project100.nutrition.batch.create",
      targetType: "project100_meal_batch",
      targetId: batchId,
      metadata: { portions: input.portionsTotal },
    });
  });

  const day = await loadProject100NutritionDay(actor);
  const created = day.batches.find((batch) => batch.id === batchId);
  if (!created) {
    throw new AppError(500, "PROJECT100_BATCH_NOT_READABLE", "Satsen kunde inte läsas tillbaka.");
  }
  return created;
}

/**
 * Logs a meal. A batch portion's macros are computed here and written onto the
 * meal, so editing the batch later cannot rewrite what was eaten today, and the
 * portion count is decremented in the same statement that checks it is there.
 */
export async function logProject100Meal(
  actor: ActorContext,
  input: Project100MealInput,
): Promise<Project100Meal> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  if (input.eatenOn > today) {
    throw new AppError(400, "PROJECT100_FUTURE_MEAL", "En måltid kan inte ätas i framtiden.");
  }

  const mealId = crypto.randomUUID();
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    if (input.mediaId !== null) {
      const owned = await tx<{ id: string }[]>`
        select id from project100_media
        where id = ${input.mediaId} and user_id = ${actor.userId}
        limit 1
      `;
      if (!owned[0]) {
        throw new AppError(404, "PROJECT100_MEDIA_NOT_FOUND", "Bilden finns inte.");
      }
    }

    let title = "";
    let macros: Project100Macros | null = null;
    if (input.source === "batch") {
      const batchRows = await tx<BatchRow[]>`
        select id, name, to_char(cooked_on, 'YYYY-MM-DD') as cooked_on,
               portions_total, portions_left, note
        from project100_meal_batches
        where id = ${input.batchId} and user_id = ${actor.userId} and archived_at is null
        limit 1
      `;
      if (!batchRows[0]) {
        throw new AppError(404, "PROJECT100_BATCH_NOT_FOUND", "Satsen finns inte.");
      }
      const itemRows = await tx<BatchItemRow[]>`
        select bi.id, bi.batch_id, bi.food_id, f.name, bi.grams,
               f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.kcal_per_100g
        from project100_meal_batch_items bi
        join project100_foods f on f.id = bi.food_id and f.user_id = bi.user_id
        where bi.user_id = ${actor.userId} and bi.batch_id = ${input.batchId}
        order by bi.position, bi.id
      `;
      const [batch] = mapBatches(batchRows, itemRows);
      const perPortion = batchPortionMacros(batch);
      macros = {
        proteinG: perPortion.proteinG * input.portions,
        carbsG: perPortion.carbsG * input.portions,
        fatG: perPortion.fatG * input.portions,
        kcal: perPortion.kcal * input.portions,
      };
      title = batch.name;

      // The condition and the decrement are one statement, so two taps cannot
      // both take the last portion.
      const taken = await tx<{ id: string }[]>`
        update project100_meal_batches
        set portions_left = portions_left - ${input.portions}, updated_at = now()
        where id = ${input.batchId}
          and user_id = ${actor.userId}
          and portions_left >= ${input.portions}
        returning id
      `;
      if (!taken[0]) {
        throw new AppError(
          409,
          "PROJECT100_PORTIONS_GONE",
          "Det finns inte så många portioner kvar i satsen.",
        );
      }
    } else {
      title = input.title;
      macros = {
        proteinG: input.proteinG ?? 0,
        carbsG: input.carbsG ?? 0,
        fatG: input.fatG ?? 0,
        kcal: input.kcal ?? 0,
      };
    }

    await tx`
      insert into project100_meals
        (id, user_id, eaten_on, eaten_at_minute, meal_type, title, source, batch_id,
         portions, protein_g, carbs_g, fat_g, kcal, hunger_before, fullness_after,
         note, media_id)
      values
        (${mealId}, ${actor.userId}, ${input.eatenOn}, ${input.eatenAtMinute},
         ${input.mealType}, ${title}, ${input.source},
         ${input.source === "batch" ? input.batchId : null},
         ${input.source === "batch" ? input.portions : null},
         ${macros.proteinG}, ${macros.carbsG}, ${macros.fatG}, ${macros.kcal},
         ${input.hungerBefore}, ${input.fullnessAfter}, ${input.note}, ${input.mediaId})
    `;
    await recordAudit(tx, actor, {
      action: "project100.nutrition.meal.log",
      targetType: "project100_meal",
      targetId: mealId,
      metadata: { source: input.source },
    });
  });

  const rows = await sql<MealRow[]>`
    select m.id, to_char(m.eaten_on, 'YYYY-MM-DD') as eaten_on, m.eaten_at_minute,
           m.meal_type, m.title, m.source, m.batch_id, m.portions, m.protein_g,
           m.carbs_g, m.fat_g, m.kcal, m.hunger_before, m.fullness_after, m.note,
           m.media_id, media.preview_key
    from project100_meals m
    left join project100_media media
      on media.id = m.media_id and media.user_id = m.user_id
    where m.id = ${mealId} and m.user_id = ${actor.userId}
    limit 1
  `;
  const [saved] = await mapMeals(actor.userId, rows);
  if (!saved) {
    throw new AppError(500, "PROJECT100_MEAL_NOT_READABLE", "Måltiden kunde inte läsas tillbaka.");
  }
  return saved;
}

/** Removing a meal that came from a batch puts the portion back; it was not eaten. */
export async function deleteProject100Meal(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string; batch_id: string | null; portions: number | string | null }[]>`
      delete from project100_meals
      where id = ${id} and user_id = ${actor.userId}
      returning id, batch_id, portions
    `;
    const removed = rows[0];
    if (!removed) return false;

    const portions = asNumber(removed.portions ?? null);
    if (removed.batch_id !== null && portions !== null) {
      await tx`
        update project100_meal_batches
        set portions_left = least(portions_total, portions_left + ${portions}),
            updated_at = now()
        where id = ${removed.batch_id} and user_id = ${actor.userId}
      `;
    }
    await recordAudit(tx, actor, {
      action: "project100.nutrition.meal.delete",
      targetType: "project100_meal",
      targetId: id,
    });
    return true;
  });
}

export async function saveProject100Supplement(
  actor: ActorContext,
  input: Project100SupplementInput,
): Promise<Project100Supplement> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<SupplementRow[]>`
    insert into project100_supplements
      (id, user_id, name, kind, dose_amount, dose_unit, purpose, timing_matters, timing_note)
    values
      (${crypto.randomUUID()}, ${actor.userId}, ${input.name}, ${input.kind},
       ${input.doseAmount}, ${input.doseUnit}, ${input.purpose},
       ${input.timingMatters}, ${input.timingNote})
    returning id, name, kind, dose_amount, dose_unit, purpose, timing_matters, timing_note
  `;
  return supplement(rows[0]);
}

export async function archiveProject100Supplement(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<{ id: string }[]>`
    update project100_supplements
    set archived_at = now(), updated_at = now()
    where id = ${id} and user_id = ${actor.userId} and archived_at is null
    returning id
  `;
  return rows.length > 0;
}

/** Only the user's override is stored; the calculated range remains derived. */
export async function saveProject100ProteinTarget(
  actor: ActorContext,
  input: Project100ProteinTargetInput,
): Promise<number | null> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ protein_target_g: number | string | null }[]>`
      insert into project100_settings (user_id, protein_target_g)
      values (${actor.userId}, ${input.proteinTargetG})
      on conflict (user_id) do update
        set protein_target_g = excluded.protein_target_g,
            updated_at = now()
      returning protein_target_g
    `;
    await recordAudit(tx, actor, {
      action: "project100.nutrition.target.update",
      targetType: "project100_settings",
      targetId: actor.userId,
    });
    return asNumber(rows[0]?.protein_target_g ?? null);
  });
}
