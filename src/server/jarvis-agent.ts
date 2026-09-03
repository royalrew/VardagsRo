import OpenAI from "openai";

import {
  addCalendarDateDays,
  calendarDateInTimeZone,
  clockValueInTimeZone,
  DEFAULT_TIME_ZONE,
  minuteOfDayInTimeZone,
} from "@/lib/dates";
import { eventConcernsPerson } from "@/lib/family-scope";
import {
  type Project100MemoryCategory,
} from "@/lib/project100-jarvis";
import { parseMemoryCommand } from "@/lib/project100-memory-classifier";
import type { Project100MeasurementUnit } from "@/lib/project100-body";
import type { Project100MealType } from "@/lib/project100-nutrition";
import type { Project100ActivityType } from "@/lib/project100-training";
import { openAIConfig } from "@/server/config";
import {
  loadDashboard,
  readyClient,
  removeEvent,
  removeTask,
  saveManualEvent,
  saveManualTask,
  updateManualEvent,
  updateManualTask,
} from "@/server/database";
import { assertProject100Adult } from "@/server/project100";
import { deleteProject100Memory } from "@/server/project100-jarvis";
import { loadProject100BodyJourney, saveProject100BodyEntry } from "@/server/project100-body";
import { getCleaningAreaForPerson, getKidsChoresOverview } from "@/lib/kids-chores";
import { createProject100ContentProject } from "@/server/project100-content";
import { logJarvisCapabilityGap } from "@/server/jarvis-gaps";
import { loadProject100Journal, saveProject100JournalEntry } from "@/server/project100-journal";
import { handleMemoryTextIntent } from "@/server/project100-memory-assistant";
import {
  loadProject100NutritionDay,
  logProject100Meal,
} from "@/server/project100-nutrition";
import {
  createProject100TrainingSession,
  loadProject100TrainingSessions,
  loadProject100TrainingTemplates,
  updateProject100TrainingSession,
} from "@/server/project100-training";
import { sanitizePII } from "@/server/pii-sanitizer";
import {
  generateEveningBriefing,
  generateMorningBriefing,
} from "@/server/jarvis-briefing";
import {
  createContextualReminder,
  parseSwedishReminder,
} from "@/server/jarvis-reminders";
import type { ActorContext } from "@/server/authorization-types";

let agentClient: OpenAI | null = null;
let agentClientKey = "";

function getAgentClient(): { client: OpenAI; model: string } | null {
  const config = openAIConfig();
  if (!config) return null;
  if (!agentClient || agentClientKey !== config.apiKey) {
    agentClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });
    agentClientKey = config.apiKey;
  }
  return { client: agentClient, model: config.model };
}

export interface JarvisAgentOptions {
  channel?: "telegram" | "web";
  personName?: string;
  conversationId?: string;
}

export interface JarvisAgentResult {
  text: string;
  executedActions: string[];
}

const SWEDISH_WEEKDAYS: Record<string, number> = {
  söndag: 0,
  måndag: 1,
  tisdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lördag: 6,
};

const SWEDISH_MONTHS: Record<string, string> = {
  januari: "01",
  februari: "02",
  mars: "03",
  april: "04",
  maj: "05",
  juni: "06",
  juli: "07",
  augusti: "08",
  september: "09",
  oktober: "10",
  november: "11",
  december: "12",
};

export function resolveSwedishTargetDate(
  text: string,
  referenceDate: Date = new Date(),
): { targetDate: string; dateLabel: string } {
  const lower = text.toLowerCase();
  const todayStr = calendarDateInTimeZone(referenceDate, DEFAULT_TIME_ZONE);
  const refParts = new Date(`${todayStr}T12:00:00Z`);
  const refDayOfWeek = refParts.getUTCDay();

  if (/\bi\s*förrgår\b|\biförrgår\b/i.test(lower)) {
    return {
      targetDate: addCalendarDateDays(todayStr, -2),
      dateLabel: "i förrgår",
    };
  }

  if (/\bigår\b|\bi\s*går\b|\bgårdagen\b/i.test(lower)) {
    return {
      targetDate: addCalendarDateDays(todayStr, -1),
      dateLabel: "igår",
    };
  }

  if (/\bi\s*övermorgon\b/i.test(lower)) {
    return {
      targetDate: addCalendarDateDays(todayStr, 2),
      dateLabel: "i övermorgon",
    };
  }

  if (/\bimorgon\b|\bi\s*morgon\b|\bimorn\b|\bi\s*morn\b|\bmorgondagen\b/i.test(lower)) {
    return {
      targetDate: addCalendarDateDays(todayStr, 1),
      dateLabel: "imorgon",
    };
  }

  if (/\bidag\b|\bi\s*dag\b|\bikväll\b|\bi\s*kväll\b/i.test(lower)) {
    return {
      targetDate: todayStr,
      dateLabel: "idag",
    };
  }

  // Past weekdays: "i måndags", "i tisdags", "i fredags"
  for (const [name, dayNum] of Object.entries(SWEDISH_WEEKDAYS)) {
    const regex = new RegExp(`\\bi\\s+${name.slice(0, -2)}ags\\b|\\bi\\s+${name}s\\b`, "i");
    if (regex.test(lower)) {
      let diff = (refDayOfWeek - dayNum + 7) % 7;
      if (diff === 0) diff = 7;
      return {
        targetDate: addCalendarDateDays(todayStr, -diff),
        dateLabel: `i ${name.slice(0, -2)}ags`,
      };
    }
  }

  // Upcoming weekdays: "på måndag", "måndag"
  for (const [name, dayNum] of Object.entries(SWEDISH_WEEKDAYS)) {
    const regex = new RegExp(`\\b(?:på\\s+)?${name}\\b`, "i");
    if (regex.test(lower)) {
      let diff = (dayNum - refDayOfWeek + 7) % 7;
      if (diff === 0) diff = 7;
      return {
        targetDate: addCalendarDateDays(todayStr, diff),
        dateLabel: `på ${name}`,
      };
    }
  }

  // Explicit date: "den 1a september" / "den 1:a september" / "1 september" / "15:e okt"
  const dateMatch = lower.match(/\b(?:den\s+)?(\d{1,2})(?::?[e|a])?\s+([a-zåäö]+)/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const monthKey = dateMatch[2].toLowerCase();
    const month = SWEDISH_MONTHS[monthKey] || Object.entries(SWEDISH_MONTHS).find(([k]) => monthKey.startsWith(k.slice(0, 3)))?.[1];
    if (month) {
      const year = referenceDate.getFullYear();
      return {
        targetDate: `${year}-${month}-${day}`,
        dateLabel: `den ${Number(day)} ${monthKey}`,
      };
    }
  }

  return {
    targetDate: todayStr,
    dateLabel: "idag",
  };
}

const JARVIS_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_daily_briefing",
      description: "Generera en fullständig morgonöversikt eller kvällsavstämning som sammanfattar jobbschema, familjehändelser, skola, träningsfönster, proteinmål och uppgifter.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["morning", "evening"],
            description: "Typ av briefing: 'morning' för morgonöversikt eller 'evening' för kvällsavstämning.",
          },
          date: {
            type: "string",
            description: "Valfritt datum i format YYYY-MM-DD (standard är idag).",
          },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_schedule",
      description: "Slå upp arbetspass, jobbschema och kalenderhändelser för ett specifikt datum eller tidsperiod.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Datum i formatet YYYY-MM-DD (t.ex. 2026-09-25).",
          },
          query: {
            type: "string",
            description: "Valfri sökfras, t.ex. 'kväll', 'jobb', 'ledig'.",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Skapa en uppgift, att-göra-post eller påminnelse i hushållets att-göra-lista.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Uppgiftens rubrik, t.ex. 'Boka bord på en fin restaurang' eller 'Ring tandläkaren'.",
          },
          due_date: {
            type: "string",
            description: "Valfritt datum/tid för när uppgiften ska göras (YYYY-MM-DD eller ISO).",
          },
          notes: {
            type: "string",
            description: "Valfria anteckningar eller detaljer.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Spara vardagsfakta, koder, mått, däck, förrådsuppgifter eller rutiner i hushållets minnesbank.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "job",
              "car",
              "house",
              "kids",
              "finance",
              "health",
              "goal",
              "equipment",
              "preference",
              "routine",
              "injury",
              "recovery",
              "general",
            ],
            description: "Kategori för minnet.",
          },
          content: {
            type: "string",
            description: "Faktan som ska kommas ihåg, t.ex. 'Koden till inkontinensförrådet är 2214'.",
          },
        },
        required: ["category", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memory",
      description: "Sök i minnesbanken efter koder, däck, mått eller sparade uppgifter.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Sökfras eller fråga, t.ex. 'kod förråd' eller 'däck'.",
          },
          category: {
            type: "string",
            description: "Valfri kategori att filtrera på.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_journal",
      description: "Logga dagens reflektion, mående, energinivå eller sömntimmar i dagboken.",
      parameters: {
        type: "object",
        properties: {
          reflection: {
            type: "string",
            description: "Reflektion, tankar eller händelser under dagen.",
          },
          energy: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "Energinivå från 1 (låg) till 5 (hög).",
          },
          mood: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "Humör från 1 (låg) till 5 (hög).",
          },
          sleep_hours: {
            type: "number",
            description: "Antal timmars sömn.",
          },
          date: {
            type: "string",
            description: "Valfritt datum i format YYYY-MM-DD (standard är idag).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_content_idea",
      description: "Spara en ny idé till ett YouTube- eller innehållsprojekt.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Projekt- eller videotitel.",
          },
          concept: {
            type: "string",
            description: "Kärnidé eller beskrivning av videon.",
          },
          hook: {
            type: "string",
            description: "Krok för videons första 15 sekunder.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_body_measurement",
      description: "Logga vikt (t.ex. 80.5 kg), midjemått (t.ex. 84 cm), bröstmått, armar eller andra kroppsmätningar för ett datum.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["weight", "waist", "chest", "arms", "calves", "custom"],
            description: "Typ av mått: 'weight' (vikt i kg), 'waist' (midjemått i cm), 'chest' (bröst), 'arms' (armar), etc.",
          },
          value: {
            type: "number",
            description: "Mätvärdet (t.ex. 80.5 för vikt, 84 för midjemått).",
          },
          unit: {
            type: "string",
            enum: ["kg", "cm", "percent"],
            description: "Enhet ('kg' för vikt, 'cm' för omkrets, 'percent' för kroppsfett).",
          },
          notes: {
            type: "string",
            description: "Valfri anteckning till mätningen.",
          },
          date: {
            type: "string",
            description: "Datum för mätningen i format YYYY-MM-DD (standard är idag).",
          },
        },
        required: ["metric", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_quick_nutrition",
      description: "Logga en snabb måltid, proteinshake, mellanmål eller lunch med proteinmängd och eventuella kalorier.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Måltidens namn, t.ex. 'Proteinshake', 'Kyckling och ris', 'Keso med bär'.",
          },
          protein_g: {
            type: "number",
            description: "Mängd protein i gram (t.ex. 35, 42).",
          },
          energy_kcal: {
            type: "number",
            description: "Valfri energimängd i kilokalorier (kcal).",
          },
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack"],
            description: "Måltidstyp (standard är 'snack' för shakes/mellanmål).",
          },
          date: {
            type: "string",
            description: "Datum för måltiden i format YYYY-MM-DD (standard är idag).",
          },
        },
        required: ["title", "protein_g"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_quick_workout",
      description: "Skapa och logga ett snabbt eller spontant genomfört träningspass (t.ex. löpning, hemmapass, skogspromenad, armhävningar).",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Passets namn (t.ex. 'Löpning 5 km', 'Hemmapass armhävningar', 'Skogspromenad').",
          },
          activity_type: {
            type: "string",
            enum: ["strength_home", "forest", "running", "cycling", "spinning", "outdoor_gym", "other"],
            description: "Aktivitetstyp (standard är 'strength_home').",
          },
          duration_minutes: {
            type: "number",
            description: "Passets längd i minuter.",
          },
          distance_km: {
            type: "number",
            description: "Valfri distans i kilometer (t.ex. 5.0 för 5 km löpning).",
          },
          effort: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "Upplevd ansträngning från 1 till 10.",
          },
          notes: {
            type: "string",
            description: "Valfria anteckningar eller utförda övningar/reps.",
          },
          date: {
            type: "string",
            description: "Datum i format YYYY-MM-DD (standard är idag).",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_planned_session",
      description: "Klarmarkera ett planerat träningspass som genomfört för dagen (t.ex. när användaren säger 'jag körde mitt benpass enligt planen').",
      parameters: {
        type: "object",
        properties: {
          title_search: {
            type: "string",
            description: "Valfri sökfras för passets namn, t.ex. 'benpass', 'överkropp', 'pass'.",
          },
          duration_minutes: {
            type: "number",
            description: "Valfri faktisk tid i minuter.",
          },
          effort: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "Upplevd ansträngning från 1 till 10.",
          },
          notes: {
            type: "string",
            description: "Valfria anteckningar.",
          },
          date: {
            type: "string",
            description: "Datum i format YYYY-MM-DD (standard är idag).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documents",
      description: "Sök bland familjens uppladdade dokument, PDF:er, kallelser, scheman, blanketter och avtal för att svara på frågor om vad dokumenten innehåller.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Sökord eller ämne, t.ex. 'tandläkare', 'skola', 'vaccination', 'bvc', 'försäkring', 'hyra', 'betyg'.",
          },
          person_name: {
            type: "string",
            description: "Valfritt namn på familjemedlemmen som dokumentet gäller.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_training_status",
      description: "Hämta dagens träningsstatus, inplanerade pass, genomförda pass, tillgängliga passmallar och träningsfönster.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Valfritt datum i format YYYY-MM-DD (standard är idag).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nutrition_status",
      description: "Hämta dagens koststatus, loggat protein, proteinmål, loggade måltider och tillgängliga matlådor.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Valfritt datum i format YYYY-MM-DD (standard är idag).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_kids_chores_status",
      description: "Kontrollera status på barnens städområden och uppgifter (om Alma, Shureym eller Cuzeyr är färdiga med sina städområden/uppgifter eller vad som återstår).",
      parameters: {
        type: "object",
        properties: {
          person_name: {
            type: "string",
            description: "Valfritt namn på specifikt barn (t.ex. 'Alma', 'Shureym', 'Cuzeyr') eller tomt för alla barn.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_day_history",
      description: "Hämta en fullständig historisk sammanfattning för ett visst datum (vad användaren gjorde, arbetspass, genomförda träningspass, loggad mat/protein, avklarade uppgifter, vikt och dagboksanteckningar).",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Datum i formatet YYYY-MM-DD (t.ex. '2026-09-01').",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Skapa en ny kalenderhändelse, möte, kalas, match eller aktivitet i familjekalendern.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Händelsens titel (t.ex. 'Kalas hos mormor', 'Fotbollsmatch Alma').",
          },
          date: {
            type: "string",
            description: "Datum i formatet YYYY-MM-DD.",
          },
          start_time: {
            type: "string",
            description: "Valfri starttid i format HH:MM (t.ex. '14:00').",
          },
          end_time: {
            type: "string",
            description: "Valfri sluttid i format HH:MM (t.ex. '16:00').",
          },
          person_name: {
            type: "string",
            description: "Valfritt namn på vem händelsen gäller (t.ex. 'Alma', 'Jimmy', 'Hanni') eller tomt för hela familjen.",
          },
          location: {
            type: "string",
            description: "Valfri plats.",
          },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_item",
      description: "Ändra eller flytta en befintlig uppgift, påminnelse eller kalenderhändelse (t.ex. ändra datum, tid, titel eller klarmarkera).",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["task", "event"],
            description: "Typ av objekt att ändra: 'task' (uppgift/påminnelse) eller 'event' (kalenderhändelse).",
          },
          query: {
            type: "string",
            description: "Sökord för att hitta uppgiften eller händelsen som ska ändras (t.ex. 'mjölk', 'tandläkare', 'kalas').",
          },
          new_title: {
            type: "string",
            description: "Ny titel om den ska ändras.",
          },
          new_date: {
            type: "string",
            description: "Nytt datum i format YYYY-MM-DD.",
          },
          new_time: {
            type: "string",
            description: "Ny tid i format HH:MM.",
          },
          completed: {
            type: "boolean",
            description: "Om uppgiften ska markeras som klar (true) eller öppen (false).",
          },
        },
        required: ["type", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_item",
      description: "Ta bort eller radera en uppgift, påminnelse, kalenderhändelse eller minne.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["task", "event", "memory"],
            description: "Typ av objekt att ta bort: 'task' (uppgift), 'event' (kalenderhändelse), 'memory' (minnesanteckning).",
          },
          query: {
            type: "string",
            description: "Sökord för att hitta det som ska tas bort (t.ex. 'handla mjölk', 'kalas', 'portkod').",
          },
        },
        required: ["type", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_missing_capability",
      description: "Logga en förfrågan eller funktion som Jarvis inte har stöd för att utföra ännu till utvecklingslistan.",
      parameters: {
        type: "object",
        properties: {
          missing_feature: {
            type: "string",
            description: "Beskrivning av vad användaren efterfrågar som saknas (t.ex. 'Bilbesiktning', 'Elpriser', 'Kylskåpsrecept').",
          },
          category_hint: {
            type: "string",
            description: "Valfri kategori, t.ex. 'car', 'finance', 'house', 'nutrition', 'kids', 'general'.",
          },
        },
        required: ["missing_feature"],
      },
    },
  },
];

function getGreeting(name: string, now: Date): string {
  const hour = now.getHours();
  let timeGreeting = "Hej";
  if (hour >= 5 && hour < 10) timeGreeting = "God morgon";
  else if (hour >= 17 && hour < 23) timeGreeting = "God kväll";
  else if (hour >= 23 || hour < 5) timeGreeting = "God natt";

  return `${timeGreeting} ${name}!`;
}

export async function processJarvisAgentMessage(
  actor: ActorContext,
  messageText: string,
  options: JarvisAgentOptions = {},
): Promise<JarvisAgentResult> {
  assertProject100Adult(actor);

  const now = new Date();
  const today = calendarDateInTimeZone(now, DEFAULT_TIME_ZONE);
  const callerName = options.personName || "Jimmy";
  const executedActions: string[] = [];

  const text = messageText.trim();
  if (!text) {
    return {
      text: `${getGreeting(callerName, now)} Hur kan jag hjälpa dig?`,
      executedActions: [],
    };
  }

  // 1. Tool execution implementations
  async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    executedActions.push(name);

    if (name === "get_daily_briefing") {
      const type = String(args.type || "morning").toLowerCase();
      const date = args.date ? String(args.date) : today;

      if (type === "evening") {
        const briefing = await generateEveningBriefing(actor, { date, callerName });
        return JSON.stringify({
          success: true,
          type: "evening",
          summary: briefing.text,
          data: briefing,
        });
      }

      const briefing = await generateMorningBriefing(actor, { date, callerName });
      return JSON.stringify({
        success: true,
        type: "morning",
        summary: briefing.text,
        data: briefing,
      });
    }

    if (name === "check_schedule") {
      const date = String(args.date || today);
      const dashboard = await loadDashboard(actor);
      const targetPersonName = args.person_name
        ? String(args.person_name).trim().toLowerCase()
        : null;

      const eventsOnDate = dashboard.events.filter(
        (e) => calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === date,
      );

      if (eventsOnDate.length === 0) {
        return JSON.stringify({
          date,
          status: "free",
          eventsCount: 0,
          summary: `Inga inlagda händelser eller arbetspass den ${date}.`,
        });
      }

      let relevantEvents = eventsOnDate;
      if (targetPersonName) {
        const matched = dashboard.people.find(
          (p) =>
            p.name.toLowerCase().includes(targetPersonName) ||
            p.aliases.some((a) => a.toLowerCase().includes(targetPersonName)),
        );
        if (matched) {
          relevantEvents = eventsOnDate.filter((e) =>
            eventConcernsPerson(e, matched.id),
          );
        }
      }

      const workEvents = relevantEvents.filter((e) => e.category === "work");
      const isEvening = workEvents.some((e) => {
        const startMinute = minuteOfDayInTimeZone(e.startsAt, DEFAULT_TIME_ZONE);
        return startMinute >= 15 * 60;
      });

      const formattedEvents = relevantEvents.map((e) => {
        const person = dashboard.people.find((p) => p.id === e.personId);
        const timeStr = e.allDay
          ? "Hela dagen"
          : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`;
        return `${e.title}${person ? ` (${person.name})` : ""} kl. ${timeStr}`;
      });

      return JSON.stringify({
        date,
        status: workEvents.length > 0 ? "working" : "has_events",
        eventsCount: relevantEvents.length,
        isEveningShift: isEvening,
        events: relevantEvents.map((e) => ({
          title: e.title,
          category: e.category,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          formattedTime: e.allDay
            ? "Hela dagen"
            : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`,
        })),
        summary: `Hittade ${relevantEvents.length} händelse(r) den ${date}: ${formattedEvents.join(", ")}`,
      });
    }

    if (name === "create_task") {
      const title = String(args.title || "Ny uppgift");
      const dueDate = args.due_date ? String(args.due_date) : null;
      const notes = args.notes ? String(args.notes) : null;
      const contextAnchor = args.context_anchor ? String(args.context_anchor).toLowerCase() : undefined;

      if (contextAnchor || (dueDate && dueDate.length === 10)) {
        const res = await createContextualReminder(actor, {
          title,
          targetDate: dueDate ? dueDate.slice(0, 10) : today,
          timeString: args.time_string ? String(args.time_string) : undefined,
          contextAnchor: contextAnchor as "after_work" | "before_work" | "morning" | "afternoon" | "evening",
          notes: notes || undefined,
        });

        return JSON.stringify({
          success: true,
          taskId: res.taskId,
          title: res.title,
          dueDate: res.dueAt,
          summary: res.text,
        });
      }

      const created = await saveManualTask(actor, {
        title,
        personId: actor.personId,
        kind: "other",
        recurrence: "once",
        dueAt: dueDate,
        notes,
      });

      return JSON.stringify({
        success: true,
        taskId: created.id,
        title: created.title,
        dueDate: created.dueAt,
        summary: `Uppgift skapad: "${created.title}"${created.dueAt ? ` (till ${created.dueAt.slice(0, 10)})` : ""}.`,
      });
    }

    const isAdult =
      actor.role === "owner" ||
      actor.role === "adult" ||
      actor.personType === "adult";

    if (name === "save_memory") {
      if (!isAdult) {
        return JSON.stringify({
          success: false,
          summary: "Minnesanteckningar är personliga och endast tillgängliga för föräldrarna.",
        });
      }
      const category = (args.category as Project100MemoryCategory) || "general";
      const content = String(args.content || "");
      const res = await handleMemoryTextIntent(
        actor,
        `${category} - ${content}`,
        options.channel || "web",
      );
      return JSON.stringify({
        success: res.handled,
        memoryId: res.memoryId,
        category,
        content,
        summary: res.replyText,
      });
    }

    if (name === "search_memory") {
      if (!isAdult) {
        return JSON.stringify({
          success: false,
          summary: "Minnesanteckningar är personliga och endast tillgängliga för föräldrarna.",
        });
      }
      const query = String(args.query || "");
      const res = await handleMemoryTextIntent(actor, query, options.channel || "web");
      return JSON.stringify({
        success: res.handled,
        summary: res.replyText || `Inga resultat för "${query}".`,
      });
    }

    if (name === "search_documents") {
      const query = String(args.query || "").toLowerCase();
      const personName = args.person_name ? String(args.person_name).toLowerCase() : "";
      const dashboard = await loadDashboard(actor);

      // If the user is a child (viewer), only allow searching documents that belong to a child or the whole family
      const allowedDocuments = isAdult
        ? dashboard.documents
        : dashboard.documents.filter((d) => {
            if (!d.personId) return true;
            const docPerson = dashboard.people.find((p) => p.id === d.personId);
            return docPerson?.personType === "child";
          });

      const searchTerms = query
        .toLowerCase()
        .replace(/kallelsen?|från|om|i|på|ett|en|det|vad|står|finns/g, "")
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 2);

      const matchingDocs = allowedDocuments.filter((doc) => {
        const textToMatch = [doc.title, doc.summary, doc.filename, doc.periodLabel].join(" ").toLowerCase();
        const matchesQuery =
          searchTerms.length === 0
            ? true
            : searchTerms.some((term) => {
                const stem = term.length > 4 ? term.slice(0, 4) : term;
                return textToMatch.includes(term) || textToMatch.includes(stem);
              });

        if (!personName) return matchesQuery;

        const person = dashboard.people.find((p) => p.id === doc.personId);
        const matchesPerson = person
          ? person.name.toLowerCase().includes(personName) ||
            person.aliases.some((a) => a.toLowerCase().includes(personName))
          : false;
        return matchesQuery && matchesPerson;
      });

      if (matchingDocs.length === 0) {
        return JSON.stringify({
          success: false,
          found: 0,
          summary: `Hittade inga dokument som matchar "${query}"${personName ? ` för ${personName}` : ""}.`,
        });
      }

      const results = matchingDocs.map((doc) => {
        const person = dashboard.people.find((p) => p.id === doc.personId);
        const folder = dashboard.folders.find((f) => f.id === doc.folderId);
        const linkedEvents = dashboard.events.filter((e) => e.documentId === doc.id);
        const linkedTasks = dashboard.tasks.filter((t) => t.documentId === doc.id);

        return {
          id: doc.id,
          title: doc.title,
          summary: doc.summary,
          filename: doc.filename,
          person: person?.name ?? "Hela familjen",
          category: folder?.name ?? "Roten (Alla dokument)",
          status: doc.status,
          uploadedAt: doc.uploadedAt,
          events: linkedEvents.map((e) => `${e.title} (${e.startsAt})`),
          tasks: linkedTasks.map((t) => t.title),
        };
      });

      return JSON.stringify({
        success: true,
        found: results.length,
        documents: results,
        summary: `Hittade ${results.length} dokument:\n${results
          .map(
            (r) =>
              `• [${r.category}] "${r.title}" (${r.person}): ${r.summary}${r.events.length ? ` · Extraherade tider: ${r.events.join(", ")}` : ""}${r.tasks.length ? ` · Att göra: ${r.tasks.join(", ")}` : ""}`,
          )
          .join("\n")}`,
      });
    }

    if (name === "save_journal") {
      const targetDate = args.date ? String(args.date) : today;
      const newReflection = args.reflection ? String(args.reflection).trim() : null;
      let energy = typeof args.energy === "number" ? args.energy : null;
      let mood = typeof args.mood === "number" ? args.mood : null;
      let sleepHours = typeof args.sleep_hours === "number" ? args.sleep_hours : null;

      // Smart Append: Check if day already has an entry to preserve earlier reflections
      let mergedBody = newReflection;
      try {
        const existingJournal = await loadProject100Journal(actor, {
          from: targetDate,
          to: targetDate,
          query: null,
        });
        const existingEntry = existingJournal.entries.find((e) => e.writtenOn === targetDate);
        if (existingEntry) {
          if (energy === null && existingEntry.energy !== null) energy = existingEntry.energy;
          if (mood === null && existingEntry.mood !== null) mood = existingEntry.mood;
          if (sleepHours === null && existingEntry.sleepHours !== null)
            sleepHours = existingEntry.sleepHours;

          if (existingEntry.body && newReflection) {
            const timeStr = now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
            if (!existingEntry.body.includes(newReflection)) {
              mergedBody = `${existingEntry.body}\n[${timeStr}] ${newReflection}`;
            } else {
              mergedBody = existingEntry.body;
            }
          } else if (existingEntry.body && !newReflection) {
            mergedBody = existingEntry.body;
          }
        }
      } catch {
        // Fall back to new reflection
      }

      await saveProject100JournalEntry(actor, {
        writtenOn: targetDate,
        body: mergedBody,
        energy,
        mood,
        sleepHours,
        excludedFromAi: false,
      });

      return JSON.stringify({
        success: true,
        date: targetDate,
        summary: `Dagboksanteckning sparad för ${targetDate}${sleepHours ? ` (${sleepHours}h sömn)` : ""}${energy ? ` (energi ${energy}/5)` : ""}.`,
      });
    }

    if (name === "log_body_measurement") {
      const metric = String(args.metric || "weight");
      const rawValue = Number(args.value);
      const targetDate = args.date ? String(args.date) : today;
      const unit = (args.unit as Project100MeasurementUnit) || (metric === "weight" ? "kg" : "cm");
      const notes = args.notes ? String(args.notes) : null;

      // Sanity checks
      if (metric === "weight" && (rawValue < 30 || rawValue > 300)) {
        return JSON.stringify({
          error: `Orimligt viktvärde: ${rawValue} kg. Vänligen ange en vikt mellan 30 och 300 kg.`,
        });
      }
      if (
        (metric === "waist" || metric === "chest" || metric === "arms") &&
        (rawValue < 10 || rawValue > 250)
      ) {
        return JSON.stringify({
          error: `Orimligt mått: ${rawValue} cm. Vänligen ange ett värde mellan 10 och 250 cm.`,
        });
      }

      // Atomic Patch & Merge: Load existing measurements for date so we do not overwrite other metrics
      let measurementsToSave: Array<{
        metric: string;
        label: string | null;
        unit: Project100MeasurementUnit;
        value: number;
      }> = [];
      let goalWeightKg: number | null = null;
      let prevWeightKg: number | null = null;

      try {
        const journey = await loadProject100BodyJourney(actor, {
          from: addCalendarDateDays(targetDate, -60),
          to: targetDate,
        });
        goalWeightKg = journey.goal?.weightGoalKg ?? 100;
        const existingEntry = journey.entries.find((e) => e.measuredOn === targetDate);
        if (existingEntry) {
          measurementsToSave = existingEntry.measurements
            .filter((m) => m.metric !== metric)
            .map((m) => ({
              metric: m.metric,
              label: m.label,
              unit: m.unit,
              value: m.value,
            }));
        }

        // Find previous weight point before targetDate
        const previousEntries = journey.weightHistory.filter((w) => w.measuredOn < targetDate);
        if (previousEntries.length > 0) {
          prevWeightKg = previousEntries[previousEntries.length - 1].value;
        }
      } catch {
        // Continue with empty existing list
      }

      measurementsToSave.push({
        metric,
        label: null,
        unit,
        value: rawValue,
      });

      await saveProject100BodyEntry(actor, {
        measuredOn: targetDate,
        note: notes,
        measurements: measurementsToSave,
      });

      const remainingKg =
        metric === "weight" && goalWeightKg !== null
          ? Math.round((goalWeightKg - rawValue) * 10) / 10
          : null;
      const diffFromPrev =
        metric === "weight" && prevWeightKg !== null
          ? Math.round((rawValue - prevWeightKg) * 10) / 10
          : null;

      return JSON.stringify({
        success: true,
        metric,
        value: rawValue,
        unit,
        date: targetDate,
        goalWeightKg,
        remainingKg,
        diffFromPrev,
        summary: `Sparat mått: ${rawValue} ${unit} (${metric}) för ${targetDate}.${goalWeightKg ? ` Mål: ${goalWeightKg} kg (${remainingKg} kg kvar).` : ""}${diffFromPrev !== null ? ` Diff mot förra: ${diffFromPrev > 0 ? `+${diffFromPrev}` : diffFromPrev} kg.` : ""}`,
      });
    }

    if (name === "log_quick_nutrition") {
      const title = String(args.title || "Proteinshake");
      const proteinG = Math.round(Number(args.protein_g));
      const energyKcal = typeof args.energy_kcal === "number" ? Math.round(args.energy_kcal) : null;
      const rawMealType = String(args.meal_type || "snack").toLowerCase();
      const mealType: Project100MealType = /shake|vassle/i.test(rawMealType) || /shake|vassle/i.test(title)
        ? "shake"
        : (["breakfast", "lunch", "dinner", "snack", "shake"].includes(rawMealType) ? rawMealType as Project100MealType : "snack");
      const targetDate = args.date ? String(args.date) : today;

      if (proteinG <= 0 || proteinG > 300) {
        return JSON.stringify({
          error: `Orimlig proteinmängd: ${proteinG}g. Vänligen ange mellan 1 och 300g.`,
        });
      }

      const meal = await logProject100Meal(actor, {
        source: "manual",
        title,
        eatenOn: targetDate,
        eatenAtMinute: null,
        mealType,
        proteinG,
        carbsG: null,
        fatG: null,
        kcal: energyKcal,
        hungerBefore: null,
        fullnessAfter: null,
        note: null,
        mediaId: null,
      });

      let dayTotalProteinG = proteinG;
      let targetProteinG = 160;
      try {
        const nutritionDay = await loadProject100NutritionDay(actor, targetDate);
        dayTotalProteinG = Math.round(nutritionDay.eaten.proteinG);
        targetProteinG = nutritionDay.target.overrideGrams ?? nutritionDay.target.lowGrams ?? 160;
      } catch {
        // Fall back to meal protein
      }

      const remainingG = Math.max(0, targetProteinG - dayTotalProteinG);

      return JSON.stringify({
        success: true,
        mealId: meal.id,
        title,
        loggedProteinG: proteinG,
        dayTotalProteinG,
        targetProteinG,
        remainingG,
        summary: `Loggat måltid: "${title}" (+${proteinG}g protein). Dagens total: ${dayTotalProteinG}g av ${targetProteinG}g (${remainingG}g kvar till målet).`,
      });
    }

    if (name === "log_quick_workout") {
      const title = String(args.title || "Träningspass");
      const activityType = (args.activity_type as Project100ActivityType) || "strength_home";
      const durationMinutes = typeof args.duration_minutes === "number" ? args.duration_minutes : null;
      const distanceKm = typeof args.distance_km === "number" ? args.distance_km : null;
      const effort = typeof args.effort === "number" ? args.effort : null;
      const notes = args.notes ? String(args.notes) : null;
      const targetDate = args.date ? String(args.date) : today;

      const exercises: Array<{
        name: string;
        notes: string | null;
        sets: Array<{
          reps: number | null;
          weightKg: number | null;
          durationSeconds: number | null;
          distanceMeters: number | null;
          rpe: number | null;
        }>;
      }> = [];

      if (activityType === "running" || distanceKm) {
        exercises.push({
          name: "Löpning",
          notes: null,
          sets: [
            {
              reps: null,
              weightKg: null,
              durationSeconds: durationMinutes ? Math.round(durationMinutes * 60) : null,
              distanceMeters: distanceKm ? Math.round(distanceKm * 1000) : null,
              rpe: effort,
            },
          ],
        });
      }

      const created = await createProject100TrainingSession(actor, {
        title,
        activityType,
        status: "completed",
        sessionDate: targetDate,
        templateId: null,
        plannedStartAt: null,
        plannedEndAt: null,
        durationSeconds: durationMinutes ? Math.round(durationMinutes * 60) : null,
        location: null,
        effort,
        bodyBefore: null,
        bodyAfter: null,
        notes: [
          distanceKm ? `Distans: ${distanceKm} km` : null,
          notes,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        exercises,
      });

      return JSON.stringify({
        success: true,
        sessionId: created.id,
        title: created.title,
        activityType: created.activityType,
        date: targetDate,
        durationMinutes,
        distanceKm,
        summary: `Träningspass loggat och klarmarkerat: "${created.title}" (${created.activityType})${durationMinutes ? ` · ${durationMinutes} min` : ""}${distanceKm ? ` · ${distanceKm} km` : ""}.`,
      });
    }

    if (name === "complete_planned_session") {
      const targetDate = args.date ? String(args.date) : today;
      const titleSearch = args.title_search ? String(args.title_search).toLowerCase() : "";
      const durationMinutes = typeof args.duration_minutes === "number" ? args.duration_minutes : null;
      const effort = typeof args.effort === "number" ? args.effort : null;
      const notes = args.notes ? String(args.notes) : null;

      const sessions = await loadProject100TrainingSessions(actor);
      const plannedOnDate = sessions.filter(
        (s) => s.sessionDate === targetDate && (s.status === "planned" || s.status === "in_progress"),
      );

      let targetSession = plannedOnDate[0];
      if (titleSearch && plannedOnDate.length > 0) {
        const match = plannedOnDate.find((s) => s.title.toLowerCase().includes(titleSearch));
        if (match) targetSession = match;
      }

      if (targetSession) {
        const completed = await updateProject100TrainingSession(actor, targetSession.id, {
          action: "complete",
          sessionDate: targetDate,
          durationSeconds: durationMinutes ? Math.round(durationMinutes * 60) : targetSession.durationSeconds,
          location: targetSession.location,
          effort: effort ?? targetSession.effort,
          bodyBefore: targetSession.bodyBefore,
          bodyAfter: targetSession.bodyAfter,
          notes: notes || targetSession.notes,
          sets: targetSession.exercises.flatMap((ex) =>
            ex.sets.map((st) => ({
              id: st.id,
              exerciseId: ex.exerciseId,
              reps: st.target?.reps ?? st.actual?.reps ?? 10,
              weightKg: st.target?.weightKg ?? st.actual?.weightKg ?? null,
              durationSeconds: st.target?.durationSeconds ?? st.actual?.durationSeconds ?? null,
              distanceMeters: st.target?.distanceMeters ?? st.actual?.distanceMeters ?? null,
              rpe: st.target?.rpe ?? st.actual?.rpe ?? null,
              completed: true,
            })),
          ),
        });

        return JSON.stringify({
          success: true,
          sessionId: completed.id,
          title: completed.title,
          summary: `Planerat pass "${completed.title}" är nu klarmarkerat som genomfört för ${targetDate}!`,
        });
      }

      // If no planned session existed, create a completed session directly
      const fallback = await createProject100TrainingSession(actor, {
        title: titleSearch ? `Genomfört ${titleSearch}` : "Genomfört styrkepass",
        activityType: "strength_home",
        status: "completed",
        sessionDate: targetDate,
        templateId: null,
        plannedStartAt: null,
        plannedEndAt: null,
        durationSeconds: durationMinutes ? Math.round(durationMinutes * 60) : null,
        location: null,
        effort,
        bodyBefore: null,
        bodyAfter: null,
        notes,
        exercises: [],
      });

      return JSON.stringify({
        success: true,
        sessionId: fallback.id,
        title: fallback.title,
        summary: `Träningspass klarmarkerat: "${fallback.title}" för ${targetDate}.`,
      });
    }

    if (name === "create_content_idea") {
      const title = String(args.title || "Ny idé");
      const concept = args.concept ? String(args.concept) : null;
      const hook = args.hook ? String(args.hook) : null;

      const created = await createProject100ContentProject(actor, {
        title,
        concept,
        hook,
        status: "idea",
        targetPublishDate: null,
      });

      return JSON.stringify({
        success: true,
        projectId: created.id,
        title: created.title,
        summary: `Innehållsidé sparad: "${created.title}".`,
      });
    }

    if (name === "get_training_status") {
      const targetDate = args.date ? String(args.date) : today;
      const [sessions, templates, dashboard] = await Promise.all([
        loadProject100TrainingSessions(actor),
        loadProject100TrainingTemplates(actor),
        loadDashboard(actor),
      ]);

      const todaySessions = sessions.filter((s) => s.sessionDate === targetDate);
      const completed = todaySessions.filter((s) => s.status === "completed");
      const planned = todaySessions.filter(
        (s) => s.status === "planned" || s.status === "in_progress",
      );

      // ONLY check work shifts for the CURRENT ACTOR (Jimmy), not all other family members
      const workEvents = dashboard.events.filter(
        (e) =>
          calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === targetDate &&
          e.category === "work" &&
          (actor.personId ? eventConcernsPerson(e, actor.personId) : true),
      );
      let workScheduleSummary = "Du är ledig från jobbet idag.";
      if (workEvents.length > 0) {
        const times = workEvents.map(
          (w) =>
            `${clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE)}`,
        );
        workScheduleSummary = `Du jobbar idag (${times.join(", ")}).`;
      }

      if (completed.length > 0) {
        const compList = completed
          .map(
            (c) =>
              `• "${c.title}" (${c.durationSeconds ? Math.round(c.durationSeconds / 60) : 45} min${c.effort ? `, RPE ${c.effort}` : ""})`,
          )
          .join("\n");
        return JSON.stringify({
          success: true,
          status: "completed",
          targetDate,
          completedCount: completed.length,
          summary: `Du har redan genomfört träningspass idag:\n${compList}\n\n${workScheduleSummary} Bra kört!`,
        });
      }

      if (planned.length > 0) {
        const planList = planned
          .map((p) => `• "${p.title}" (${p.exercises.length} övningar)`)
          .join("\n");
        return JSON.stringify({
          success: true,
          status: "planned",
          targetDate,
          plannedCount: planned.length,
          summary: `Dagens inplanerade träningspass:\n${planList}\n\n${workScheduleSummary}\nSäg till när du kört klart så klarmarkerar jag det, eller logga via snabbspåret!`,
        });
      }

      const tmplList =
        templates.length > 0
          ? `\nDina sparade mallar:\n${templates.map((t) => `• ${t.name} (${t.exercises.length} övningar)`).join("\n")}`
          : "";

      return JSON.stringify({
        success: true,
        status: "none",
        targetDate,
        summary: `Du har inget inplanerat träningspass för idag (${targetDate}).\n${workScheduleSummary}${tmplList}\n\nVill du köra ett pass från dina mallar eller ett spontant pass? Säg bara till (t.ex. "Logga 30 min hemmapass" eller "Körde Överkropp A") så hjälper jag dig!`,
      });
    }

    if (name === "get_nutrition_status") {
      const targetDate = args.date ? String(args.date) : today;
      const nutrition = await loadProject100NutritionDay(actor, targetDate);
      const eatenProtein = Math.round(nutrition.eaten.proteinG);
      const targetProtein =
        nutrition.target.overrideGrams ?? nutrition.target.lowGrams ?? 160;
      const targetHigh = nutrition.target.highGrams ?? 200;
      const remainingG = Math.max(0, targetProtein - eatenProtein);

      const meals = nutrition.meals || [];
      const batches = nutrition.batches || [];

      const mealsList =
        meals.length > 0
          ? meals
              .map((m) => `• ${m.title} (+${Math.round(m.proteinG ?? 0)}g protein)`)
              .join("\n")
          : "Inga måltider loggade än idag.";

      const batchesWithPortions = batches.filter(
        (b) => Number(b.portionsLeft) > 0,
      );
      const batchList =
        batchesWithPortions.length > 0
          ? batchesWithPortions
              .map((b) => `• ${b.name}: ${b.portionsLeft} portioner kvar`)
              .join("\n")
          : "Inga färdiga matlådor i frysen.";

      return JSON.stringify({
        success: true,
        targetDate,
        eatenProteinG: eatenProtein,
        targetProteinG: targetProtein,
        remainingG,
        summary: `🥩 *Dagens Kost & Protein (${targetDate}):*\n• Ätit hittills: *${eatenProtein}g* protein av mål *${targetProtein}–${targetHigh}g* (${remainingG > 0 ? `${remainingG}g kvar` : "Målet uppnått! 🎉"})\n\n🍱 *Loggade måltider:*\n${mealsList}\n\n❄️ *Matlådor i frysen:*\n${batchList}`,
      });
    }

    if (name === "check_kids_chores_status") {
      const dashboard = await loadDashboard(actor);
      const targetPersonName = args.person_name
        ? String(args.person_name).trim().toLowerCase()
        : null;

      const kids = dashboard.people.filter(
        (p) => p.personType === "child" || getCleaningAreaForPerson(p) !== null,
      );

      const relevantKids = targetPersonName
        ? kids.filter(
            (k) =>
              k.name.toLowerCase().includes(targetPersonName) ||
              (k.aliases || []).some((a) =>
                a.toLowerCase().includes(targetPersonName),
              ),
          )
        : kids;

      if (relevantKids.length === 0 && targetPersonName) {
        return JSON.stringify({
          success: false,
          summary: `Hittade inget barn som matchar "${args.person_name}". Barnens områden är Alma (Lilla vardagsrummet), Shureym (Stora vardagsrummet) och Cuzeyr (Köket).`,
        });
      }

      const overview = getKidsChoresOverview(
        relevantKids,
        dashboard.tasks,
        now,
        dashboard.timezone,
      );
      const summaries = overview.map((summary) => ({
        kid: summary.person,
        area: summary.cleaningArea,
        total: summary.tasks.length,
        open: summary.tasks.filter((task) => !task.completedAt),
        completed: summary.tasks.filter((task) => Boolean(task.completedAt)),
        allDone: summary.allDone,
      }));

      const lines = summaries.map((s) => {
        const areaStr = s.area ? `${s.area.icon} ${s.area.area}` : "sina uppgifter";
        if (s.total === 0) {
          return `• **${s.kid.name}** (${areaStr}): Inga städuppgifter inlagda just nu.`;
        }
        if (s.allDone) {
          return `• **${s.kid.name}** (${areaStr}): **Färdig!** 🎉 Alla ${s.completed.length} uppgifter är klara.`;
        }
        const openTitles = s.open.map((t) => `"${t.title}"`).join(", ");
        return `• **${s.kid.name}** (${areaStr}): **Inte klar** (${s.open.length} kvar: ${openTitles}).`;
      });

      const allKidsDone =
        summaries.length > 0 &&
        summaries.every((s) => s.total > 0 && s.allDone);
      const header =
        summaries.length === 1
          ? `Status för ${summaries[0].kid.name}:`
          : allKidsDone
            ? "🎉 Alla barn är helt färdiga med sina städområden!"
            : "Här är statusen för barnens städområden och uppgifter:";

      return JSON.stringify({
        success: true,
        allKidsDone,
        summaries: summaries.map((s) => ({
          name: s.kid.name,
          area: s.area?.area,
          openCount: s.open.length,
          completedCount: s.completed.length,
          isDone: s.allDone,
        })),
        summary: `${header}\n\n${lines.join("\n")}`,
      });
    }

    if (name === "get_day_history") {
      const targetDate = String(args.date || today);
      const [dashboard, sessions, journal, body] = await Promise.all([
        loadDashboard(actor),
        loadProject100TrainingSessions(actor),
        loadProject100Journal(actor),
        loadProject100BodyJourney(actor),
      ]);

      let nutritionDay = null;
      try {
        nutritionDay = await loadProject100NutritionDay(actor, targetDate);
      } catch {
        // ignore
      }

      const dayEvents = dashboard.events.filter(
        (e) => calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === targetDate,
      );
      const workEvents = dayEvents.filter((e) => e.category === "work");
      const familyEvents = dayEvents.filter((e) => e.category !== "work");

      const daySessions = sessions.filter((s) => s.sessionDate === targetDate);
      const completedSessions = daySessions.filter((s) => s.status === "completed");

      const completedTasks = dashboard.tasks.filter((t) => {
        if (!t.completedAt) return false;
        return calendarDateInTimeZone(t.completedAt, DEFAULT_TIME_ZONE) === targetDate;
      });

      const dayJournal = journal?.entries?.find((j) => j.writtenOn === targetDate);
      const weightEntry =
        body?.weightHistory?.find((b) => b.measuredOn === targetDate) ??
        body?.entries?.find((e) => e.measuredOn === targetDate)?.measurements.find((m) => m.metric === "weight");

      const summaryParts: string[] = [`📅 **Sammanfattning för ${targetDate}:**`];

      // Work
      if (workEvents.length > 0) {
        const wLines = workEvents.map((w) => {
          const p = dashboard.people.find((x) => x.id === w.personId);
          return `• ${p ? p.name : "Jobb"}: ${clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE)}`;
        });
        summaryParts.push(`💼 **Arbetspass:**\n${wLines.join("\n")}`);
      } else {
        summaryParts.push(`💼 **Jobb:** Ledig från jobbet.`);
      }

      // Events
      if (familyEvents.length > 0) {
        const eLines = familyEvents.map((e) => {
          const p = dashboard.people.find((x) => x.id === e.personId);
          const t = e.allDay ? "Hela dagen" : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`;
          return `• ${e.title}${p ? ` (${p.name})` : ""} kl. ${t}`;
        });
        summaryParts.push(`🎉 **Händelser & Aktiviteter:**\n${eLines.join("\n")}`);
      }

      // Training
      if (completedSessions.length > 0) {
        const sLines = completedSessions.map(
          (s) => `• "${s.title}" (${s.durationSeconds ? Math.round(s.durationSeconds / 60) : 45} min${s.effort ? `, RPE ${s.effort}` : ""})`,
        );
        summaryParts.push(`🏋️‍♂️ **Träning:**\n${sLines.join("\n")}`);
      } else {
        summaryParts.push(`🏋️‍♂️ **Träning:** Inget genomfört pass registrerat.`);
      }

      // Nutrition
      if (nutritionDay && nutritionDay.eaten && nutritionDay.eaten.proteinG > 0) {
        const targetLow = nutritionDay.target?.overrideGrams ?? nutritionDay.target?.lowGrams ?? 160;
        summaryParts.push(
          `🥩 **Kost & Protein:** ${nutritionDay.eaten.proteinG}g protein (av mål ${targetLow}g)${nutritionDay.meals?.length ? ` över ${nutritionDay.meals.length} måltid(er)` : ""}.`,
        );
      }

      // Weight
      if (weightEntry) {
        summaryParts.push(`⚖️ **Vikt:** ${weightEntry.value} kg`);
      }

      // Tasks completed
      if (completedTasks.length > 0) {
        const tLines = completedTasks.map((t) => {
          const p = dashboard.people.find((x) => x.id === t.personId);
          return `• ${t.title}${p ? ` (${p.name})` : ""}`;
        });
        summaryParts.push(`✅ **Avklarade uppgifter:**\n${tLines.join("\n")}`);
      }

      // Journal
      if (dayJournal && dayJournal.body) {
        summaryParts.push(`📖 **Dagbok:** "${dayJournal.body}"`);
      }

      return JSON.stringify({
        success: true,
        date: targetDate,
        summary: summaryParts.join("\n\n"),
      });
    }

    if (name === "create_event") {
      const title = String(args.title || "Ny händelse");
      const targetDate = String(args.date || today);
      const startTime = args.start_time ? String(args.start_time).trim() : null;
      const endTime = args.end_time ? String(args.end_time).trim() : null;
      const personName = args.person_name ? String(args.person_name).trim().toLowerCase() : null;
      const location = args.location ? String(args.location).trim() : null;

      const dashboard = await loadDashboard(actor);
      let personId: string | null = null;
      if (personName) {
        const p = dashboard.people.find(
          (x) =>
            x.name.toLowerCase().includes(personName) ||
            (x.aliases || []).some((a) => a.toLowerCase().includes(personName)),
        );
        if (p) personId = p.id;
      }

      const allDay = !startTime;
      const startIso = startTime
        ? new Date(`${targetDate}T${startTime}:00Z`).toISOString()
        : `${targetDate}T00:00:00.000Z`;
      const endIso = endTime
        ? new Date(`${targetDate}T${endTime}:00Z`).toISOString()
        : startTime
          ? new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString()
          : `${targetDate}T23:59:59.000Z`;

      const created = await saveManualEvent(actor, {
        title,
        category: "family",
        startsAt: startIso,
        endsAt: endIso,
        allDay,
        location,
        notes: null,
        personId,
      });

      return JSON.stringify({
        success: true,
        eventId: created.id,
        title: created.title,
        summary: `Kalenderhändelse skapad: "${created.title}" den ${targetDate}${startTime ? ` kl. ${startTime}` : ""}.`,
      });
    }

    if (name === "update_item") {
      const type = String(args.type || "task");
      const query = String(args.query || "").toLowerCase();
      const newTitle = args.new_title ? String(args.new_title) : undefined;
      const newDate = args.new_date ? String(args.new_date) : undefined;
      const newTime = args.new_time ? String(args.new_time) : undefined;
      const completed = typeof args.completed === "boolean" ? args.completed : undefined;

      const dashboard = await loadDashboard(actor);

      if (type === "task") {
        const matchedTask = dashboard.tasks.find((t) =>
          t.title.toLowerCase().includes(query) || (t.notes && t.notes.toLowerCase().includes(query)),
        );
        if (!matchedTask) {
          return JSON.stringify({
            success: false,
            summary: `Hittade ingen uppgift som matchar "${query}".`,
          });
        }

        let dueAt = matchedTask.dueAt;
        if (newDate) {
          dueAt = newTime ? `${newDate}T${newTime}:00.000Z` : `${newDate}T12:00:00.000Z`;
        }

        const updated = await updateManualTask(actor, matchedTask.id, {
          title: newTitle || matchedTask.title,
          dueAt,
          completedAt: completed === true ? new Date().toISOString() : completed === false ? null : matchedTask.completedAt,
        });

        return JSON.stringify({
          success: true,
          taskId: updated?.id || matchedTask.id,
          summary: `Uppdaterade uppgiften: "${updated?.title || matchedTask.title}"${newDate ? ` till ${newDate}` : ""}${completed !== undefined ? (completed ? " (markerad som klar)" : " (öppnad igen)") : ""}.`,
        });
      }

      if (type === "event") {
        const matchedEvent = dashboard.events.find((e) =>
          e.title.toLowerCase().includes(query) || (e.location && e.location.toLowerCase().includes(query)),
        );
        if (!matchedEvent) {
          return JSON.stringify({
            success: false,
            summary: `Hittade ingen kalenderhändelse som matchar "${query}".`,
          });
        }

        let startsAt = matchedEvent.startsAt;
        let endsAt = matchedEvent.endsAt;
        if (newDate) {
          const timeStr = newTime || clockValueInTimeZone(matchedEvent.startsAt, DEFAULT_TIME_ZONE);
          startsAt = `${newDate}T${timeStr}:00.000Z`;
          endsAt = `${newDate}T${timeStr}:00.000Z`;
        }

        const updated = await updateManualEvent(actor, matchedEvent.id, {
          title: newTitle || matchedEvent.title,
          category: matchedEvent.category,
          startsAt,
          endsAt,
          allDay: matchedEvent.allDay,
          location: matchedEvent.location,
          notes: matchedEvent.notes,
          personId: matchedEvent.personId,
        });

        return JSON.stringify({
          success: true,
          eventId: updated?.id,
          summary: `Uppdaterade händelsen: "${updated?.title || matchedEvent.title}"${newDate ? ` till ${newDate}` : ""}.`,
        });
      }
    }

    if (name === "delete_item") {
      const type = String(args.type || "task");
      const query = String(args.query || "").toLowerCase();
      const dashboard = await loadDashboard(actor);

      if (type === "task") {
        const matchedTask = dashboard.tasks.find((t) =>
          t.title.toLowerCase().includes(query) || (t.notes && t.notes.toLowerCase().includes(query)),
        );
        if (!matchedTask) {
          return JSON.stringify({
            success: false,
            summary: `Hittade ingen uppgift som matchar "${query}".`,
          });
        }
        await removeTask(actor, matchedTask.id);
        return JSON.stringify({
          success: true,
          summary: `Tog bort uppgiften: "${matchedTask.title}".`,
        });
      }

      if (type === "event") {
        const matchedEvent = dashboard.events.find((e) =>
          e.title.toLowerCase().includes(query) || (e.location && e.location.toLowerCase().includes(query)),
        );
        if (!matchedEvent) {
          return JSON.stringify({
            success: false,
            summary: `Hittade ingen kalenderhändelse som matchar "${query}".`,
          });
        }
        await removeEvent(actor, matchedEvent.id);
        return JSON.stringify({
          success: true,
          summary: `Tog bort kalenderhändelsen: "${matchedEvent.title}".`,
        });
      }

      if (type === "memory") {
        if (actor.role !== "owner" && actor.role !== "adult" && actor.personType !== "adult") {
          return JSON.stringify({
            success: false,
            summary: "Endast föräldrar kan hantera minnesanteckningar.",
          });
        }
        const sql = await readyClient();
        const rows = await sql<{ id: string; content: string }[]>`
          select id, content from project100_memories
          where user_id = ${actor.userId} and is_active = true
            and lower(content) like ${"%" + query + "%"}
          limit 1
        `;
        if (!rows[0]) {
          return JSON.stringify({
            success: false,
            summary: `Hittade inget minne som matchar "${query}".`,
          });
        }
        await deleteProject100Memory(actor, rows[0].id);
        return JSON.stringify({
          success: true,
          summary: `Tog bort minnet: "${rows[0].content}".`,
        });
      }
    }

    if (name === "log_missing_capability") {
      const missingFeature = String(args.missing_feature || text);
      const categoryHint = args.category_hint ? String(args.category_hint) : undefined;

      await logJarvisCapabilityGap(actor, text, options.channel || "web", {
        detectedIntent: missingFeature,
        categoryHint,
      });

      return JSON.stringify({
        success: true,
        summary: `Loggat till utvecklingsbackloggen: "${missingFeature}". Svara användaren artigt och förklara att funktionen inte stöds än men är sparad i önskelistan/backloggen.`,
      });
    }

    return JSON.stringify({ error: `Okänt verktyg: ${name}` });
  }

  // 2. Try LLM Tool Calling
  const ai = getAgentClient();
  if (ai) {
    try {
      const systemPrompt = `Du är Jarvis, den personliga assistenten och digitala kollegan i Vardagsro och Projekt 100.
Du hjälper ${callerName} med hushållets kalender, minnen, dagbok, idéer, att-göra-uppgifter, träning, kost och kroppsmätningar.

IDAG ÄR: ${today} (tidszon Europe/Stockholm, klockan är cirka ${now.toTimeString().slice(0, 5)}).
DITT TILLTAL: Varmt, personligt, professionellt och koncist ("Glass & Steel"). Hälsa gärna med "${getGreeting(callerName, now)}" om användaren inleder en konversation.
NOLL HALLUCINATION: Gissa aldrig kalenderhändelser, koder, vikt eller fakta. Använd alltid verktygen för att slå upp schema (check_schedule), hämta daglig briefing (get_daily_briefing), skapa uppgifter (create_task), spara/söka minnen, logga mätningar (log_body_measurement), logga protein/mat (log_quick_nutrition), logga pass (log_quick_workout / complete_planned_session) eller logga dagbok (save_journal).
BRIEFING & DAGLIG ÖVERSIKT: När användaren efterfrågar en briefing, morgonöversikt, kvällsavstämning eller frågar vad som händer idag / hur dagen ser ut / hur dagen gick, anropa ALLTID verktyget "get_daily_briefing" med type "morning" (på morgonen/dagen) eller "evening" (på kvällen / vid summering). Återge verktygets strukturerade sammanfattning.
KOMBINERADE HANDLINGAR: Om användaren nämner flera saker (t.ex. körde benpass OCH sprang 5 km, eller vägde sig OCH drack en shake), anropa ALLA relevanta verktyg och ge ett komplett, strukturerat svar som bekräftar alla delar.
MOTIVERANDE FAKTAÅTERKOPPLING: När du bekräftar mätningar, protein eller pass, ge konkreta siffror (t.ex. hur mycket protein som återstår till dagens 160g-mål, eller hur mycket som återstår till 100 kg-målet). Undvik tomma klyschor.`;

      const { sanitizedText } = sanitizePII(text);
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: sanitizedText },
      ];

      // First LLM call
      const firstResponse = await ai.client.chat.completions.create({
        model: ai.model,
        messages,
        tools: JARVIS_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
      });

      const responseMessage = firstResponse.choices[0]?.message;

      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type === "function") {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(toolCall.function.arguments);
            } catch {
              parsedArgs = {};
            }

            const toolOutput = await executeTool(toolCall.function.name, parsedArgs);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolOutput,
            });
          }
        }

        // Second LLM call to synthesize the final response
        const secondResponse = await ai.client.chat.completions.create({
          model: ai.model,
          messages,
          temperature: 0.2,
        });

        const finalReply = secondResponse.choices[0]?.message?.content?.trim();
        if (finalReply) {
          return { text: finalReply, executedActions };
        }
      } else if (responseMessage?.content?.trim()) {
        return { text: responseMessage.content.trim(), executedActions };
      }
    } catch {
      // Fall back to deterministic engine on AI errors
    }
  }

  // 3. Deterministic Engine (Offline / Tests / Fallback)
  const lower = text.toLowerCase();
  const clockStr = clockValueInTimeZone(now.toISOString(), DEFAULT_TIME_ZONE);
  const hour = parseInt(clockStr.slice(0, 2), 10) || now.getHours();
  const isEveningHour = hour >= 17 || hour < 4;

  // Proactive Morning Briefing trigger
  const isMorningBriefing =
    /(?:god\s*morgon|morgon\s*brief|morgon\s*briefing|morgon\s*översikt|morgonens\s*briefing|morgon\s*rapport|dagens\s*brief|dagens\s*schema|schema\s*idag|vad\s*händer\s*idag|hur\s*ser\s*dagen\s*ut|hur\s*ser\s*schemat\s*ut|ge\s*mig\s*(?:en\s*)?morgonbrief|briefa\s*mig)/i.test(lower) ||
    ((/^(briefing|brief|morgonbrief|morgonens briefing|dagens briefing|översikt|rapport)$/i.test(lower.trim()) || /(?:ge\s+mig\s+)?(?:en\s+)?(?:morgon)?briefing/i.test(lower)) && !isEveningHour);

  if (isMorningBriefing) {
    const toolResStr = await executeTool("get_daily_briefing", { type: "morning" });
    const toolRes = JSON.parse(toolResStr);
    return {
      text: toolRes.summary || toolRes.data?.text,
      executedActions,
    };
  }

  // Proactive Evening Debrief trigger
  const isEveningBriefing =
    /(?:kvälls\s*avstämning|kvälls\s*översikt|kvälls\s*briefing|kvälls\s*brief|kvällens\s*briefing|kvälls\s*rapport|avstämning|hur\s*gick\s*dagen|sammanfatta\s*dagen|dagens\s*avstämning|ge\s*mig\s*(?:en\s*)?kvällsbrief)/i.test(lower) ||
    ((/^(briefing|brief|kvällsbrief|kvällens briefing|dagens briefing|avstämning)$/i.test(lower.trim()) || /(?:ge\s+mig\s+)?(?:en\s+)?kvällsbriefing/i.test(lower)) && isEveningHour);

  if (isEveningBriefing) {
    const toolResStr = await executeTool("get_daily_briefing", { type: "evening" });
    const toolRes = JSON.parse(toolResStr);
    return {
      text: toolRes.summary || toolRes.data?.text,
      executedActions,
    };
  }

  // 1. Polite & Conversational Greetings
  if (/^(tack|tack så mycket|tack snälla|tackar|grymt|bra jobbat|kanon|perfekt|toppen|tack för hjälpen)[\s!?.…]*$/i.test(lower)) {
    return {
      text: `Det var så lite så, ${callerName}! Säg bara till om det är något mer jag ska fixa. 💪`,
      executedActions: [],
    };
  }

  if (/^(god\s*natt|gonatt|sov\s*gott)[\s!?.…]*$/i.test(lower)) {
    return {
      text: `God natt ${callerName}! 🌙 Sov gott så tar vi nya tag imorgon!`,
      executedActions: [],
    };
  }

  if (/^(hur\s*är\s*läget|läget|hur\s*mår\s*du|hur\s*står\s*det\s*till)[\s!?.…]*$/i.test(lower)) {
    return {
      text: `Bara bra tack, ${callerName}! 🦾 Redo att hålla koll på familjens schema, Projekt 100-träningen och barnens städområden. Hur är läget med dig?`,
      executedActions: [],
    };
  }

  if (/^(vem\s*är\s*du|vad\s*kan\s*du\s*göra|vad\s*kan\s*jag\s*fråga|hjälp|funktioner|kommandon)[\s!?.…]*$/i.test(lower)) {
    return {
      text: `${getGreeting(callerName, now)} Jag är Jarvis, er digitala familje- och livskollega! 🤖✨\n\nHär är exempel på vad du kan fråga eller be mig om:\n\n📅 **Schema & Arbetstider:**\n• "När börjar jag imorgon?"\n• "När jobbar Hanni på fredag?"\n• "Vad händer i helgen?"\n\n🎯 **Aktiviteter & Dagsplan:**\n• "Vad ska vi göra idag?"\n• "Hur ser morgondagen ut?"\n\n🍽️ **Middag & Kost:**\n• "Vad ska vi äta idag?" / "Middagstips"\n• "Protein & Mat" / "Logga 30g protein"\n\n🏋️‍♂️ **Projekt 100 Träning & Kropp:**\n• "Vad ska jag träna idag?"\n• "Vägde 84.5 kg"\n• "Sprang 5 km på 28 min"\n\n🧹 **Barnen & Städning:**\n• "Vem städar vad?"\n• "Är barnen klara med sina ansvarsområden?"\n• "Har barnen några läxor?"\n\n🔔 **Smarta Påminnelser:**\n• "Påminn mig att handla på fredag efter jobbet"\n\n📌 **Minnesbank & Dokument:**\n• "Vad står i kallelsen från tandläkaren?"\n• "Kom ihåg att koden till förrådet är 1234"`,
      executedActions: [],
    };
  }

  // Pure greeting
  if (/^(hej|tjena|hallå|god kväll|god morgon|god dag|morsning|tja|hejsan)(\s+jarvis)?[\s!?.…]*$/i.test(lower)) {
    return {
      text: `${getGreeting(callerName, now)} Hur kan jag hjälpa dig? Du kan fråga om schemat, träningen, middagstips eller be mig lägga in en påminnelse!`,
      executedActions: [],
    };
  }

  // "Vad ska vi göra idag?" / "Vad ska vi hitta på?" / "Aktiviteter idag"
  if (/(?:vad\s*ska\s*vi\s*(?:göra|hitta\s*på)|aktiviteter\s*idag|tips\s*på\s*aktiviteter|vad\s*gör\s*vi\s*idag)/i.test(lower)) {
    const dashboard = await loadDashboard(actor);
    executedActions.push("check_schedule");
    const todayEvents = dashboard.events.filter(
      (e) => calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === today,
    );
    const workEvents = todayEvents.filter((e) => e.category === "work");
    const familyEvents = todayEvents.filter((e) => e.category !== "work");
    const openTasks = dashboard.tasks.filter((t) => !t.completedAt);

    const shiftLines = workEvents.map((w) => {
      const p = dashboard.people.find((x) => x.id === w.personId);
      return `• ${p ? p.name : "Jobb"}: ${clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE)}`;
    });

    const eventLines = familyEvents.map((e) => {
      const p = dashboard.people.find((x) => x.id === e.personId);
      const time = e.allDay ? "Hela dagen" : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`;
      return `• ${e.title}${p ? ` (${p.name})` : ""} kl. ${time}`;
    });

    let summary = `${getGreeting(callerName, now)} Här är dagens översikt och plan:\n`;
    if (shiftLines.length > 0) {
      summary += `\n💼 **Arbetspass idag:**\n${shiftLines.join("\n")}`;
    } else {
      summary += `\n💼 **Jobb:** Ni är lediga från jobbet idag! 🌟`;
    }

    if (eventLines.length > 0) {
      summary += `\n\n🎉 **Aktiviteter & Inbokat:**\n${eventLines.join("\n")}`;
    }

    if (openTasks.length > 0) {
      summary += `\n\n📝 **Att göra (${openTasks.length} kvar):**\n` + openTasks.slice(0, 3).map((t) => `• ${t.title}`).join("\n");
      if (openTasks.length > 3) summary += `\n...och ${openTasks.length - 3} till.`;
    }

    if (familyEvents.length === 0 && openTasks.length === 0) {
      summary += `\n\n🌿 **Tips:** Schemat är öppet! Perfekt läge för en skön familjepromenad, ett träningspass eller en lugn kväll tillsammans.`;
    }

    return { text: summary, executedActions };
  }

  // "Vad ska vi äta idag?" / "Middagstips" / "Vad ska vi laga för mat?"
  if (/(?:vad\s*ska\s*vi\s*(?:äta|laga)|middagstips|tips\s*på\s*middag|tips\s*på\s*mat|vad\s*blir\s*det\s*för\s*mat|matförslag)/i.test(lower)) {
    let nutritionSummary = "";
    try {
      const nutDay = await loadProject100NutritionDay(actor, today);
      if (nutDay.batches && nutDay.batches.length > 0) {
        const available = nutDay.batches.filter((b) => b.portionsLeft > 0);
        if (available.length > 0) {
          const batchList = available
            .map((b) => `• ${b.name} (${b.portionsLeft} portioner i frysen)`)
            .join("\n");
          nutritionSummary = `\n\n🍱 **Färdiga matlådor i frysen:**\n${batchList}`;
        }
      }
    } catch {
      // ignore
    }

    const dinnerIdeas = [
      "🍗 **Kycklingfajitas / Kycklingwok:** Snabbstekt kycklingfilé med paprika, lök, ris och guacamole/kvargdip.",
      "🥩 **Köttfärssås / Biffar:** Nötfärs med krossade tomater, vitlök, bönpasta eller råris samt en krispig grönsallad.",
      "🐟 **Ugnsbakad lax:** Laxfilé med kokt potatis, ärtor och romsås eller citronyoghurt.",
      "🍳 **Matig Omelett / Pytt:** Omelett med kalkon/skinka, spenat, tomat och keso.",
    ];

    const chosenIdeas = dinnerIdeas.slice(0, 3).join("\n\n");
    const reply = `${getGreeting(callerName, now)} Här kommer lite goda och proteinrika middagsförslag som passar hela familjen och Projekt 100:${nutritionSummary}\n\n💡 **Förslag:**\n${chosenIdeas}\n\nVill du att jag lägger in något av detta på inköpslistan eller som en påminnelse?`;
    executedActions.push("get_nutrition_status");
    return { text: reply, executedActions };
  }

  // "Har barnen några läxor?" / "Vad ska barnen ta med sig?" / "Skolsaker"
  if (/(?:läxa|läxor|ta\s*med|packa|packning|gympapåse|idrottskläder|skolsaker|skoluppgift)/i.test(lower)) {
    const dashboard = await loadDashboard(actor);
    executedActions.push("check_schedule");
    const schoolTasks = dashboard.tasks.filter(
      (t) => !t.completedAt && (t.kind === "homework" || t.kind === "bring" || t.kind === "preparation" || t.kind === "form"),
    );

    if (schoolTasks.length === 0) {
      return {
        text: `${getGreeting(callerName, now)} Det finns inga inlagda läxor eller ta-med-saker till skolan just nu. Allt är grönt! 🎒✨`,
        executedActions,
      };
    }

    const taskList = schoolTasks.map((t) => {
      const person = dashboard.people.find((p) => p.id === t.personId);
      const due = t.dueAt ? ` (till ${t.dueAt.slice(0, 10)})` : "";
      return `• ${person ? `${person.name}: ` : ""}${t.title}${due}`;
    }).join("\n");

    return {
      text: `${getGreeting(callerName, now)} Här är vad som är inlagt för skolan/packning:\n\n${taskList}`,
      executedActions,
    };
  }

  // "Vad händer i helgen?" / "Helgplaner" / "Hur ser helgen ut?"
  if (/(?:vad\s*händer\s*i\s*helgen|helgens\s*schema|helgplaner|hur\s*ser\s*helgen\s*ut|i\s*helgen)/i.test(lower)) {
    const dashboard = await loadDashboard(actor);
    executedActions.push("check_schedule");
    const todayStr = calendarDateInTimeZone(now, DEFAULT_TIME_ZONE);
    const refParts = new Date(`${todayStr}T12:00:00Z`);
    const dayOfWeek = refParts.getUTCDay();
    const diffToSat = (6 - dayOfWeek + 7) % 7;
    const satDate = addCalendarDateDays(todayStr, diffToSat === 0 && dayOfWeek !== 6 ? 7 : diffToSat);
    const sunDate = addCalendarDateDays(satDate, 1);

    const satEvents = dashboard.events.filter((e) => calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === satDate);
    const sunEvents = dashboard.events.filter((e) => calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === sunDate);

    const formatEventLine = (e: (typeof dashboard.events)[0]) => {
      const p = dashboard.people.find((x) => x.id === e.personId);
      const time = e.allDay ? "Hela dagen" : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`;
      return `  • ${e.title}${p ? ` (${p.name})` : ""} kl. ${time}`;
    };

    let reply = `${getGreeting(callerName, now)} Här är en överblick för helgen:\n\n📅 **Lördag (${satDate}):**\n`;
    reply += satEvents.length > 0 ? satEvents.map(formatEventLine).join("\n") : "  • Inget inbokat (ledig dag) ☀️";

    reply += `\n\n📅 **Söndag (${sunDate}):**\n`;
    reply += sunEvents.length > 0 ? sunEvents.map(formatEventLine).join("\n") : "  • Inget inbokat (ledig dag) ☀️";

    return { text: reply, executedActions };
  }

  // "Vad är mitt nästa fokus?" / "Vad ska jag fokusera på?" / "Vad är mitt fokus?"
  if (/(?:vad\s*är\s*(?:mitt|vårt)\s*(?:nästa\s*)?fokus|vad\s*ska\s*jag\s*fokusera\s*på|mitt\s*fokus|träningsfokus)/i.test(lower)) {
    executedActions.push("get_focus_status");
    let targetProtein = 160;
    try {
      const nutDay = await loadProject100NutritionDay(actor, today);
      targetProtein = nutDay.target?.overrideGrams ?? nutDay.target?.lowGrams ?? 160;
    } catch {
      // ignore
    }

    const focusReply = `${getGreeting(callerName, now)} Ditt främsta fokus i Projekt 100 just nu:\n\n1. 🥩 **Protein:** Nå dagens proteinmål på minst ${targetProtein}g.\n2. 🏋️‍♂️ **Träning & Återhämtning:** Följ din träningsplan och hitta nästa träningsfönster kring jobbet.\n3. 💧 **Vardag & Sömn:** Håll vätskebalansen och sikta på god nattsömn!`;
    return { text: focusReply, executedActions };
  }

  // 1. Day history query: "Vad gjorde jag den 1a september?", "Vad gjorde vi igår?", "Vad hände den 28 augusti?"
  const isDayHistoryQuery = /(?:vad\s*gjorde\s*(?:jag|vi)|vad\s*hände\s*(?:den|i|igår|i\s*förrgår)|hur\s*såg\s*(?:dagen|gårdagen)\s*ut|hur\s*gick\s*det\s*(?:den|i|igår)|sammanfatta\s*(?:den|igår|gårdagen))/i.test(lower);
  if (isDayHistoryQuery) {
    const { targetDate } = resolveSwedishTargetDate(lower, now);
    const resStr = await executeTool("get_day_history", { date: targetDate });
    const res = JSON.parse(resStr);
    return {
      text: `${getGreeting(callerName, now)}\n\n${res.summary}`,
      executedActions,
    };
  }

  // 2. Delete command: "Ta bort uppgiften köpa mjölk", "Ta bort mötet imorgon", "Ta bort minnet om portkoden"
  const deleteMatch = lower.match(/^(?:ta\s*bort|radera|rensa|ta\s*väck)\s+(.+)$/i);
  if (deleteMatch) {
    const queryTarget = deleteMatch[1].trim();
    let type: "task" | "event" | "memory" = "task";
    let cleanQuery = queryTarget;

    if (/(?:minne|minnet|minnesanteckning|koden|lösenord)/i.test(queryTarget)) {
      type = "memory";
      cleanQuery = queryTarget.replace(/^(?:minnet?\s*(?:om|att)?|koden?\s*(?:till)?)\s*/i, "").trim();
    } else if (/(?:händelse|händelsen|möte|mötet|kalas|kalaset|pass|passet)/i.test(queryTarget)) {
      type = "event";
      cleanQuery = queryTarget.replace(/^(?:händelse(?:n)?|möte(?:t)?|kalas(?:et)?|pass(?:et)?)\s*/i, "").trim();
    } else {
      cleanQuery = queryTarget.replace(/^(?:uppgift(?:en)?|att\s*göra|påminnelse(?:n)?)\s*(?:om\s*att|att)?\s*/i, "").trim();
    }

    const resStr = await executeTool("delete_item", { type, query: cleanQuery || queryTarget });
    const res = JSON.parse(resStr);
    return {
      text: `${getGreeting(callerName, now)} ${res.summary}`,
      executedActions,
    };
  }

  // 3. Update / Move command: "Ändra påminnelsen om att handla till på lördag", "Flytta kalaset till kl 15:00"
  const updateMatch = lower.match(/^(?:ändra|flytta|uppdatera|skjut\s*upp)\s+(.+)$/i);
  if (updateMatch) {
    const fullInstruction = updateMatch[1].trim();
    const { targetDate } = resolveSwedishTargetDate(fullInstruction, now);
    const timeMatch = fullInstruction.match(/(?:kl(?:ockan)?\.?\s*)?(\d{1,2}[:.]\d{2})/i);
    const newTime = timeMatch ? timeMatch[1].replace(".", ":").padStart(5, "0") : undefined;

    const tillIndex = fullInstruction.search(/\s+till\s+/i);
    const query = tillIndex > 0 ? fullInstruction.slice(0, tillIndex).trim() : fullInstruction;
    const cleanQuery = query.replace(/^(?:uppgift(?:en)?|påminnelse(?:n)?|händelse(?:n)?|möte(?:t)?|kalas(?:et)?)\s*(?:om\s*att|att)?\s*/i, "").trim();

    const type: "task" | "event" = /(?:händelse|möte|kalas)/i.test(fullInstruction) ? "event" : "task";
    const resStr = await executeTool("update_item", {
      type,
      query: cleanQuery || query,
      new_date: targetDate !== today ? targetDate : undefined,
      new_time: newTime,
    });
    const res = JSON.parse(resStr);
    return {
      text: `${getGreeting(callerName, now)} ${res.summary}`,
      executedActions,
    };
  }

  // 4. Add command: "Lägg till kalas på söndag kl 14:00", "Lägg till att köpa fotbollsskor till Shureym"
  const addMatch = lower.match(/^(?:lägg\s*till|skapa|boka|lägg\s*in)\s+(.+)$/i);
  if (addMatch) {
    const fullContent = addMatch[1].trim();

    // Is it an event?
    const isEvent =
      /(?:kalas|match|träning\s*med|möte|tandläkare|läkare|middag\s*hos|fest|utflykt|biokväll)/i.test(fullContent) ||
      /(?:kl(?:ockan)?\.?\s*\d{1,2}[:.]\d{2})/i.test(fullContent);

    if (isEvent) {
      const { targetDate } = resolveSwedishTargetDate(fullContent, now);
      const timeMatch = fullContent.match(/(?:kl(?:ockan)?\.?\s*)?(\d{1,2}[:.]\d{2})/i);
      const startTime = timeMatch ? timeMatch[1].replace(".", ":").padStart(5, "0") : undefined;
      const cleanTitle = fullContent
        .replace(/\s+(?:den\s+\d{1,2}[e|a]?\s+[a-zåäö]+|på\s+[a-zåäö]+|imorgon|idag|i\s*övermorgon)/gi, "")
        .replace(/\s*(?:kl(?:ockan)?\.?\s*\d{1,2}[:.]\d{2})/gi, "")
        .trim();

      const resStr = await executeTool("create_event", {
        title: cleanTitle || fullContent,
        date: targetDate,
        start_time: startTime,
      });
      const res = JSON.parse(resStr);
      return {
        text: `${getGreeting(callerName, now)} ${res.summary}`,
        executedActions,
      };
    }

    // Default: Create task / reminder
    const { targetDate } = resolveSwedishTargetDate(fullContent, now);
    const cleanTitle = fullContent
      .replace(/^(?:att\s*|en\s*uppgift\s*(?:om\s*att|att)?\s*)/i, "")
      .replace(/\s+(?:till\s+)?(?:den\s+\d{1,2}[e|a]?\s+[a-zåäö]+|på\s+[a-zåäö]+|imorgon|idag|i\s*övermorgon)$/gi, "")
      .trim();

    const resStr = await executeTool("create_task", {
      title: cleanTitle || fullContent,
      due_date: targetDate !== today ? targetDate : undefined,
    });
    const res = JSON.parse(resStr);
    return {
      text: `${getGreeting(callerName, now)} ${res.summary}`,
      executedActions,
    };
  }

  // Training & Workout status check ("Dagens Träning", "Dagens Pass", "Vad ska jag träna idag?")
  const isTrainingQuery =
    /(?:dagens\s*träning|dagens\s*pass|träningspass|vad\s*ska\s*jag\s*träna|vad\s*har\s*jag\s*för\s*pass|ska\s*jag\s*träna|träning\s*idag|pass\s*idag|mitt\s*träningspass|hur\s*ser\s*träningen\s*ut)/i.test(
      lower,
    ) || /^(träning|pass|träningsstatus)$/i.test(lower.trim());

  if (isTrainingQuery) {
    const toolResStr = await executeTool("get_training_status", { date: today });
    const toolRes = JSON.parse(toolResStr);
    return {
      text: `${getGreeting(callerName, now)} ${toolRes.summary}`,
      executedActions,
    };
  }

  // Nutrition & Protein status check ("Protein & Mat", "Mat & Protein", "Hur mycket protein har jag ätit?")
  const isNutritionQuery =
    /(?:protein\s*&\s*mat|mat\s*&\s*protein|dagens\s*protein|dagens\s*mat|hur\s*mycket\s*protein|proteinmål|vad\s*finns\s*det\s*för\s*matlådor|matlådor\s*i\s*frysen|kost\s*idag|mat\s*idag)/i.test(
      lower,
    ) || /^(kost|protein|mat|matlådor)$/i.test(lower.trim());

  if (isNutritionQuery) {
    const toolResStr = await executeTool("get_nutrition_status", { date: today });
    const toolRes = JSON.parse(toolResStr);
    return {
      text: `${getGreeting(callerName, now)}\n\n${toolRes.summary}`,
      executedActions,
    };
  }

  // Swedish Work Shift & Daily Schedule Query Handler:
  // "När börjar jag imorgon?", "När jobbar jag imorgon?", "När slutar jag imorgon?",
  // "Jobbar jag imorgon?", "Hur jobbar jag imorgon?", "Vilka tider jobbar jag på fredag?",
  // "När börjar Hanni imorgon?", "När jobbar Hanni idag?", "När slutar Hanni?", "Jobbar Hanni imorgon?",
  // "Vad händer imorgon?", "Vad gör familjen imorgon?", "Schema imorgon", "Hur ser morgondagen ut?",
  // "Är jag ledig imorgon?", "Är jag ledig på fredag?", "Är Hanni ledig imorgon?"
  const isWorkOrScheduleQuestion =
    /(?:när\s+börjar|vilken\s+tid\s+börjar|när\s+startar|när\s+jobbar|hur\s+jobbar|vilka\s+tider\s+jobbar|vilka\s+tider\s+har|vad\s+jobbar|jobbar\s+(?:jag|hanni|mamma|pappa|alma|shureym|cuzeyr|vi)|är\s+(?:jag|hanni|mamma|pappa)\s+ledig|när\s+slutar|vilken\s+tid\s+slutar|när\s+är\s+(?:jag|hanni)\s+(?:klar|färdig)|när\s+kommer\s+(?:jag|hanni|mamma|pappa)\s+hem|arbetspass|jobbpass|jobbtider|vad\s+händer\s+(?:idag|imorgon|på\s+[a-zåäö]+)|vad\s+gör\s+(?:vi|familjen)\s*(?:idag|imorgon)?|schema\s+(?:idag|imorgon|på\s+[a-zåäö]+)|hur\s+ser\s+(?:morgondagen|dagen|schemat)\s+ut|familjens\s*schema|familjeschema|dagens\s*schema|schema\s*idag)/i.test(
      lower,
    ) ||
    ((/^(schema|kalender)$/i.test(lower.trim()) || /(?:jobbar|börjar|slutar|ledig)/i.test(lower)) &&
      /(?:idag|i\s*dag|imorgon|i\s*morgon|imorn|i\s*morn|i\s*övermorgon|på\s+måndag|på\s+tisdag|på\s+onsdag|på\s+torsdag|på\s+fredag|på\s+lördag|på\s+söndag|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|den\s+\d+|\d{1,2}\/\d{1,2})/i.test(
        lower,
      ));

  if (isWorkOrScheduleQuestion) {
    const { targetDate, dateLabel } = resolveSwedishTargetDate(text, now);
    const dashboard = await loadDashboard(actor);
    executedActions.push("check_schedule");

    // 1. Resolve Target Person
    let targetPerson = dashboard.people.find((p) => p.id === actor.personId);
    let isExplicitOtherPerson = false;

    if (/(?:hanni|mamma|frun)\b/i.test(lower)) {
      const found = dashboard.people.find(
        (p) =>
          p.name.toLowerCase().includes("hanni") ||
          p.aliases.some((a) => a.toLowerCase().includes("hanni")),
      );
      if (found) {
        targetPerson = found;
        isExplicitOtherPerson = found.id !== actor.personId;
      }
    } else if (/\balma\b/i.test(lower)) {
      const found = dashboard.people.find((p) => p.name.toLowerCase().includes("alma"));
      if (found) {
        targetPerson = found;
        isExplicitOtherPerson = found.id !== actor.personId;
      }
    } else if (/\bshureym\b/i.test(lower)) {
      const found = dashboard.people.find((p) => p.name.toLowerCase().includes("shureym"));
      if (found) {
        targetPerson = found;
        isExplicitOtherPerson = found.id !== actor.personId;
      }
    } else if (/\bcuzeyr\b/i.test(lower)) {
      const found = dashboard.people.find((p) => p.name.toLowerCase().includes("cuzeyr"));
      if (found) {
        targetPerson = found;
        isExplicitOtherPerson = found.id !== actor.personId;
      }
    } else if (/(?:jimmy|pappa)\b/i.test(lower)) {
      const found = dashboard.people.find(
        (p) =>
          p.name.toLowerCase().includes("jimmy") ||
          p.aliases.some((a) => a.toLowerCase().includes("pappa")),
      );
      if (found) {
        targetPerson = found;
        isExplicitOtherPerson = found.id !== actor.personId;
      }
    }

    const isSelf = !isExplicitOtherPerson && (targetPerson?.id === actor.personId || !targetPerson);
    const targetPersonName = targetPerson?.name || "du";
    const pronoun = targetPerson?.name === "Hanni" ? "hon" : "han";
    const capDateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

    // 2. Resolve events on target date
    const allDayEvents = dashboard.events.filter(
      (e) => calendarDateInTimeZone(e.startsAt, DEFAULT_TIME_ZONE) === targetDate,
    );
    const personWorkEvents = allDayEvents.filter(
      (e) => e.category === "work" && (targetPerson ? eventConcernsPerson(e, targetPerson.id) : true),
    );
    const otherDayEvents = allDayEvents.filter((e) => e.category !== "work");

    // Optional task creation chained into message (e.g. "Kolla om jag jobbar ... och lägg in ...")
    let taskSummary = "";
    const taskMatch = text.match(/(?:och\s+)?(?:lägga in|lägg in|påminn|skapa)(?:\s+att|\s+om|\s+in)?\s+(.+)$/i);
    if (taskMatch) {
      const taskTitle = taskMatch[1]
        .replace(/^(?:jag\s+vill\s+|vi\s+måste\s+|vi\s+ska\s+|att\s+jag\s+vill\s+|att\s+|om\s+att\s+|om\s+)/i, "")
        .replace(/[?.!]+$/, "")
        .trim();
      const capitalized = taskTitle.charAt(0).toUpperCase() + taskTitle.slice(1);
      await executeTool("create_task", {
        title: capitalized,
        due_date: targetDate,
      });
      taskSummary = ` Jag har även lagt in en påminnelse om att "${capitalized}" till ${dateLabel}.`;
    }

    // 3. Build appropriate response based on intent
    const isStartQuery = /(?:när\s+börjar|vilken\s+tid\s+börjar|när\s+startar)/i.test(lower);
    const isEndQuery = /(?:när\s+slutar|vilken\s+tid\s+slutar|när\s+är\s+.*(?:klar|färdig)|när\s+kommer\s+.*hem)/i.test(lower);
    const isFreeQuery = /(?:är\s+.*ledig|ledig\s+från\s+jobbet)/i.test(lower);

    if (isStartQuery) {
      if (personWorkEvents.length > 0) {
        const w = personWorkEvents[0];
        const startTime = clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE);
        const endTime = clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE);
        const shiftTitle = w.title ? ` (${w.title})` : "";
        const reply = isSelf
          ? `${getGreeting(callerName, now)} ${capDateLabel} börjar du kl. ${startTime} och jobbar till kl. ${endTime}${shiftTitle}.${taskSummary}`
          : `${getGreeting(callerName, now)} ${capDateLabel} börjar ${targetPersonName} kl. ${startTime} och jobbar till kl. ${endTime}${shiftTitle}.${taskSummary}`;
        return { text: reply, executedActions };
      } else {
        const reply = isSelf
          ? `${getGreeting(callerName, now)} Du har inget inlagt arbetspass ${dateLabel}, så du är ledig från jobbet!${taskSummary}`
          : `${getGreeting(callerName, now)} ${targetPersonName} har inget inlagt arbetspass ${dateLabel}, så ${pronoun} är ledig från jobbet.${taskSummary}`;
        return { text: reply, executedActions };
      }
    }

    if (isEndQuery) {
      if (personWorkEvents.length > 0) {
        const w = personWorkEvents[0];
        const startTime = clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE);
        const endTime = clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE);
        const shiftTitle = w.title ? ` (${w.title})` : "";
        const reply = isSelf
          ? `${getGreeting(callerName, now)} ${capDateLabel} slutar du kl. ${endTime} (arbetspass ${startTime}–${endTime}${shiftTitle}).${taskSummary}`
          : `${getGreeting(callerName, now)} ${capDateLabel} slutar ${targetPersonName} kl. ${endTime} (arbetspass ${startTime}–${endTime}${shiftTitle}).${taskSummary}`;
        return { text: reply, executedActions };
      } else {
        const reply = isSelf
          ? `${getGreeting(callerName, now)} Du har inget inlagt arbetspass ${dateLabel}, så du är ledig från jobbet!${taskSummary}`
          : `${getGreeting(callerName, now)} ${targetPersonName} har inget inlagt arbetspass ${dateLabel}, så ${pronoun} är ledig från jobbet.${taskSummary}`;
        return { text: reply, executedActions };
      }
    }

    if (isFreeQuery) {
      if (personWorkEvents.length === 0) {
        const reply = isSelf
          ? `${getGreeting(callerName, now)} Ja, du har inget inlagt arbetspass ${dateLabel}, så du är ledig från jobbet!${taskSummary}`
          : `${getGreeting(callerName, now)} Ja, ${targetPersonName} har inget inlagt arbetspass ${dateLabel}, så ${pronoun} är ledig från jobbet.${taskSummary}`;
        return { text: reply, executedActions };
      } else {
        const times = personWorkEvents.map(
          (w) => `${clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE)}`,
        ).join(", ");
        const reply = isSelf
          ? `${getGreeting(callerName, now)} Nej, ${dateLabel} jobbar du ${times}.${taskSummary}`
          : `${getGreeting(callerName, now)} Nej, ${dateLabel} jobbar ${targetPersonName} ${times}.${taskSummary}`;
        return { text: reply, executedActions };
      }
    }

    // General work or daily schedule question
    if (personWorkEvents.length > 0) {
      const times = personWorkEvents.map(
        (w) => `${clockValueInTimeZone(w.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(w.endsAt, DEFAULT_TIME_ZONE)}`,
      ).join(", ");
      let otherNote = "";
      if (otherDayEvents.length > 0) {
        otherNote = `\n\nÖvrigt ${dateLabel}:\n` + otherDayEvents.map((e) => {
          const person = dashboard.people.find((p) => p.id === e.personId);
          const t = e.allDay ? "Hela dagen" : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`;
          return `• ${e.title}${person ? ` (${person.name})` : ""} kl. ${t}`;
        }).join("\n");
      }
      const reply = isSelf
        ? `${getGreeting(callerName, now)} ${capDateLabel} jobbar du ${times}.${otherNote}${taskSummary}`
        : `${getGreeting(callerName, now)} ${capDateLabel} jobbar ${targetPersonName} ${times}.${otherNote}${taskSummary}`;
      return { text: reply, executedActions };
    }

    // Free day
    let otherNote = "";
    if (otherDayEvents.length > 0) {
      otherNote = `\n\nInbokat ${dateLabel}:\n` + otherDayEvents.map((e) => {
        const person = dashboard.people.find((p) => p.id === e.personId);
        const t = e.allDay ? "Hela dagen" : `${clockValueInTimeZone(e.startsAt, DEFAULT_TIME_ZONE)}–${clockValueInTimeZone(e.endsAt, DEFAULT_TIME_ZONE)}`;
        return `• ${e.title}${person ? ` (${person.name})` : ""} kl. ${t}`;
      }).join("\n");
    }
    const reply = isSelf
      ? `${getGreeting(callerName, now)} Du har inget inlagt arbetspass ${dateLabel} (ledig från jobbet).${otherNote}${taskSummary}`
      : `${getGreeting(callerName, now)} ${targetPersonName} har inget inlagt arbetspass ${dateLabel}.${otherNote}${taskSummary}`;
    return { text: reply, executedActions };
  }

  // Kids Chores & Cleaning Areas check ("Är barnen färdiga med sina ansvarsområden?", "Har barnen städat?", "Är Alma klar?")
  const isChoresQuery =
    /(?:är\s+(?:barnen|alma|shureym|cuzeyr)\s+(?:klara|färdiga|klar|färdig)|har\s+(?:barnen|alma|shureym|cuzeyr)\s+städat|hur\s+går\s+det\s+för\s+barnen|hur\s+går\s+det\s+med\s+(?:städningen|barnens\s+städning|städ)|vem\s+är\s+klar|städat\s+klart|städat\s+färdigt|städstatus|städområde|städområden|ansvarsområde|ansvarsområden)/i.test(
      lower,
    ) || /(?:vem\s*städar\s*vad|vad\s*ska\s*(?:alma|shureym|cuzeyr|barnen)\s*städa|barnens\s*uppgifter)/i.test(lower);

  if (isChoresQuery) {
    let personName: string | undefined = undefined;
    if (/alma/i.test(lower)) personName = "Alma";
    else if (/shureym/i.test(lower)) personName = "Shureym";
    else if (/cuzeyr/i.test(lower)) personName = "Cuzeyr";

    const toolResStr = await executeTool("check_kids_chores_status", { person_name: personName });
    const toolRes = JSON.parse(toolResStr);
    return {
      text: `${getGreeting(callerName, now)} ${toolRes.summary}`,
      executedActions,
    };
  }

  // Natural Swedish reminder trigger ("påminn mig att storhandla på fredag efter jobbet")
  const parsedReminder = parseSwedishReminder(text, now);
  if (parsedReminder) {
    executedActions.push("create_task");
    const res = await createContextualReminder(actor, {
      title: parsedReminder.title,
      targetDate: parsedReminder.targetDate,
      timeString: parsedReminder.timeString,
      contextAnchor: parsedReminder.contextAnchor,
    });
    return {
      text: `${getGreeting(callerName, now)} ${res.text}`,
      executedActions,
    };
  }

  // Single memory store / query (adults only)
  if (
    actor.role === "owner" ||
    actor.role === "adult" ||
    actor.personType === "adult"
  ) {
    const memCommand = parseMemoryCommand(text);
    if (memCommand.type !== "none") {
      const memRes = await handleMemoryTextIntent(actor, text, options.channel || "web");
      if (memRes.handled) {
        executedActions.push(memCommand.type === "store" ? "save_memory" : "search_memory");
        return { text: memRes.replyText, executedActions };
      }
    }
  }

  // Weight & Body Measurement micro-log
  const weightMatch = text.match(/(?:vägde|vikt(?:en)?|väger).*?(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kilo)?/i);
  if (weightMatch) {
    const weightVal = parseFloat(weightMatch[1].replace(",", "."));
    if (weightVal >= 30 && weightVal <= 300) {
      const toolResStr = await executeTool("log_body_measurement", {
        metric: "weight",
        value: weightVal,
        unit: "kg",
      });
      const toolRes = JSON.parse(toolResStr);
      const remainingText = toolRes.remainingKg !== null ? ` ${toolRes.remainingKg} kg kvar till målet på ${toolRes.goalWeightKg} kg.` : "";
      return {
        text: `${getGreeting(callerName, now)} Noterat ${weightVal} kg för idag.${remainingText}`,
        executedActions,
      };
    }
  }

  // Protein & Quick Nutrition micro-log
  const proteinMatch = text.match(/(\d{1,3})\s*(?:g|gram)\s*protein/i) ||
    text.match(/(?:drack|åt|tog)\s*(?:en\s*)?(?:proteinshake|shake|vassleshake|keso|kvarg)\s*(?:med\s*)?(\d{1,3})/i);
  if (proteinMatch) {
    const proteinVal = parseInt(proteinMatch[1], 10);
    if (proteinVal > 0 && proteinVal <= 300) {
      let title = "Proteinmellanmål";
      if (/shake|vassle/i.test(text)) title = "Proteinshake";
      else if (/kyckling/i.test(text)) title = "Kycklingmåltid";
      else if (/keso|kvarg/i.test(text)) title = "Keso/kvarg";

      const toolResStr = await executeTool("log_quick_nutrition", {
        title,
        protein_g: proteinVal,
      });
      const toolRes = JSON.parse(toolResStr);
      return {
        text: `${getGreeting(callerName, now)} Noterat ${proteinVal}g protein (${title}). Dagens total är nu ${toolRes.dayTotalProteinG}g av ditt mål på ${toolRes.targetProteinG}g (${toolRes.remainingG}g kvar till målet).`,
        executedActions,
      };
    }
  }

  // Quick Workout / Spontaneous Session micro-log
  const runMatch = text.match(/(?:sprang|löpning|löppass)\s*(\d+(?:[.,]\d+)?)\s*(?:km|kilometer)?(?:\s*(?:på|i)\s*(\d+)\s*(?:min|minuter))?/i);
  if (runMatch) {
    const distanceKm = parseFloat(runMatch[1].replace(",", "."));
    const durationMinutes = runMatch[2] ? parseInt(runMatch[2], 10) : undefined;
    await executeTool("log_quick_workout", {
      title: `Löpning ${distanceKm} km`,
      activity_type: "running",
      distance_km: distanceKm,
      duration_minutes: durationMinutes,
    });
    return {
      text: `${getGreeting(callerName, now)} Grymt sprungit! Loggat Löpning ${distanceKm} km${durationMinutes ? ` (${durationMinutes} min)` : ""} som genomfört pass.`,
      executedActions,
    };
  }

  // Spontaneous home workout / pushups
  const homeMatch = text.match(/(?:gjorde|körde)\s*(\d+)\s*(?:armhävningar|knäböj|situps|chins|dips)/i);
  if (homeMatch) {
    await executeTool("log_quick_workout", {
      title: "Hemmapass",
      activity_type: "strength_home",
      notes: text,
    });
    return {
      text: `${getGreeting(callerName, now)} Bra jobbat! Loggat hemmapass ("${text}") som genomfört.`,
      executedActions,
    };
  }

  // Document search fallback (kallelser, scheman, dokument, tandläkare etc.)
  if (
    /(?:kallelse|dokument|brev|schema|tandläkar|vaccin|läkar|bvc|intyg|avtal|betyg)/i.test(text) &&
    /(?:vad står|vad är|när är|har vi|finns det|kolla|sök|hitta|läs)/i.test(text)
  ) {
    let query = "kallelse";
    if (/tandläk/i.test(text)) query = "tandläkare";
    else if (/vaccin/i.test(text)) query = "vaccination";
    else if (/schema/i.test(text)) query = "schema";
    else if (/avtal|hyra/i.test(text)) query = "avtal";

    const toolResStr = await executeTool("search_documents", { query });
    const toolRes = JSON.parse(toolResStr);
    if (toolRes.success && toolRes.documents?.length > 0) {
      const doc = toolRes.documents[0];
      return {
        text: `${getGreeting(callerName, now)} Enligt kallelsen "${doc.title}" (${doc.category}): ${doc.summary}${doc.events?.length ? ` Inbokad tid: ${doc.events.join(", ")}.` : ""}`,
        executedActions,
      };
    }
  }

  // Pure greeting
  if (/^(hej|tjena|hallå|god\s*(morgon|dag|kväll|natt)|läget|morsning)(?:\s+jarvis)?[\s!.]*$/i.test(text)) {
    return {
      text: `${getGreeting(callerName, now)} Hur kan jag hjälpa dig?`,
      executedActions: [],
    };
  }

  // Fallback for unhandled input: Log capability gap
  await logJarvisCapabilityGap(actor, text, options.channel || "web", {
    detectedIntent: "unhandled_query",
  });
  executedActions.push("log_missing_capability");

  return {
    text: `${getGreeting(callerName, now)} Det där har jag inte stöd för att göra ännu, men jag har sparat det till vår utvecklingslista så att vi kan bygga in det!`,
    executedActions,
  };
}
