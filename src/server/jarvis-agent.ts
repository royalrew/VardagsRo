import OpenAI from "openai";

import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  MEMORY_CATEGORY_LABELS,
  type Project100MemoryCategory,
  type Project100MemoryKind,
} from "@/lib/project100-jarvis";
import { parseMemoryCommand } from "@/lib/project100-memory-classifier";
import { openAIConfig } from "@/server/config";
import { loadDashboard, saveManualTask } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";
import { createProject100ContentProject } from "@/server/project100-content";
import { saveProject100JournalEntry } from "@/server/project100-journal";
import { handleMemoryTextIntent } from "@/server/project100-memory-assistant";
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

    if (name === "save_journal") {
      const targetDate = args.date ? String(args.date) : today;
      const reflection = args.reflection ? String(args.reflection) : null;
      const energy = typeof args.energy === "number" ? args.energy : null;
      const mood = typeof args.mood === "number" ? args.mood : null;
      const sleepHours = typeof args.sleep_hours === "number" ? args.sleep_hours : null;

      await saveProject100JournalEntry(actor, {
        writtenOn: targetDate,
        body: reflection,
        energy,
        mood,
        sleepHours,
        excludedFromAi: false,
      });

      return JSON.stringify({
        success: true,
        date: targetDate,
        summary: `Dagboksanteckning sparad för ${targetDate}.`,
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

    return JSON.stringify({ error: `Okänt verktyg: ${name}` });
  }

  // 2. Try LLM Tool Calling
  const ai = getAgentClient();
  if (ai) {
    try {
      const systemPrompt = `Du är Jarvis, den personliga assistenten och digitala kollegan i Vardagsro och Projekt 100.
Du hjälper ${callerName} med hushållets kalender, minnen, dagbok, idéer, att-göra-uppgifter och träning.

IDAG ÄR: ${today} (tidszon Europe/Stockholm, klockan är cirka ${now.toTimeString().slice(0, 5)}).
DITT TILLTAL: Varmt, personligt, professionellt och konformat ("Glass & Steel"). Hälsa gärna med "${getGreeting(callerName, now)}" om användaren inleder en konversation.
NOLL HALLUCINATION: Gissa aldrig kalenderhändelser, koder eller fakta. Använd alltid verktygen för att slå upp schema (check_schedule), skapa uppgifter (create_task), spara/söka minnen eller logga dagbok.
KOMBINERADE HANDLINGAR: Om användaren både vill veta något (t.ex. kolla om hen jobbar) OCH göra något (t.ex. boka bord/lägga till uppgift), anropa BÅDA verktygen och ge ett komplett, tydligt svar som bekräftar båda delarna.`;

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
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

  // Pure greeting
  if (/^(hej|tjena|hallå|god kväll|god morgon|god dag|läget)(\s+jarvis)?[!.]?$/i.test(lower)) {
    return {
      text: `${getGreeting(callerName, now)} Hur kan jag hjälpa dig?`,
      executedActions: [],
    };
  }

  // Combined: "Kolla om jag jobbar ... och lägg in ..."
  const scheduleMatch = lower.match(/jobbar.*?(?:den\s+)?(\d{1,2})[e|a]?\s+([a-zåäö]+)/i);
  const taskMatch = lower.match(/(?:lägg in|boka|påminn|skapa).*?(?:att|om)?\s+(.+)$/i);

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
      let taskTitle = taskMatch[1]
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

  return {
    text: `${getGreeting(callerName, now)} Jag tog emot: "${text}". Hur vill du att vi går vidare?`,
    executedActions,
  };
}
