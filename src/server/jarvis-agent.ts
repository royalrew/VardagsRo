import OpenAI from "openai";

import {
  addCalendarDateDays,
  calendarDateInTimeZone,
  clockValueInTimeZone,
  DEFAULT_TIME_ZONE,
} from "@/lib/dates";
import {
  type Project100MemoryCategory,
} from "@/lib/project100-jarvis";
import { parseMemoryCommand } from "@/lib/project100-memory-classifier";
import type { Project100MeasurementUnit } from "@/lib/project100-body";
import type { Project100MealType } from "@/lib/project100-nutrition";
import type { Project100ActivityType } from "@/lib/project100-training";
import { openAIConfig } from "@/server/config";
import { loadDashboard, saveManualTask } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";
import { loadProject100BodyJourney, saveProject100BodyEntry } from "@/server/project100-body";
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
}

export interface JarvisAgentResult {
  text: string;
  executedActions: string[];
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
      const eventsOnDate = dashboard.events.filter((e) => e.startsAt.startsWith(date));

      if (eventsOnDate.length === 0) {
        return JSON.stringify({
          date,
          status: "free",
          eventsCount: 0,
          summary: `Inga inlagda händelser eller arbetspass den ${date}. Användaren är ledig.`,
        });
      }

      const workEvents = eventsOnDate.filter((e) => e.category === "work");
      const isEvening = eventsOnDate.some((e) => {
        const timePart = e.startsAt.slice(11, 16);
        return timePart >= "15:00";
      });

      return JSON.stringify({
        date,
        status: workEvents.length > 0 ? "working" : "has_events",
        eventsCount: eventsOnDate.length,
        isEveningShift: isEvening,
        events: eventsOnDate.map((e) => ({
          title: e.title,
          category: e.category,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
        })),
        summary: `Hittade ${eventsOnDate.length} händelse(r) den ${date}: ${eventsOnDate
          .map((e) => `${e.title} (${e.startsAt.slice(11, 16)}–${e.endsAt.slice(11, 16)})`)
          .join(", ")}`,
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

    if (name === "save_memory") {
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

      const searchTerms = query
        .toLowerCase()
        .replace(/kallelsen?|från|om|i|på|ett|en|det|vad|står|finns/g, "")
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 2);

      const matchingDocs = dashboard.documents.filter((doc) => {
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
        exercises: [],
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

  // Pure greeting
  if (/^(hej|tjena|hallå|god kväll|god morgon|god dag|läget)(\s+jarvis)?[!.]?$/i.test(lower)) {
    return {
      text: `${getGreeting(callerName, now)} Hur kan jag hjälpa dig?`,
      executedActions: [],
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

  // Combined: "Kolla om jag jobbar ... och lägg in ..."
  const scheduleMatch = lower.match(/jobbar.*?(?:den\s+)?(\d{1,2})[e|a]?\s+([a-zåäö]+)/i);

  if (scheduleMatch) {
    const day = scheduleMatch[1].padStart(2, "0");
    const monthNames: Record<string, string> = {
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
    const monthStr = scheduleMatch[2].toLowerCase();
    const month = monthNames[monthStr] || "09";
    const year = now.getFullYear();
    const targetDate = `${year}-${month}-${day}`;

    // 1. Check schedule
    await executeTool("check_schedule", { date: targetDate });

    // 2. Create task if requested
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
      taskSummary = ` Jag har även lagt in en påminnelse om att "${capitalized}" till den ${Number(day)} ${monthStr}.`;
    }

    return {
      text: `${getGreeting(callerName, now)} Den ${Number(day)} ${monthStr} är du ledig på kvällen (inget arbetspass inlagt).${taskSummary}`,
      executedActions,
    };
  }

  // Single memory store / query
  const memCommand = parseMemoryCommand(text);
  if (memCommand.type !== "none") {
    const memRes = await handleMemoryTextIntent(actor, text, options.channel || "web");
    if (memRes.handled) {
      executedActions.push(memCommand.type === "store" ? "save_memory" : "search_memory");
      return { text: memRes.replyText, executedActions };
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
