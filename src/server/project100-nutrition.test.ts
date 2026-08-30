import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  interface Call {
    text: string;
    values: unknown[];
    transactionId: number | null;
  }

  interface FoodState {
    id: string;
    userId: string;
    name: string;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    kcalPer100g: number | null;
    isStaple: boolean;
    stapleTargetGrams: number | null;
    inStockGrams: number | null;
  }

  interface BatchState {
    id: string;
    userId: string;
    name: string;
    cookedOn: string;
    portionsTotal: number;
    portionsLeft: number;
    note: string | null;
  }

  interface BatchItemState {
    id: string;
    userId: string;
    batchId: string;
    foodId: string;
    grams: number;
    position: number;
  }

  interface RecipeState {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    servingsDefault: number;
    isFavorite: boolean;
    instructions: string | null;
  }

  interface RecipeItemState {
    id: string;
    userId: string;
    recipeId: string;
    foodId: string;
    grams: number;
    position: number;
  }

  interface MealPlanState {
    id: string;
    userId: string;
    plannedDate: string;
    plannedMinute: number | null;
    mealType: "breakfast" | "lunch" | "dinner" | "snack" | "shake";
    source: "recipe" | "batch" | "custom";
    recipeId: string | null;
    batchId: string | null;
    title: string;
    portions: number;
    isCooked: boolean;
    note: string | null;
  }

  interface MealState {
    id: string;
    userId: string;
    eatenOn: string;
    eatenAtMinute: number | null;
    mealType: "breakfast" | "lunch" | "dinner" | "snack" | "shake";
    title: string;
    source: "manual" | "batch" | "estimate";
    batchId: string | null;
    portions: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    kcal: number | null;
    hungerBefore: number | null;
    fullnessAfter: number | null;
    note: string | null;
    mediaId: string | null;
  }

  const calls: Call[] = [];
  const state = {
    foods: new Map<string, FoodState>(),
    batches: new Map<string, BatchState>(),
    batchItems: [] as BatchItemState[],
    recipes: new Map<string, RecipeState>(),
    recipeItems: [] as RecipeItemState[],
    mealPlans: new Map<string, MealPlanState>(),
    meals: new Map<string, MealState>(),
    media: new Map<string, string>(),
    failMealInsert: false,
    nextTransactionId: 1,
  };

  function reset() {
    calls.length = 0;
    state.foods = new Map([
      [
        "food-chicken",
        {
          id: "food-chicken",
          userId: "user-test",
          name: "Kyckling",
          proteinPer100g: 23,
          carbsPer100g: 0,
          fatPer100g: 2,
          kcalPer100g: 120,
          isStaple: true,
          stapleTargetGrams: 1_000,
          inStockGrams: 400,
        },
      ],
      [
        "food-rice",
        {
          id: "food-rice",
          userId: "user-test",
          name: "Ris",
          proteinPer100g: 3,
          carbsPer100g: 28,
          fatPer100g: 1,
          kcalPer100g: 130,
          isStaple: true,
          stapleTargetGrams: 1_000,
          inStockGrams: 500,
        },
      ],
      [
        "food-elsewhere",
        {
          id: "food-elsewhere",
          userId: "user-elsewhere",
          name: "Någon annans mat",
          proteinPer100g: 10,
          carbsPer100g: 10,
          fatPer100g: 10,
          kcalPer100g: 170,
          isStaple: false,
          stapleTargetGrams: null,
          inStockGrams: null,
        },
      ],
    ]);
    state.batches = new Map([
      [
        "batch-owned",
        {
          id: "batch-owned",
          userId: "user-test",
          name: "Kycklinglåda",
          cookedOn: "2026-08-26",
          portionsTotal: 6,
          portionsLeft: 3,
          note: null,
        },
      ],
      [
        "batch-elsewhere",
        {
          id: "batch-elsewhere",
          userId: "user-elsewhere",
          name: "Någon annans sats",
          cookedOn: "2026-08-26",
          portionsTotal: 4,
          portionsLeft: 4,
          note: null,
        },
      ],
    ]);
    state.batchItems = [
      {
        id: "batch-item-chicken",
        userId: "user-test",
        batchId: "batch-owned",
        foodId: "food-chicken",
        grams: 600,
        position: 0,
      },
      {
        id: "batch-item-rice",
        userId: "user-test",
        batchId: "batch-owned",
        foodId: "food-rice",
        grams: 600,
        position: 1,
      },
      {
        id: "batch-item-elsewhere",
        userId: "user-elsewhere",
        batchId: "batch-elsewhere",
        foodId: "food-elsewhere",
        grams: 400,
        position: 0,
      },
    ];
    state.recipes = new Map();
    state.recipeItems = [];
    state.mealPlans = new Map();
    state.meals = new Map();
    state.media = new Map([
      ["media-owned", "user-test"],
      ["media-elsewhere", "user-elsewhere"],
    ]);
    state.failMealInsert = false;
    state.nextTransactionId = 1;
  }

  function cloneFoods() {
    return new Map([...state.foods].map(([id, value]) => [id, { ...value }]));
  }

  function cloneBatches() {
    return new Map([...state.batches].map(([id, value]) => [id, { ...value }]));
  }

  function cloneMeals() {
    return new Map([...state.meals].map(([id, value]) => [id, { ...value }]));
  }

  function cloneRecipes() {
    return new Map([...state.recipes].map(([id, value]) => [id, { ...value }]));
  }

  function cloneMealPlans() {
    return new Map([...state.mealPlans].map(([id, value]) => [id, { ...value }]));
  }

  function foodRow(item: FoodState) {
    return {
      id: item.id,
      name: item.name,
      protein_per_100g: item.proteinPer100g,
      carbs_per_100g: item.carbsPer100g,
      fat_per_100g: item.fatPer100g,
      kcal_per_100g: item.kcalPer100g,
      is_staple: item.isStaple,
      staple_target_grams: item.stapleTargetGrams,
      in_stock_grams: item.inStockGrams,
    };
  }

  function recipeRow(item: RecipeState) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      servings_default: item.servingsDefault,
      is_favorite: item.isFavorite,
      instructions: item.instructions,
    };
  }

  function recipeItemRow(item: RecipeItemState) {
    const ingredient = state.foods.get(item.foodId);
    if (!ingredient) throw new Error(`Missing test food ${item.foodId}`);
    return {
      id: item.id,
      recipe_id: item.recipeId,
      food_id: item.foodId,
      name: ingredient.name,
      grams: item.grams,
      protein_per_100g: ingredient.proteinPer100g,
      carbs_per_100g: ingredient.carbsPer100g,
      fat_per_100g: ingredient.fatPer100g,
      kcal_per_100g: ingredient.kcalPer100g,
    };
  }

  function mealPlanRow(item: MealPlanState) {
    return {
      id: item.id,
      planned_date: item.plannedDate,
      planned_minute: item.plannedMinute,
      meal_type: item.mealType,
      source: item.source,
      recipe_id: item.recipeId,
      batch_id: item.batchId,
      title: item.title,
      portions: item.portions,
      is_cooked: item.isCooked,
      note: item.note,
    };
  }

  function batchRow(item: BatchState) {
    return {
      id: item.id,
      name: item.name,
      cooked_on: item.cookedOn,
      portions_total: item.portionsTotal,
      portions_left: item.portionsLeft,
      note: item.note,
    };
  }

  function batchItemRow(item: BatchItemState) {
    const ingredient = state.foods.get(item.foodId);
    if (!ingredient) throw new Error(`Missing test food ${item.foodId}`);
    return {
      id: item.id,
      batch_id: item.batchId,
      food_id: item.foodId,
      name: ingredient.name,
      grams: item.grams,
      protein_per_100g: ingredient.proteinPer100g,
      carbs_per_100g: ingredient.carbsPer100g,
      fat_per_100g: ingredient.fatPer100g,
      kcal_per_100g: ingredient.kcalPer100g,
    };
  }

  function mealRow(item: MealState) {
    return {
      id: item.id,
      eaten_on: item.eatenOn,
      eaten_at_minute: item.eatenAtMinute,
      meal_type: item.mealType,
      title: item.title,
      source: item.source,
      batch_id: item.batchId,
      portions: item.portions,
      protein_g: item.proteinG,
      carbs_g: item.carbsG,
      fat_g: item.fatG,
      kcal: item.kcal,
      hunger_before: item.hungerBefore,
      fullness_after: item.fullnessAfter,
      note: item.note,
      media_id: item.mediaId,
      preview_key: null,
    };
  }

  function listValues(value: unknown): unknown[] {
    if (
      typeof value === "object" &&
      value !== null &&
      "list" in value &&
      Array.isArray(value.list)
    ) {
      return value.list;
    }
    return [];
  }

  async function execute(text: string, values: unknown[]) {
    if (text.includes("family_audit_log")) return [];

    if (text.includes("select id from project100_media")) {
      const [id, userId] = values as [string, string];
      return state.media.get(id) === userId ? [{ id }] : [];
    }

    if (text.includes("select id from project100_foods")) {
      const userId = values[0] as string;
      return listValues(values[1])
        .filter((id): id is string => typeof id === "string")
        .filter((id) => state.foods.get(id)?.userId === userId)
        .map((id) => ({ id }));
    }

    if (text.includes("insert into project100_foods")) {
      const item: FoodState = {
        id: values[0] as string,
        userId: values[1] as string,
        name: values[2] as string,
        proteinPer100g: values[4] as number,
        carbsPer100g: values[5] as number,
        fatPer100g: values[6] as number,
        kcalPer100g: values[7] as number | null,
        isStaple: values[8] as boolean,
        stapleTargetGrams: values[9] as number | null,
        inStockGrams: (values[10] as number | null) ?? null,
      };
      state.foods.set(item.id, item);
      return [foodRow(item)];
    }

    if (text.includes("update project100_foods")) {
      const [inStockGrams, foodId, userId] = values as [number | null, string, string];
      const item = state.foods.get(foodId);
      if (!item || item.userId !== userId) return [];
      item.inStockGrams = inStockGrams;
      return [foodRow(item)];
    }

    if (text.includes("insert into project100_meal_batches")) {
      const item: BatchState = {
        id: values[0] as string,
        userId: values[1] as string,
        name: values[2] as string,
        cookedOn: values[3] as string,
        portionsTotal: values[4] as number,
        portionsLeft: values[5] as number,
        note: values[6] as string | null,
      };
      state.batches.set(item.id, item);
      return [];
    }

    if (text.includes("insert into project100_meal_batch_items")) {
      state.batchItems.push({
        id: values[0] as string,
        userId: values[1] as string,
        batchId: values[2] as string,
        foodId: values[3] as string,
        grams: values[4] as number,
        position: values[5] as number,
      });
      return [];
    }

    if (text.includes("insert into project100_recipes")) {
      const item: RecipeState = {
        id: values[0] as string,
        userId: values[1] as string,
        name: values[2] as string,
        description: values[3] as string | null,
        servingsDefault: values[4] as number,
        isFavorite: values[5] as boolean,
        instructions: values[6] as string | null,
      };
      state.recipes.set(item.id, item);
      return [];
    }

    if (text.includes("insert into project100_recipe_items")) {
      state.recipeItems.push({
        id: values[0] as string,
        userId: values[1] as string,
        recipeId: values[2] as string,
        foodId: values[3] as string,
        grams: values[4] as number,
        position: values[5] as number,
      });
      return [];
    }

    if (text.includes("from project100_recipes")) {
      const userId = values[0] as string;
      return [...state.recipes.values()]
        .filter((item) => item.userId === userId)
        .map(recipeRow);
    }

    if (text.includes("from project100_recipe_items ri")) {
      const userId = values[0] as string;
      return state.recipeItems
        .filter((item) => item.userId === userId)
        .map(recipeItemRow);
    }

    if (text.includes("update project100_recipes") && text.includes("set name =")) {
      const [name, description, servingsDefault, isFavorite, instructions, id, userId] = values as [
        string,
        string | null,
        number,
        boolean,
        string | null,
        string,
        string,
      ];
      const item = state.recipes.get(id);
      if (!item || item.userId !== userId) return [];
      Object.assign(item, { name, description, servingsDefault, isFavorite, instructions });
      return [{ id }];
    }

    if (text.includes("delete from project100_recipe_items")) {
      const [recipeId, userId] = values as [string, string];
      state.recipeItems = state.recipeItems.filter(
        (item) => item.recipeId !== recipeId || item.userId !== userId,
      );
      return [];
    }

    if (text.includes("update project100_recipes")) {
      const [id, userId] = values as [string, string];
      const item = state.recipes.get(id);
      if (!item || item.userId !== userId) return [];
      state.recipes.delete(id);
      return [{ id }];
    }

    if (text.includes("insert into project100_meal_plans")) {
      const item: MealPlanState = {
        id: values[0] as string,
        userId: values[1] as string,
        plannedDate: values[2] as string,
        plannedMinute: values[3] as number | null,
        mealType: values[4] as MealPlanState["mealType"],
        source: values[5] as MealPlanState["source"],
        recipeId: values[6] as string | null,
        batchId: values[7] as string | null,
        title: values[8] as string,
        portions: values[9] as number,
        isCooked: values[10] as boolean,
        note: values[11] as string | null,
      };
      state.mealPlans.set(item.id, item);
      return [mealPlanRow(item)];
    }

    if (text.includes("delete from project100_meal_plans")) {
      const [id, userId] = values as [string, string];
      const item = state.mealPlans.get(id);
      if (!item || item.userId !== userId) return [];
      state.mealPlans.delete(id);
      return [{ id }];
    }

    if (text.includes("from project100_meal_plans")) {
      const [userId, weekStart, weekEnd] = values as [string, string, string];
      return [...state.mealPlans.values()]
        .filter((item) => item.userId === userId && (!weekStart || (item.plannedDate >= weekStart && item.plannedDate <= weekEnd)))
        .map(mealPlanRow);
    }

    if (text.includes("from project100_meal_batches")) {
      if (text.includes("where id = ?")) {
        const [id, userId] = values as [string, string];
        const item = state.batches.get(id);
        return item?.userId === userId ? [batchRow(item)] : [];
      }
      const userId = values[0] as string;
      return [...state.batches.values()]
        .filter((item) => item.userId === userId)
        .map(batchRow);
    }

    if (text.includes("from project100_meal_batch_items bi")) {
      const userId = values[0] as string;
      const batchId = text.includes("bi.batch_id = ?") ? (values[1] as string) : null;
      return state.batchItems
        .filter((item) => item.userId === userId && (batchId === null || item.batchId === batchId))
        .map(batchItemRow);
    }

    if (text.includes("set portions_left = portions_left -")) {
      const [portions, id, userId] = values as [number, string, string, number];
      const item = state.batches.get(id);
      if (!item || item.userId !== userId || item.portionsLeft < portions) return [];
      item.portionsLeft -= portions;
      return [{ id }];
    }

    if (text.includes("set portions_left = least")) {
      const [portions, id, userId] = values as [number, string, string];
      const item = state.batches.get(id);
      if (item?.userId === userId) {
        item.portionsLeft = Math.min(item.portionsTotal, item.portionsLeft + portions);
      }
      return [];
    }

    if (text.includes("insert into project100_meals")) {
      if (state.failMealInsert) throw new Error("simulated meal insert failure");
      const item: MealState = {
        id: values[0] as string,
        userId: values[1] as string,
        eatenOn: values[2] as string,
        eatenAtMinute: values[3] as number | null,
        mealType: values[4] as MealState["mealType"],
        title: values[5] as string,
        source: values[6] as MealState["source"],
        batchId: values[7] as string | null,
        portions: values[8] as number | null,
        proteinG: values[9] as number,
        carbsG: values[10] as number,
        fatG: values[11] as number,
        kcal: values[12] as number,
        hungerBefore: values[13] as number | null,
        fullnessAfter: values[14] as number | null,
        note: values[15] as string | null,
        mediaId: values[16] as string | null,
      };
      state.meals.set(item.id, item);
      return [];
    }

    if (text.includes("delete from project100_meals")) {
      const [id, userId] = values as [string, string];
      const item = state.meals.get(id);
      if (!item || item.userId !== userId) return [];
      state.meals.delete(id);
      return [{ id: item.id, batch_id: item.batchId, portions: item.portions }];
    }

    if (text.includes("from project100_meals") && text.includes("where id = ?")) {
      const [id, userId] = values as [string, string];
      const item = state.meals.get(id);
      return item?.userId === userId ? [mealRow(item)] : [];
    }

    if (text.includes("from project100_meals m")) {
      if (text.includes("where m.id = ?")) {
        const [id, userId] = values as [string, string];
        const item = state.meals.get(id);
        return item?.userId === userId ? [mealRow(item)] : [];
      }
      if (text.includes("m.eaten_on >=")) {
        const [userId, weekStart, weekEnd] = values as [string, string, string];
        return [...state.meals.values()]
          .filter((item) => item.userId === userId && item.eatenOn >= weekStart && item.eatenOn <= weekEnd)
          .map(mealRow);
      }
      const [userId, eatenOn] = values as [string, string];
      return [...state.meals.values()]
        .filter((item) => item.userId === userId && item.eatenOn === eatenOn)
        .map(mealRow);
    }

    if (text.includes("from project100_supplements")) return [];
    if (text.includes("from project100_foods")) {
      const userId = values[0] as string;
      return [...state.foods.values()]
        .filter((item) => item.userId === userId)
        .map(foodRow);
    }
    if (text.includes("from project100_body_measurements")) {
      return [{ value: "82.50", measured_on: "2026-08-25" }];
    }
    if (text.includes("from project100_training_sessions")) {
      return [{ sessions: 3, minutes: 135 }];
    }
    if (text.includes("from project100_settings")) {
      return [{ protein_target_g: null }];
    }

    if (text.includes("insert into project100_settings")) {
      return [{ protein_target_g: values[1] }];
    }

    if (text.includes("insert into project100_supplements")) {
      return [
        {
          id: values[0],
          name: values[2],
          kind: values[3],
          dose_amount: values[4],
          dose_unit: values[5],
          purpose: values[6],
          timing_matters: values[7],
          timing_note: values[8],
        },
      ];
    }
    if (text.includes("update project100_supplements")) {
      const [id, userId] = values as [string, string];
      return id === "supplement-owned" && userId === "user-test" ? [{ id }] : [];
    }
    if (text.includes("from family_households")) {
      return [{ timezone: "Europe/Stockholm" }];
    }
    if (text.includes("from family_events")) {
      const to = new Date(values[2] as Date | string).getTime();
      const from = new Date(values[3] as Date | string).getTime();
      const startsAt = new Date("2026-09-15T06:00:00.000Z");
      if (startsAt.getTime() < from || startsAt.getTime() >= to) return [];
      return [{
        id: "work-selected-week",
        title: "Arbete",
        starts_at: startsAt,
        ends_at: new Date("2026-09-15T14:00:00.000Z"),
        all_day: false,
        location: null,
      }];
    }

    throw new Error(`Unexpected query in test: ${text}`);
  }

  function createTag(transactionId: number | null) {
    return vi.fn((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
      if (!("raw" in strings)) return { list: [...strings] };
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values, transactionId });
      return execute(text, values);
    });
  }

  const sql = createTag(null);
  const begin = vi.fn(async (callback: (tx: ReturnType<typeof createTag>) => Promise<unknown>) => {
    const transactionId = state.nextTransactionId++;
    const before = {
      foods: cloneFoods(),
      batches: cloneBatches(),
      batchItems: state.batchItems.map((item) => ({ ...item })),
      recipes: cloneRecipes(),
      recipeItems: state.recipeItems.map((item) => ({ ...item })),
      mealPlans: cloneMealPlans(),
      meals: cloneMeals(),
    };
    const tx = createTag(transactionId);
    Object.assign(tx, { json: (value: unknown) => value });
    try {
      return await callback(tx);
    } catch (error) {
      state.foods = before.foods;
      state.batches = before.batches;
      state.batchItems = before.batchItems;
      state.recipes = before.recipes;
      state.recipeItems = before.recipeItems;
      state.mealPlans = before.mealPlans;
      state.meals = before.meals;
      throw error;
    }
  });
  Object.assign(sql, { begin, json: (value: unknown) => value });
  reset();
  return { begin, calls, reset, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));
vi.mock("@/server/storage", () => ({
  signedProject100MediaUrl: vi.fn(),
  storageIsConfigured: () => false,
}));

import {
  archiveProject100Recipe,
  archiveProject100Supplement,
  cookBatchFromRecipe,
  deleteProject100Meal,
  deleteProject100MealPlan,
  loadProject100MealPlanWeek,
  loadProject100NutritionDay,
  loadProject100NutritionView,
  loadProject100Recipes,
  logProject100Meal,
  saveProject100Batch,
  saveProject100Food,
  saveProject100MealPlan,
  saveProject100ProteinTarget,
  saveProject100Recipe,
  saveProject100RecipeFromBatch,
  saveProject100RecipeFromMeal,
  saveProject100Supplement,
  updateProject100PantryStock,
  updateProject100Recipe,
} from "@/server/project100-nutrition";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

function foodInput() {
  return {
    name: "Havregryn",
    proteinPer100g: 13,
    carbsPer100g: 60,
    fatPer100g: 7,
    kcalPer100g: 370,
    isStaple: true,
    stapleTargetGrams: 1_000,
    inStockGrams: null,
  };
}

function batchInput(foodId = "food-chicken") {
  return {
    name: "Veckolådor",
    cookedOn: "2026-08-26",
    portionsTotal: 6,
    note: null,
    items: [{ foodId, grams: 1_000 }],
  };
}

function batchMeal(portions = 1) {
  return {
    source: "batch" as const,
    batchId: "batch-owned",
    portions,
    eatenOn: "2026-08-26",
    eatenAtMinute: 720,
    mealType: "lunch" as const,
    hungerBefore: 4,
    fullnessAfter: 4,
    note: null,
    mediaId: null,
  };
}

function manualMeal(mediaId: string | null = null) {
  return {
    source: "manual" as const,
    title: "Gröt och ägg",
    eatenOn: "2026-08-26",
    eatenAtMinute: 480,
    mealType: "breakfast" as const,
    proteinG: 31,
    carbsG: 62,
    fatG: 18,
    kcal: 540,
    hungerBefore: null,
    fullnessAfter: null,
    note: null,
    mediaId,
  };
}

function supplementInput() {
  return {
    name: "Kreatin",
    kind: "creatine" as const,
    doseAmount: 5,
    doseUnit: "g" as const,
    purpose: "Daglig mängd",
    timingMatters: false,
    timingNote: null,
  };
}

function recipeInput(foodId = "food-chicken") {
  return {
    name: "Kyckling och ris",
    description: null,
    servingsDefault: 4,
    isFavorite: true,
    instructions: null,
    items: [{ foodId, grams: 800 }],
  };
}

function project100Calls() {
  return database.calls.filter((call) => call.text.includes("project100_"));
}

function seedBatchMeal(id: string, userId: string, batchId: string, portions: number) {
  database.state.meals.set(id, {
    id,
    userId,
    eatenOn: "2026-08-26",
    eatenAtMinute: 720,
    mealType: "lunch",
    title: "Kycklinglåda",
    source: "batch",
    batchId,
    portions,
    proteinG: 26 * portions,
    carbsG: 28 * portions,
    fatG: 3 * portions,
    kcal: 250 * portions,
    hungerBefore: null,
    fullnessAfter: null,
    note: null,
    mediaId: null,
  });
}

describe("Projekt 100 nutrition storage", () => {
  beforeEach(() => {
    database.reset();
    database.sql.mockClear();
    database.begin.mockClear();
  });

  it("scopes every nutrition source to the signed-in account", async () => {
    const day = await loadProject100NutritionDay(TEST_ACTOR, "2026-08-26");
    const touched = project100Calls();

    expect(touched).toHaveLength(8);
    for (const call of touched) {
      expect(call.text).toMatch(/user_id = \?/);
      expect(call.values).toContain(TEST_ACTOR.userId);
    }
    expect(day.target).toMatchObject({
      trainingFrom: "2026-08-20",
      trainingThrough: "2026-08-26",
    });
    const weightRead = touched.find((call) => call.text.includes("project100_body_measurements"));
    const trainingRead = touched.find((call) => call.text.includes("project100_training_sessions"));
    expect(weightRead?.values).toContain("2026-08-26");
    expect(trainingRead?.values).toEqual([
      TEST_ACTOR.userId,
      "2026-08-20",
      "2026-08-26",
    ]);
  });

  it("keeps a child out of every nutrition read and mutation before opening the database", async () => {
    await expect(loadProject100NutritionDay(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    await expect(loadProject100NutritionView(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    await expect(saveProject100Food(CHILD, foodInput())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(saveProject100Batch(CHILD, batchInput())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(logProject100Meal(CHILD, manualMeal())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(deleteProject100Meal(CHILD, "meal-owned")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(saveProject100Supplement(CHILD, supplementInput())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(
      saveProject100ProteinTarget(CHILD, { proteinTargetG: 175 }),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    await expect(
      archiveProject100Supplement(CHILD, "supplement-owned"),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    await expect(loadProject100Recipes(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(saveProject100Recipe(CHILD, recipeInput())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(
      updateProject100Recipe(CHILD, "recipe-owned", recipeInput()),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    await expect(
      updateProject100PantryStock(CHILD, { foodId: "food-chicken", inStockGrams: 500 }),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    await expect(loadProject100MealPlanWeek(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(
      saveProject100MealPlan(CHILD, {
        plannedDate: "2026-08-31",
        plannedMinute: null,
        mealType: "lunch",
        source: "custom",
        recipeId: null,
        batchId: null,
        title: "Lunch",
        portions: 1,
        isCooked: false,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    await expect(deleteProject100MealPlan(CHILD, "plan-owned")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });

    expect(database.sql).not.toHaveBeenCalled();
    expect(database.begin).not.toHaveBeenCalled();
  });

  it("stamps the account on foods, batches, ingredients and supplements", async () => {
    await saveProject100Food(TEST_ACTOR, foodInput());
    await saveProject100Batch(TEST_ACTOR, batchInput());
    await saveProject100Supplement(TEST_ACTOR, supplementInput());
    await expect(
      saveProject100ProteinTarget(TEST_ACTOR, { proteinTargetG: 175 }),
    ).resolves.toBe(175);

    for (const table of [
      "insert into project100_foods",
      "insert into project100_meal_batches",
      "insert into project100_meal_batch_items",
      "insert into project100_supplements",
      "insert into project100_settings",
    ]) {
      const write = database.calls.find((call) => call.text.includes(table));
      expect(write, table).toBeDefined();
      expect(write?.text).toContain("user_id");
      expect(write?.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("refuses to build a batch from another account's food", async () => {
    await expect(
      saveProject100Batch(TEST_ACTOR, batchInput("food-elsewhere")),
    ).rejects.toMatchObject({ code: "PROJECT100_FOOD_NOT_FOUND", status: 404 });

    const ownership = database.calls.find((call) =>
      call.text.includes("select id from project100_foods"),
    );
    expect(ownership?.text).toContain("where user_id = ?");
    expect(ownership?.values).toContain(TEST_ACTOR.userId);
    expect(
      database.calls.some((call) => call.text.includes("insert into project100_meal_batches")),
    ).toBe(false);
  });

  it("refuses a picture and a batch that belong to another account", async () => {
    await expect(logProject100Meal(TEST_ACTOR, manualMeal("media-elsewhere"))).rejects.toMatchObject(
      { code: "PROJECT100_MEDIA_NOT_FOUND", status: 404 },
    );
    await expect(
      logProject100Meal(TEST_ACTOR, { ...batchMeal(), batchId: "batch-elsewhere" }),
    ).rejects.toMatchObject({ code: "PROJECT100_BATCH_NOT_FOUND", status: 404 });

    expect(database.state.batches.get("batch-elsewhere")?.portionsLeft).toBe(4);
    expect(database.state.meals.size).toBe(0);
    for (const lookup of database.calls.filter(
      (call) =>
        call.text.includes("select id from project100_media") ||
        call.text.includes("from project100_meal_batches"),
    )) {
      expect(lookup.text).toMatch(/user_id = \?/);
      expect(lookup.values).toContain(TEST_ACTOR.userId);
    }
  });
});
describe("Projekt 100 batch portions", () => {
  beforeEach(() => {
    database.reset();
    database.sql.mockClear();
    database.begin.mockClear();
  });

  it("computes a fractional serving once and decrements that exact amount atomically", async () => {
    const saved = await logProject100Meal(TEST_ACTOR, batchMeal(1.5));
    const take = database.calls.find((call) =>
      call.text.includes("set portions_left = portions_left -"),
    );
    const write = database.calls.find((call) => call.text.includes("insert into project100_meals"));

    // The batch contains 156 g protein over six portions: 26 g each.
    expect(saved).toMatchObject({
      title: "Kycklinglåda",
      source: "batch",
      batchId: "batch-owned",
      portions: 1.5,
      proteinG: 39,
      carbsG: 42,
      fatG: 4.5,
      kcal: 375,
    });
    expect(database.state.batches.get("batch-owned")?.portionsLeft).toBe(1.5);
    expect(take?.text).toContain("user_id = ?");
    expect(take?.text).toContain("portions_left >= ?");
    expect(take?.values).toEqual([1.5, "batch-owned", TEST_ACTOR.userId, 1.5]);
    expect(take?.transactionId).not.toBeNull();
    expect(write?.transactionId).toBe(take?.transactionId);
  });

  it("lets only one of two taps take the last portion", async () => {
    const batch = database.state.batches.get("batch-owned");
    if (!batch) throw new Error("Missing owned test batch");
    batch.portionsLeft = 1;

    await expect(logProject100Meal(TEST_ACTOR, batchMeal())).resolves.toMatchObject({ portions: 1 });
    await expect(logProject100Meal(TEST_ACTOR, batchMeal())).rejects.toMatchObject({
      code: "PROJECT100_PORTIONS_GONE",
      status: 409,
    });

    expect(database.state.batches.get("batch-owned")?.portionsLeft).toBe(0);
    expect(database.state.meals.size).toBe(1);
    expect(
      database.calls.filter((call) => call.text.includes("insert into project100_meals")),
    ).toHaveLength(1);
  });

  it("rolls the decrement back when writing the meal fails", async () => {
    database.state.failMealInsert = true;

    await expect(logProject100Meal(TEST_ACTOR, batchMeal(2))).rejects.toThrow(
      "simulated meal insert failure",
    );

    expect(database.state.batches.get("batch-owned")?.portionsLeft).toBe(3);
    expect(database.state.meals.size).toBe(0);
    const take = database.calls.find((call) =>
      call.text.includes("set portions_left = portions_left -"),
    );
    const failedWrite = database.calls.find((call) =>
      call.text.includes("insert into project100_meals"),
    );
    expect(take?.transactionId).not.toBeNull();
    expect(failedWrite?.transactionId).toBe(take?.transactionId);
  });

  it("does not touch batch portions for a manual meal", async () => {
    await logProject100Meal(TEST_ACTOR, manualMeal());

    expect(database.state.batches.get("batch-owned")?.portionsLeft).toBe(3);
    expect(
      database.calls.some((call) => call.text.includes("set portions_left = portions_left -")),
    ).toBe(false);
  });

  it("puts a deleted batch serving back exactly once and never above the batch total", async () => {
    const batch = database.state.batches.get("batch-owned");
    if (!batch) throw new Error("Missing owned test batch");
    batch.portionsLeft = 5.5;
    seedBatchMeal("meal-owned", TEST_ACTOR.userId, "batch-owned", 1.5);

    await expect(deleteProject100Meal(TEST_ACTOR, "meal-owned")).resolves.toBe(true);
    await expect(deleteProject100Meal(TEST_ACTOR, "meal-owned")).resolves.toBe(false);

    expect(database.state.batches.get("batch-owned")?.portionsLeft).toBe(6);
    const restores = database.calls.filter((call) =>
      call.text.includes("set portions_left = least"),
    );
    expect(restores).toHaveLength(1);
    expect(restores[0].text).toContain("least(portions_total, portions_left + ?)");
    expect(restores[0].text).toContain("user_id = ?");
    expect(restores[0].values).toEqual([1.5, "batch-owned", TEST_ACTOR.userId]);
    const remove = database.calls.find((call) => call.text.includes("delete from project100_meals"));
    expect(restores[0].transactionId).toBe(remove?.transactionId);
  });

  it("cannot delete another account's meal or restore portions into its batch", async () => {
    seedBatchMeal("meal-elsewhere", "user-elsewhere", "batch-elsewhere", 1);

    await expect(deleteProject100Meal(TEST_ACTOR, "meal-elsewhere")).resolves.toBe(false);

    expect(database.state.meals.has("meal-elsewhere")).toBe(true);
    expect(database.state.batches.get("batch-elsewhere")?.portionsLeft).toBe(4);
    expect(
      database.calls.some((call) => call.text.includes("set portions_left = least")),
    ).toBe(false);
    expect(database.calls.some((call) => call.text.includes("family_audit_log"))).toBe(false);
  });
});

describe("Projekt 100 recipes & meal planning server operations", () => {
  beforeEach(() => {
    database.reset();
  });

  it("saves a recipe with default portions and owned ingredients", async () => {
    const saved = await saveProject100Recipe(TEST_ACTOR, {
      name: "Kyckling och ris",
      description: "Snabb vardagsmat",
      servingsDefault: 4,
      isFavorite: true,
      instructions: "Koka ris och stek kyckling",
      items: [
        { foodId: "food-chicken", grams: 600 },
        { foodId: "food-rice", grams: 300 },
      ],
    });

    expect(saved.name).toBe("Kyckling och ris");
    expect(saved.servingsDefault).toBe(4);
    expect(saved.isFavorite).toBe(true);
    expect(saved.items).toHaveLength(2);
    expect(saved.items[0].name).toBe("Kyckling");
  });

  it("edits only an owned recipe and replaces its ingredient rows atomically", async () => {
    const saved = await saveProject100Recipe(TEST_ACTOR, recipeInput());

    const updated = await updateProject100Recipe(TEST_ACTOR, saved.id, {
      name: "Kyckling med extra ris",
      description: "Uppdaterad vardagsfavorit",
      servingsDefault: 6,
      isFavorite: false,
      instructions: "Koka och fördela",
      items: [{ foodId: "food-rice", grams: 900 }],
    });

    expect(updated).toMatchObject({
      id: saved.id,
      name: "Kyckling med extra ris",
      description: "Uppdaterad vardagsfavorit",
      servingsDefault: 6,
      isFavorite: false,
      instructions: "Koka och fördela",
    });
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]).toMatchObject({ foodId: "food-rice", grams: 900 });
    expect(database.state.recipeItems.filter((item) => item.recipeId === saved.id)).toHaveLength(1);
  });

  it("cannot edit another account's recipe", async () => {
    database.state.recipes.set("recipe-elsewhere", {
      id: "recipe-elsewhere",
      userId: "user-elsewhere",
      name: "Någon annans recept",
      description: null,
      servingsDefault: 2,
      isFavorite: false,
      instructions: null,
    });

    await expect(
      updateProject100Recipe(TEST_ACTOR, "recipe-elsewhere", recipeInput()),
    ).rejects.toMatchObject({ code: "PROJECT100_RECIPE_NOT_FOUND", status: 404 });
    expect(database.state.recipes.get("recipe-elsewhere")?.name).toBe("Någon annans recept");
  });

  it("refuses to save a recipe with foods owned by another user", async () => {
    await expect(
      saveProject100Recipe(TEST_ACTOR, {
        name: "Otillåtet recept",
        description: null,
        servingsDefault: 2,
        isFavorite: false,
        instructions: null,
        items: [{ foodId: "food-elsewhere", grams: 200 }],
      }),
    ).rejects.toThrow("En av råvarorna finns inte.");
  });

  it("creates a recipe from an existing batch", async () => {
    const recipe = await saveProject100RecipeFromBatch(TEST_ACTOR, {
      batchId: "batch-owned",
      name: "Sparat recept från sats",
      description: "Baserat på kycklinglåda",
      isFavorite: true,
    });

    expect(recipe.name).toBe("Sparat recept från sats");
    expect(recipe.servingsDefault).toBe(6);
    expect(recipe.items).toHaveLength(2);
  });

  it("creates a reusable favorite from an owned manual meal", async () => {
    const meal = await logProject100Meal(TEST_ACTOR, manualMeal());

    const recipe = await saveProject100RecipeFromMeal(TEST_ACTOR, {
      mealId: meal.id,
      name: "Standardfrukost",
      description: "Gröt och ägg",
      servingsDefault: 1,
      isFavorite: true,
    });

    expect(recipe).toMatchObject({
      name: "Standardfrukost",
      description: "Gröt och ägg",
      servingsDefault: 1,
      isFavorite: true,
    });
    expect(recipe.items).toHaveLength(1);
    expect(recipe.items[0]).toMatchObject({
      name: "Standardfrukost (bas)",
      grams: 100,
      proteinPer100g: 31,
      carbsPer100g: 62,
      fatPer100g: 18,
    });
  });

  it("cooks a batch from a recipe, scaling the ingredients accurately", async () => {
    const recipe = await saveProject100Recipe(TEST_ACTOR, {
      name: "Basrecept",
      description: null,
      servingsDefault: 4,
      isFavorite: false,
      instructions: "Stek",
      items: [{ foodId: "food-chicken", grams: 400 }],
    });

    // Cook 8 portions (2x the 4-portion base)
    const cooked = await cookBatchFromRecipe(TEST_ACTOR, {
      recipeId: recipe.id,
      name: "Dubbel sats",
      cookedOn: "2026-08-30",
      portionsTotal: 8,
      note: "Infryst för veckan",
    });

    expect(cooked.name).toBe("Dubbel sats");
    expect(cooked.portionsTotal).toBe(8);
    expect(cooked.portionsLeft).toBe(8);
    expect(cooked.items[0].grams).toBe(800); // 400g * (8/4) = 800g
  });

  it("archives a recipe cleanly", async () => {
    const recipe = await saveProject100Recipe(TEST_ACTOR, {
      name: "Att radera",
      description: null,
      servingsDefault: 1,
      isFavorite: false,
      instructions: null,
      items: [{ foodId: "food-rice", grams: 100 }],
    });

    await expect(archiveProject100Recipe(TEST_ACTOR, recipe.id)).resolves.toBe(true);
    const list = await loadProject100Recipes(TEST_ACTOR);
    expect(list.some((r) => r.id === recipe.id)).toBe(false);
  });

  it("updates pantry stock for owned foods and isolates other users", async () => {
    const updated = await updateProject100PantryStock(TEST_ACTOR, {
      foodId: "food-chicken",
      inStockGrams: 850,
    });

    expect(updated.inStockGrams).toBe(850);

    // Attempting to update another user's food throws 404
    await expect(
      updateProject100PantryStock(TEST_ACTOR, {
        foodId: "food-elsewhere",
        inStockGrams: 500,
      }),
    ).rejects.toThrow("Råvaran finns inte.");
  });

  it("saves and loads a meal plan week with derived shopping list", async () => {
    const recipe = await saveProject100Recipe(TEST_ACTOR, {
      name: "Veckokyckling",
      description: null,
      servingsDefault: 4,
      isFavorite: false,
      instructions: null,
      items: [{ foodId: "food-chicken", grams: 1000 }], // 250g/portion
    });

    await saveProject100MealPlan(TEST_ACTOR, {
      plannedDate: "2026-08-31",
      plannedMinute: 720,
      mealType: "lunch",
      source: "recipe",
      recipeId: recipe.id,
      batchId: null,
      title: "Planerad lunch",
      portions: 2, // needs 500g chicken
      isCooked: false,
      note: "Matlåda till jobbet",
    });

    const week = await loadProject100MealPlanWeek(TEST_ACTOR, "2026-08-31");

    expect(week.days).toHaveLength(7);
    expect(week.days[0].plans).toHaveLength(1);
    expect(week.days[0].plans[0].title).toBe("Planerad lunch");

    // In stock chicken = 400g. Staple target = 1000g. Needed from recipe = 500g.
    // Gross demand = max(500, 1000) = 1000g. Buy = 1000 - 400 = 600g.
    const chickenShopping = week.shoppingList.items.find((i) => i.foodId === "food-chicken");
    expect(chickenShopping).toBeDefined();
    expect(chickenShopping?.buyGrams).toBe(600);
  });

  it("normalizes any selected date to Monday–Sunday and reads that exact work week", async () => {
    const week = await loadProject100MealPlanWeek(TEST_ACTOR, "2026-09-16");

    expect(week.weekStart).toBe("2026-09-14");
    expect(week.weekEnd).toBe("2026-09-20");
    expect(week.days.map((day) => day.date)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(week.days[1].workEvents.map((event) => event.id)).toEqual(["work-selected-week"]);

    const workRead = database.calls.find((call) => call.text.includes("from family_events"));
    expect(workRead?.values.slice(0, 2)).toEqual([
      TEST_ACTOR.householdId,
      TEST_ACTOR.personId,
    ]);
    expect((workRead?.values[2] as Date).toISOString()).toBe("2026-09-20T22:00:00.000Z");
    expect((workRead?.values[3] as Date).toISOString()).toBe("2026-09-13T22:00:00.000Z");
  });

  it("audits planner mutations without copying quantities, titles or notes", async () => {
    const recipe = await saveProject100Recipe(TEST_ACTOR, recipeInput());
    await updateProject100PantryStock(TEST_ACTOR, {
      foodId: "food-chicken",
      inStockGrams: 987.6,
    });
    const plan = await saveProject100MealPlan(TEST_ACTOR, {
      plannedDate: "2026-08-31",
      plannedMinute: 720,
      mealType: "lunch",
      source: "custom",
      recipeId: null,
      batchId: null,
      title: "Privat planerad lunch",
      portions: 1,
      isCooked: false,
      note: "Hemlig planeringsanteckning",
    });
    await deleteProject100MealPlan(TEST_ACTOR, plan.id);
    await archiveProject100Recipe(TEST_ACTOR, recipe.id);

    const auditCalls = database.calls.filter((call) => call.text.includes("family_audit_log"));
    const serialized = JSON.stringify(auditCalls.map((call) => call.values));

    for (const action of [
      "project100.nutrition.pantry.update",
      "project100.nutrition.plan.create",
      "project100.nutrition.plan.delete",
      "project100.nutrition.recipe.delete",
    ]) {
      expect(serialized).toContain(action);
    }
    expect(serialized).not.toContain("987.6");
    expect(serialized).not.toContain("Privat planerad lunch");
    expect(serialized).not.toContain("Hemlig planeringsanteckning");
  });
});
