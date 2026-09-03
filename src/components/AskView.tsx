"use client";

import { ArrowUp, Bot, CalendarSearch, Check, Clock3, FileText, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AssistantAnswer, DashboardData } from "@/lib/types";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; answer?: AssistantAnswer; error?: boolean };

const starterQuestions = [
  "När börjar jag imorgon?",
  "Vad ska vi göra idag?",
  "Vad ska vi äta idag?",
  "Vad gjorde jag den 1a september?",
  "Är barnen klara med sina ansvarsområden?",
];

export function AskView({
  data,
  useLocalContext,
  initialQuestion,
  onInitialQuestionHandled,
  onOpenDocument,
}: {
  data: DashboardData;
  useLocalContext: boolean;
  initialQuestion: string | null;
  onInitialQuestionHandled: () => void;
  onOpenDocument: (documentId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hej! Jag är Jarvis, er digitala familje- och livskollega. Fråga mig om scheman, arbetstider, middagstips, träning eller be mig lägga till och ändra saker!",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const handledRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  async function ask(value: string) {
    const clean = value.trim();
    // State updates are not synchronous. The ref also blocks a second click or
    // Enter event occurring before React has rendered the disabled button.
    if (!clean || inFlightRef.current) return;
    inFlightRef.current = true;

    setQuestion("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          ...(useLocalContext
            ? {
                context: {
                  people: data.people,
                  events: data.events,
                  tasks: data.tasks,
                  documents: data.documents,
                  currentPersonId: data.currentPersonId,
                  timezone: data.timezone,
                },
              }
            : {}),
        }),
      });
      const payload = (await response.json()) as AssistantAnswer | { error?: string };
      if (!response.ok || !("text" in payload)) {
        throw new Error("error" in payload ? payload.error : "Kunde inte svara");
      }
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: payload.text, answer: payload },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Jag kunde inte nå familjens uppgifter just nu. Försök igen om en liten stund.",
          error: true,
        },
      ]);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialQuestion) {
      handledRef.current = null;
      return;
    }
    // Keep a handoff pending if another request is still finishing. The loading
    // dependency retries it when the active request releases the synchronous lock.
    if (inFlightRef.current) return;
    if (handledRef.current === initialQuestion) return;
    handledRef.current = initialQuestion;
    void ask(initialQuestion);
    onInitialQuestionHandled();
    // ask is intentionally triggered only when a new handoff arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, loading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  return (
    <div className="ask-view view-enter">
      <section className="page-heading ask-page-heading">
        <div>
          <p className="eyebrow">Er digitala familje- och livskollega</p>
          <h1>Fråga Jarvis</h1>
          <p>Fråga om familjens planer, jobbscheman, träning, kost eller be mig ändra i kalendern.</p>
        </div>
        <span className="privacy-pill">
          <Check size={14} /> Bara familjens information
        </span>
      </section>

      <section className="chat-shell card" aria-busy={loading}>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`chat-turn chat-${message.role}`} key={message.id}>
              {message.role === "assistant" ? (
                <span className="assistant-avatar" aria-hidden="true">
                  <Sparkles size={18} />
                </span>
              ) : null}
              <div
                className={
                  message.role === "assistant" && message.error
                    ? "message-bubble message-error"
                    : "message-bubble"
                }
              >
                <p>{message.text}</p>
                {message.role === "assistant" && message.answer?.periodLabel ? (
                  <span className="answer-period">
                    <Clock3 size={14} /> {message.answer.periodLabel}
                  </span>
                ) : null}
                {message.role === "assistant" && message.answer?.sources.length ? (
                  <div className="answer-sources">
                    <span>Källor</span>
                    {message.answer.sources.map((source) => (
                      <button
                        key={`${message.id}-${source.id}`}
                        onClick={() => source.documentId && onOpenDocument(source.documentId)}
                        disabled={!source.documentId}
                      >
                        <FileText size={14} /> {source.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="chat-turn chat-assistant">
              <span className="assistant-avatar" aria-hidden="true">
                <Bot size={18} />
              </span>
              <div className="message-bubble typing-bubble" aria-label="Jarvis tänker">
                <i /> <i /> <i />
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {messages.length === 1 ? (
          <div className="starter-questions">
            <span>
              <CalendarSearch size={16} /> Prova att fråga
            </span>
            {starterQuestions.map((starter) => (
              <button key={starter} disabled={loading} onClick={() => void ask(starter)}>
                {starter}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor="chat-question" className="sr-only">
            Skriv en fråga till Jarvis
          </label>
          <textarea
            id="chat-question"
            rows={1}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(question);
              }
            }}
            placeholder="Prata med Jarvis eller be om något…"
          />
          <button type="submit" disabled={!question.trim() || loading} aria-label="Skicka frågan">
            <ArrowUp size={19} />
          </button>
        </form>
        <p className="chat-disclaimer">Jarvis kan misstolka information. Kontrollera alltid viktiga tider.</p>
      </section>
    </div>
  );
}
