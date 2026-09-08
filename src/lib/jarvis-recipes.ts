export interface FridgeMealSuggestion {
  title: string;
  description: string;
  estimatedProteinGrams: number;
  estimatedCalories: number;
  cookingTimeMinutes: number;
  usedIngredients: string[];
  suggestedAdditions: string[];
  instructions: string[];
}

interface RecipeTemplate {
  title: string;
  description: string;
  proteinGrams: number;
  calories: number;
  cookingTimeMinutes: number;
  requiredKeys: string[];
  optionalAdditions: string[];
  instructions: string[];
}

const RECIPE_DATABASE: RecipeTemplate[] = [
  {
    title: "Proteinrik Köttfärssås & Pasta",
    description: "Klassisk, mättande vardagsfavorit med hög proteinhalt och snabb tillagningstid.",
    proteinGrams: 48,
    calories: 680,
    cookingTimeMinutes: 25,
    requiredKeys: ["köttfärs", "nötfärs", "färs", "pasta", "spagetti", "makaroner", "tomat", "krossade tomater", "lök"],
    optionalAdditions: ["vitlök", "oregano", "riven parmesan", "morot"],
    instructions: [
      "Bryn färs och hackad lök i en stekpanna.",
      "Tillsätt krossade tomater och krydda med salt, peppar och örter.",
      "Koka pastan al dente och vänd ihop med såsen.",
    ],
  },
  {
    title: "Snabb Pyttipanna med Stekt Ägg",
    description: "Perfekt kylskåpstömning som samlar rester av potatis och kött med hög mättnadskänsla.",
    proteinGrams: 42,
    calories: 620,
    cookingTimeMinutes: 20,
    requiredKeys: ["potatis", "ägg", "bacon", "korv", "kött", "skinka", "lök"],
    optionalAdditions: ["rödbetor", "persilja", "senap"],
    instructions: [
      "Tärna potatis och lök samt eventuellt kött/bacon/korv.",
      "Stek potatisen krispig i smör på medelhög värme, vänd ner lök och kött.",
      "Stek äggen med lös gula och servera ovanpå.",
    ],
  },
  {
    title: "Kycklingpanna med Ris & Grönsaker",
    description: "Ren och balanserad träningsmåltid med magert kycklingbröst och komplexa kolhydrater.",
    proteinGrams: 52,
    calories: 590,
    cookingTimeMinutes: 25,
    requiredKeys: ["kyckling", "kycklingfilé", "ris", "grädde", "creme fraiche", "broccoli", "grönsaker"],
    optionalAdditions: ["sojasås", "curry", "paprika"],
    instructions: [
      "Koka riset enligt anvisning.",
      "Strimla kycklingfilén och bryn gyllenbrun.",
      "Tillsätt grönsaker och en skvätt grädde eller sås och låt sjuda 5 minuter.",
    ],
  },
  {
    title: "Bondomelett med Bacon & Potatis",
    description: "Supersnabb proteinbomb som fixas på under 15 minuter.",
    proteinGrams: 38,
    calories: 540,
    cookingTimeMinutes: 15,
    requiredKeys: ["ägg", "bacon", "potatis", "ost", "mjölk"],
    optionalAdditions: ["gräslök", "tomat", "spenat"],
    instructions: [
      "Stek bacon och tärnad potatis knaprigt.",
      "Vispa ihop 3–4 ägg med lite vatten eller mjölk, salt och peppar.",
      "Häll smeten över pannan, toppa med ost och låt stelna på låg värme under lock.",
    ],
  },
  {
    title: "Krämig Tonfiskpasta",
    description: "Blixtsnabb skafferiräddare som ger maximalt med protein per krona och minut.",
    proteinGrams: 46,
    calories: 610,
    cookingTimeMinutes: 15,
    requiredKeys: ["tonfisk", "pasta", "creme fraiche", "grädde", "lök"],
    optionalAdditions: ["citron", "dill", "kapris", "majs"],
    instructions: [
      "Koka pastan.",
      "Fräs hackad lök mjukt och rör ner avrunnen tonfisk och créme fraîche/grädde.",
      "Vänd ner den nykokta pastan och smaka av med citron och svartpeppar.",
    ],
  },
];

/**
 * Extracts normalized ingredient names from Swedish natural query text.
 */
export function parseFridgeQueryIngredients(text: string): string[] {
  let clean = text
    .replace(/^.*?(?:laga\s*(?:på|av|med)|kylskåpstömning[:\s]*|äta.*?har|finns\s*i\s*(?:kylen|skafferiet)|hittade)/i, "")
    .replace(/(?:i\s*(?:kylen|skafferiet|frysen)|till\s*middag|till\s*lunch|ikväll|idag)[\s!.]*$/gi, "");

  const parts = clean.split(/[,+&]|\boch\b|\bsamt\b/i);

  const list: string[] = [];
  for (const part of parts) {
    const trimmed = part
      .replace(/[?!.]/g, "")
      .replace(/\b(?:jag\s+har|vi\s+har|man\s+har|har|finns|det\s+finns|en|ett|lite|litegrann|några|halv|halvt|rester\s*av|paket|burk|gram|kg)\b/gi, "")
      .trim()
      .toLowerCase();

    if (trimmed.length >= 2) {
      list.push(trimmed);
    }
  }

  return Array.from(new Set(list));
}

/**
 * Generates protein-rich meal recommendations based on available ingredients.
 */
export function generateFridgeMealSuggestions(
  ingredients: readonly string[],
): FridgeMealSuggestion[] {
  const normalizedIngredients = ingredients.map((i) => i.toLowerCase().trim());

  const scored = RECIPE_DATABASE.map((recipe) => {
    const matched: string[] = [];
    for (const ing of normalizedIngredients) {
      const hits = recipe.requiredKeys.some((k) => ing.includes(k) || k.includes(ing));
      if (hits) {
        matched.push(ing);
      }
    }

    const missing = recipe.optionalAdditions.filter(
      (opt) => !normalizedIngredients.some((ing) => ing.includes(opt) || opt.includes(ing)),
    );

    return {
      recipe,
      matchCount: matched.length,
      usedIngredients: Array.from(new Set(matched)),
      suggestedAdditions: missing.slice(0, 3),
    };
  });

  // Sort by highest ingredient matches
  scored.sort((a, b) => b.matchCount - a.matchCount);

  // Return best matches
  const topMatches = scored.filter((s) => s.matchCount >= 1).slice(0, 2);

  if (topMatches.length === 0) {
    // Fallback: generic high-protein scramble/stir-fry
    return [
      {
        title: "Kylskåps-Wok / Träningspanna",
        description: "Stek ihop dina tillgängliga råvaror med kryddor och toppa med ägg för extra protein.",
        estimatedProteinGrams: 35,
        estimatedCalories: 520,
        cookingTimeMinutes: 15,
        usedIngredients: [...normalizedIngredients],
        suggestedAdditions: ["ägg", "sojasås", "olivolja"],
        instructions: [
          "Skär upp dina råvaror i jämna bitar.",
          "Hetta upp en panna med olja och stek proteinet först, följt av grönsaker och kolhydrater.",
          "Smaksätt med salt, peppar och dina favoritkryddor.",
        ],
      },
    ];
  }

  return topMatches.map((item) => ({
    title: item.recipe.title,
    description: item.recipe.description,
    estimatedProteinGrams: item.recipe.proteinGrams,
    estimatedCalories: item.recipe.calories,
    cookingTimeMinutes: item.recipe.cookingTimeMinutes,
    usedIngredients: item.usedIngredients,
    suggestedAdditions: item.suggestedAdditions,
    instructions: item.recipe.instructions,
  }));
}

/**
 * Formats meal suggestions for conversational Telegram/web output.
 */
export function formatFridgeSuggestionsReply(
  suggestions: readonly FridgeMealSuggestion[],
  ingredients: readonly string[],
): string {
  if (suggestions.length === 0) {
    return "Jag kunde inte hitta något klockrent recept på just det. Har du några basvaror som ägg, ris eller pasta hemma?";
  }

  let text = `Med **${ingredients.join(", ")}** kan du göra:\n\n`;

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    text += `🍳 **${s.title}** (~${s.cookingTimeMinutes} min)\n`;
    text += `💪 ${s.estimatedProteinGrams}g protein · ~${s.estimatedCalories} kcal\n`;
    text += `*${s.description}*\n`;
    if (s.suggestedAdditions.length > 0) {
      text += `💡 *Gott att komplettera med:* ${s.suggestedAdditions.join(", ")}\n`;
    }
    if (i < suggestions.length - 1) text += "\n";
  }

  text += "\nVill du att jag sätter upp saknade ingredienser på inköpslistan?";
  return text;
}

/**
 * Detects whether a user message is asking for recipe suggestions or fridge clearing meals.
 */
export function isFridgeMealQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /(?:kylskåpstömning|kylskåpsrensning|kylskåp|skafferi)/i.test(lower) ||
    /(?:vad\s*(?:kan|ska)\s*(?:vi|jag|man)\s*(?:laga|äta|göra\s*(?:för\s*mat)?))/i.test(lower) ||
    /(?:middagsförslag|matförslag|middagstips|receptförslag)/i.test(lower) ||
    (/(?:vad\s*göra\s*med|recept\s*(?:på|med)|laga\s*(?:på|av|med))/i.test(lower) &&
      /(?:kyckling|köttfärs|ägg|tonfisk|pasta|ris|potatis|korv|bacon|färs|lax)/i.test(lower))
  );
}
