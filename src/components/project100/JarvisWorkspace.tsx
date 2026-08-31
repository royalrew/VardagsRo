"use client";

import {
  AlertCircle,
  Bot,
  Brain,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  ExternalLink,
  Flame,
  Lightbulb,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Send,
  Sparkles,
  Sun,
  Trash2,
  Utensils,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  MEMORY_CATEGORY_LABELS,
  MEMORY_KIND_LABELS,
  PROJECT100_MEMORY_CATEGORIES,
  PROPOSAL_KIND_LABELS,
  type Project100ChatMessage,
  type Project100Conversation,
  type Project100JarvisContext,
  type Project100Memory,
  type Project100MemoryCategory,
  type Project100MemoryKind,
} from "@/lib/project100-jarvis";

const QUICK_QUESTIONS = [
  "☀️ God morgon Jarvis! Vad har vi idag?",
  "🌙 God kväll Jarvis, hur gick dagen?",
  "Vad tränade jag senast och hur kändes det?",
  "När finns nästa träningsfönster runt jobbet?",
  "Vilka färdiga matlådor finns i frysen och hur mycket protein ger de?",
  "Hur ser min vikt- och styrkeutveckling ut just nu?",
];

export function JarvisWorkspace({
  conversations: initialConversations,
  activeConversation: initialActiveConversation,
  messages: initialMessages,
  memories: initialMemories,
  context,
}: {
  conversations: Project100Conversation[];
  activeConversation: Project100Conversation | null;
  messages: Project100ChatMessage[];
  memories: Project100Memory[];
  context: Project100JarvisContext;
}) {
  const router = useRouter();

  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversation, setActiveConversation] = useState(initialActiveConversation);
  const [messages, setMessages] = useState<Project100ChatMessage[]>(initialMessages);
  const [memories, setMemories] = useState<Project100Memory[]>(initialMemories);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Right sidebar tabs: "memories" | "context" | "gaps"
  const [sidebarTab, setSidebarTab] = useState<"memories" | "context" | "gaps">("memories");

  // Capability Gaps (Self-improving Wishlist)
  const [gaps, setGaps] = useState<
    Array<{
      id: string;
      rawQuery: string;
      detectedIntent: string | null;
      categoryHint: string | null;
      channel: "telegram" | "web";
      status: "pending" | "implemented" | "dismissed";
      createdAt: string;
    }>
  >([]);
  const [isLoadingGaps, setIsLoadingGaps] = useState(false);

  async function loadGaps() {
    setIsLoadingGaps(true);
    try {
      const res = await fetch("/api/project100/jarvis/gaps");
      if (res.ok) {
        const data = await res.json();
        setGaps(data.gaps || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingGaps(false);
    }
  }

  async function handleToggleGapStatus(id: string, currentStatus: string) {
    const nextStatus = currentStatus === "implemented" ? "pending" : "implemented";
    try {
      const res = await fetch(`/api/project100/jarvis/gaps/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setGaps((prev) =>
          prev.map((g) => (g.id === id ? { ...g, status: nextStatus } : g))
        );
      }
    } catch {
      // ignore
    }
  }

  // Voice Player (OpenAI TTS Onyx)
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  async function handlePlayVoice(messageId: string, text: string) {
    if (playingMessageId === messageId) {
      currentAudio?.pause();
      setCurrentAudio(null);
      setPlayingMessageId(null);
      return;
    }

    if (currentAudio) {
      currentAudio.pause();
      setCurrentAudio(null);
    }

    setPlayingMessageId(messageId);
    try {
      const res = await fetch("/api/project100/jarvis/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
      if (!res.ok) throw new Error("Kunde inte generera röst.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setCurrentAudio(audio);
      audio.onended = () => {
        setPlayingMessageId(null);
        setCurrentAudio(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingMessageId(null);
        setCurrentAudio(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setPlayingMessageId(null);
      setCurrentAudio(null);
    }
  }

  // New Memory Modal / Form
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [newMemoryKind, setNewMemoryKind] = useState<Project100MemoryKind>("fact");
  const [newMemoryCategory, setNewMemoryCategory] = useState<Project100MemoryCategory>("job");
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [newMemorySource, setNewMemorySource] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryCategoryFilter, setMemoryCategoryFilter] = useState<string>("all");

  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      if (memoryCategoryFilter !== "all" && m.category !== memoryCategoryFilter) return false;
      if (memorySearch.trim()) {
        const term = memorySearch.toLowerCase();
        return m.content.toLowerCase().includes(term);
      }
      return true;
    });
  }, [memories, memoryCategoryFilter, memorySearch]);

  async function handleSendMessage(promptToSend?: string) {
    const text = (promptToSend ?? inputValue).trim();
    if (!text || isSending) return;

    setError(null);
    setIsSending(true);
    setInputValue("");

    // Optimistic user message
    const tempUserMsg: Project100ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversation?.id ?? "new",
      role: "user",
      content: text,
      sources: [],
      proposals: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch("/api/project100/jarvis/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversation?.id ?? null,
          content: text,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Kunde inte skicka meddelande.");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);

      if (!activeConversation || activeConversation.id !== data.conversationId) {
        const newConv: Project100Conversation = {
          id: data.conversationId,
          title: text.slice(0, 36),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setActiveConversation(newConv);
        setConversations((prev) => [newConv, ...prev]);
        router.push(`/projekt-100/jarvis?c=${data.conversationId}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setIsSending(false);
    }
  }

  async function handleNewConversation() {
    setError(null);
    try {
      const res = await fetch("/api/project100/jarvis/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Ny konversation" }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveConversation(data.conversation);
        setMessages([]);
        router.push(`/projekt-100/jarvis?c=${data.conversation.id}`);
      }
    } catch {
      setActiveConversation(null);
      setMessages([]);
    }
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Vill du radera denna konversation?")) return;

    try {
      const res = await fetch(`/api/project100/jarvis/conversations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversation?.id === id) {
          const next = conversations.find((c) => c.id !== id) ?? null;
          setActiveConversation(next);
          if (next) {
            router.push(`/projekt-100/jarvis?c=${next.id}`);
          } else {
            setMessages([]);
            router.push("/projekt-100/jarvis");
          }
        }
      }
    } catch {
      setError("Kunde inte radera konversationen.");
    }
  }

  async function handleToggleMemory(mem: Project100Memory) {
    try {
      const res = await fetch(`/api/project100/jarvis/memories/${mem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !mem.isActive }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories((prev) =>
          prev.map((m) => (m.id === mem.id ? data.memory : m)),
        );
      }
    } catch {
      setError("Kunde inte uppdatera minnet.");
    }
  }

  async function handleDeleteMemory(id: string) {
    if (!confirm("Vill du att Jarvis ska glömma detta minne?")) return;
    try {
      const res = await fetch(`/api/project100/jarvis/memories/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch {
      setError("Kunde inte radera minnet.");
    }
  }

  async function handleCreateMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;

    try {
      const res = await fetch("/api/project100/jarvis/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: newMemoryKind,
          category: newMemoryCategory,
          content: newMemoryContent.trim(),
          sourceRef: newMemorySource.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories((prev) => [data.memory, ...prev]);
        setShowAddMemory(false);
        setNewMemoryContent("");
        setNewMemorySource("");
      }
    } catch {
      setError("Kunde inte spara minnet.");
    }
  }

  return (
    <div className="p100-jarvis-workspace">
      {/* 1. Left Column: Conversations & Quick Prompts */}
      <aside className="p100-jarvis-sidebar left">
        <header className="p100-sidebar-head">
          <div className="p100-jarvis-brand">
            <Bot />
            <strong>Jarvis AI</strong>
          </div>
          <button
            type="button"
            className="p100-btn p100-btn-primary p100-new-conv-btn"
            onClick={handleNewConversation}
          >
            <MessageSquarePlus /> Ny konversation
          </button>
        </header>

        <div className="p100-sidebar-section">
          <small className="p100-section-label">Konversationer</small>
          <ul className="p100-conv-list">
            {conversations.length === 0 ? (
              <li className="p100-empty-copy">Inga sparade konversationer.</li>
            ) : (
              conversations.map((c) => (
                <li
                  key={c.id}
                  className={`p100-conv-item ${
                    activeConversation?.id === c.id ? "active" : ""
                  }`}
                  onClick={() => {
                    setActiveConversation(c);
                    router.push(`/projekt-100/jarvis?c=${c.id}`);
                  }}
                >
                  <MessageSquare />
                  <span>{c.title}</span>
                  <button
                    type="button"
                    aria-label="Radera konversation"
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                  >
                    <Trash2 />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="p100-sidebar-section quick-prompts">
          <small className="p100-section-label">Relevanta frågor</small>
          <ul className="p100-quick-list">
            {QUICK_QUESTIONS.map((q, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => handleSendMessage(q)}
                  disabled={isSending}
                >
                  <Lightbulb />
                  <span>{q}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 2. Middle Column: Chat Area */}
      <main className="p100-jarvis-main">
        <header className="p100-jarvis-chat-header">
          <div>
            <h2>{activeConversation?.title ?? "Jarvis Assistent"}</h2>
            <p>
              Källbunden assistent · Läser träning, kost och jobbschema utan hallucination.
            </p>
          </div>
          <div className="p100-briefing-quick-actions">
            <button
              type="button"
              className="p100-briefing-btn morning"
              onClick={() => void handleSendMessage("☀️ God morgon Jarvis! Vad har vi idag?")}
              disabled={isSending}
              title="Kör dagens morgonöversikt"
            >
              <Sun />
              <span>Morgonbriefing</span>
            </button>
            <button
              type="button"
              className="p100-briefing-btn evening"
              onClick={() => void handleSendMessage("🌙 God kväll Jarvis, hur gick dagen?")}
              disabled={isSending}
              title="Kör kvällens avstämning"
            >
              <Moon />
              <span>Kvällsavstämning</span>
            </button>
          </div>
        </header>

        {error ? (
          <div className="p100-error-banner" role="alert">
            <AlertCircle />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="p100-chat-messages-scroll">
          {messages.length === 0 ? (
            <div className="p100-chat-empty-state">
              <Bot />
              <h3>Vad kan jag hjälpa dig med idag?</h3>
              <p>
                Jag har tillgång till din aktuella vikt, dina genomförda pass, ditt
                jobbschema från familjekalendern och matlådorna i frysen.
              </p>
              <div className="p100-empty-quick-grid">
                {QUICK_QUESTIONS.slice(0, 3).map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="p100-empty-prompt-card"
                    onClick={() => handleSendMessage(q)}
                  >
                    <strong>{q}</strong>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p100-chat-messages-list">
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={`p100-chat-bubble ${m.role}`}
                >
                  <header>
                    <div className="p100-bubble-author">
                      {m.role === "assistant" ? <Bot /> : null}
                      <strong>{m.role === "assistant" ? "Jarvis" : "Du"}</strong>
                    </div>
                    {m.role === "assistant" ? (
                      <button
                        type="button"
                        className={`p100-msg-audio-btn ${playingMessageId === m.id ? "playing" : ""}`}
                        onClick={() => handlePlayVoice(m.id, m.content)}
                        aria-label="Lyssna på Jarvis röst"
                        title="Lyssna på Jarvis (OpenAI TTS Onyx)"
                      >
                        <Volume2 />
                        <span>{playingMessageId === m.id ? "Spelar..." : "Lyssna"}</span>
                      </button>
                    ) : null}
                  </header>
                  <div className="p100-message-body">
                    <p>{m.content}</p>
                  </div>

                  {/* Sources attached to assistant reply */}
                  {m.sources && m.sources.length > 0 ? (
                    <div className="p100-message-sources">
                      <small>Källor för detta svar:</small>
                      <div className="p100-source-chips">
                        {m.sources.map((s, idx) => (
                          <span key={idx} className={`p100-source-chip ${s.kind}`}>
                            {s.kind === "work" ? (
                              <BriefcaseBusiness />
                            ) : s.kind === "session" ? (
                              <Dumbbell />
                            ) : s.kind === "body" ? (
                              <Scale />
                            ) : (
                              <Utensils />
                            )}
                            <b>{s.title}:</b> {s.detail}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Structured proposals */}
                  {m.proposals && m.proposals.length > 0 ? (
                    <div className="p100-message-proposals">
                      {m.proposals.map((p, idx) => (
                        <div key={idx} className="p100-proposal-card">
                          <header>
                            <Sparkles />
                            <strong>{PROPOSAL_KIND_LABELS[p.kind]}: {p.title}</strong>
                          </header>
                          <div className="p100-proposal-actions">
                            <button
                              type="button"
                              className="p100-btn p100-btn-primary"
                              onClick={() => alert("Utkast godkänt och sparat!")}
                            >
                              Godkänn förslag
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}

              {isSending ? (
                <article className="p100-chat-bubble assistant sending">
                  <header>
                    <Bot />
                    <strong>Jarvis</strong>
                  </header>
                  <p className="p100-typing-indicator">Analyserar historik och jobbschema...</p>
                </article>
              ) : null}
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          className="p100-chat-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ställ en fråga till Jarvis (Shift+Enter för ny rad)..."
            rows={1}
            disabled={isSending}
          />
          <button
            type="submit"
            className="p100-send-btn"
            disabled={!inputValue.trim() || isSending}
            aria-label="Skicka meddelande"
          >
            <Send />
          </button>
        </form>
      </main>

      {/* 3. Right Column: Controlled Memories & Realtime Context */}
      <aside className="p100-jarvis-sidebar right">
        <nav className="p100-right-tab-toggle" aria-label="Högerpanel">
          <button
            type="button"
            className={sidebarTab === "memories" ? "active" : ""}
            onClick={() => setSidebarTab("memories")}
          >
            <Brain /> Minnen ({memories.length})
          </button>
          <button
            type="button"
            className={sidebarTab === "context" ? "active" : ""}
            onClick={() => setSidebarTab("context")}
          >
            <Zap /> Kontext
          </button>
          <button
            type="button"
            className={sidebarTab === "gaps" ? "active" : ""}
            onClick={() => {
              setSidebarTab("gaps");
              void loadGaps();
            }}
          >
            <Lightbulb /> Önskelista
          </button>
        </nav>

        {sidebarTab === "memories" ? (
          <div className="p100-memories-panel">
            <div className="p100-memories-header">
              <div>
                <strong>Kontrollerat minne</strong>
                <p>Minnen som Jarvis har lärt sig eller som du har angett.</p>
              </div>
              <button
                type="button"
                className="p100-btn p100-btn-sm"
                onClick={() => setShowAddMemory(true)}
              >
                <Plus /> Nytt minne
              </button>
            </div>

            {showAddMemory ? (
              <form className="p100-memory-form" onSubmit={handleCreateMemory}>
                <header>
                  <strong>Skapa minne</strong>
                  <button
                    type="button"
                    aria-label="Stäng"
                    onClick={() => setShowAddMemory(false)}
                  >
                    <X />
                  </button>
                </header>
                <div className="p100-field">
                  <label htmlFor="mem-kind">Typ</label>
                  <select
                    id="mem-kind"
                    value={newMemoryKind}
                    onChange={(e) => setNewMemoryKind(e.target.value as Project100MemoryKind)}
                  >
                    <option value="fact">Fakta</option>
                    <option value="learning">Lärdom</option>
                    <option value="event">Händelse</option>
                  </select>
                </div>
                <div className="p100-field">
                  <label htmlFor="mem-cat">Kategori</label>
                  <select
                    id="mem-cat"
                    value={newMemoryCategory}
                    onChange={(e) => setNewMemoryCategory(e.target.value as Project100MemoryCategory)}
                  >
                    {PROJECT100_MEMORY_CATEGORIES.map((cat) => {
                      const info = MEMORY_CATEGORY_LABELS[cat];
                      return (
                        <option key={cat} value={cat}>
                          {info.icon} {info.label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="p100-field">
                  <label htmlFor="mem-content">Beskrivning</label>
                  <textarea
                    id="mem-content"
                    value={newMemoryContent}
                    onChange={(e) => setNewMemoryContent(e.target.value)}
                    placeholder="t.ex. 'Koden till inkontinensförrådet är 2214' eller 'Däckdimension 205/55 R16'"
                    rows={2}
                    required
                  />
                </div>
                <div className="p100-memory-form-actions">
                  <button
                    type="button"
                    className="p100-btn"
                    onClick={() => setShowAddMemory(false)}
                  >
                    Avbryt
                  </button>
                  <button type="submit" className="p100-btn p100-btn-primary">
                    Spara minne
                  </button>
                </div>
              </form>
            ) : null}

            <div className="p100-memory-search-bar">
              <div className="p100-mem-search-input-wrap">
                <Search />
                <input
                  type="text"
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  placeholder="Sök koder, mått, däck, fakta..."
                />
                {memorySearch ? (
                  <button
                    type="button"
                    onClick={() => setMemorySearch("")}
                    aria-label="Rensa sökning"
                  >
                    <X />
                  </button>
                ) : null}
              </div>
              <div className="p100-memory-cats-scroll">
                <button
                  type="button"
                  className={memoryCategoryFilter === "all" ? "active" : ""}
                  onClick={() => setMemoryCategoryFilter("all")}
                >
                  Alla ({memories.length})
                </button>
                {PROJECT100_MEMORY_CATEGORIES.map((cat) => {
                  const count = memories.filter((m) => m.category === cat).length;
                  if (count === 0 && memoryCategoryFilter !== cat) return null;
                  const info = MEMORY_CATEGORY_LABELS[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={memoryCategoryFilter === cat ? "active" : ""}
                      onClick={() => setMemoryCategoryFilter(cat)}
                    >
                      {info.icon} {info.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <ul className="p100-memory-list">
              {filteredMemories.length === 0 ? (
                <li className="p100-empty-copy">
                  {memories.length === 0
                    ? "Inga sparade minnen ännu."
                    : "Inga minnen matchar din sökning."}
                </li>
              ) : (
                filteredMemories.map((m) => (
                  <li
                    key={m.id}
                    className={`p100-memory-item ${m.isActive ? "active" : "inactive"}`}
                  >
                    <header>
                      <span className="p100-mem-badge">
                        {MEMORY_CATEGORY_LABELS[m.category]?.icon ?? "📌"}{" "}
                        {MEMORY_KIND_LABELS[m.kind]}: {MEMORY_CATEGORY_LABELS[m.category]?.label ?? m.category}
                      </span>
                      <div className="p100-mem-controls">
                        <button
                          type="button"
                          className={m.isActive ? "on" : "off"}
                          onClick={() => handleToggleMemory(m)}
                          title={m.isActive ? "Aktivt (används av Jarvis)" : "Inaktivt (pausat)"}
                        >
                          {m.isActive ? "Aktiv" : "Pausad"}
                        </button>
                        <button
                          type="button"
                          aria-label="Glöm minne"
                          onClick={() => handleDeleteMemory(m.id)}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </header>
                    <p>{m.content}</p>
                    {m.sourceRef ? <small>Källa: {m.sourceRef}</small> : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : sidebarTab === "context" ? (
          <div className="p100-context-panel">
            <div className="p100-context-box">
              <header>
                <BriefcaseBusiness />
                <strong>Nästa arbetspass</strong>
              </header>
              {context.upcomingWorkEvents.length > 0 ? (
                <div>
                  <b>{context.upcomingWorkEvents[0].title}</b>
                  <p>
                    {context.upcomingWorkEvents[0].startsAt.slice(0, 10)} (
                    {context.upcomingWorkEvents[0].startsAt.slice(11, 16)} –{" "}
                    {context.upcomingWorkEvents[0].endsAt.slice(11, 16)})
                  </p>
                </div>
              ) : (
                <p className="p100-empty-copy">Inga inlagda arbetspass närmast.</p>
              )}
            </div>

            <div className="p100-context-box">
              <header>
                <Scale />
                <strong>Kropp & Mål</strong>
              </header>
              <dl>
                <div>
                  <dt>Nuvarande vikt</dt>
                  <dd>{context.currentWeightKg ?? "—"} kg</dd>
                </div>
                <div>
                  <dt>Målvikt</dt>
                  <dd>{context.weightGoalKg ?? "100"} kg</dd>
                </div>
                <div>
                  <dt>Proteinmål</dt>
                  <dd>{context.proteinTargetG ?? "160"} g/dag</dd>
                </div>
              </dl>
            </div>

            <div className="p100-context-box">
              <header>
                <Utensils />
                <strong>Frysen / Matlådor</strong>
              </header>
              {context.pantryBatches.length > 0 ? (
                <ul>
                  {context.pantryBatches.map((b) => (
                    <li key={b.id}>
                      <span>{b.title}</span>
                      <b>{b.portionsRemaining} port ({b.proteinPerPortionG}g)</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p100-empty-copy">Inga matlådor i frysen.</p>
              )}
            </div>

            <div className="p100-context-box">
              <header>
                <Dumbbell />
                <strong>Senaste träning</strong>
              </header>
              {context.recentSessions.length > 0 ? (
                <div>
                  <b>{context.recentSessions[0].title}</b>
                  <p>
                    {context.recentSessions[0].date} · {context.recentSessions[0].activityType}
                  </p>
                </div>
              ) : (
                <p className="p100-empty-copy">Inga loggade pass.</p>
              )}
            </div>
          </div>
        ) : null}

        {sidebarTab === "gaps" ? (
          <div className="p100-memories-panel">
            <div className="p100-memories-header">
              <div>
                <strong>Önskelista / Backlogg</strong>
                <p>
                  Frågor och kommandon du ställt i Telegram eller webben som
                  Jarvis saknar funktion för än.
                </p>
              </div>
              <button
                type="button"
                className="p100-btn p100-btn-sm"
                onClick={() => void loadGaps()}
                disabled={isLoadingGaps}
              >
                <RotateCcw /> Uppdatera
              </button>
            </div>

            {isLoadingGaps ? (
              <p className="p100-empty-copy">Laddar önskemål...</p>
            ) : gaps.length === 0 ? (
              <div className="p100-memory-empty">
                <Lightbulb />
                <h4>Inga olösta önskemål loggade</h4>
                <p>
                  När du frågar Jarvis om något som koden inte stödjer än, sparas
                  det automatiskt här som underlag för nästa utvecklingssession.
                </p>
              </div>
            ) : (
              <div className="p100-memories-list">
                {gaps.map((gap) => (
                  <article
                    key={gap.id}
                    className={`p100-memory-card ${
                      gap.status === "implemented" ? "p100-memory-source" : ""
                    }`}
                  >
                    <header>
                      <span className="p100-mem-badge">
                        {gap.channel === "telegram" ? "📱 Telegram" : "🌐 Webb"}
                      </span>
                      {gap.categoryHint ? (
                        <span className="p100-mem-badge p100-mem-cat">
                          {gap.categoryHint}
                        </span>
                      ) : null}
                      <span
                        className={`p100-status-pill ${
                          gap.status === "implemented" ? "active" : ""
                        }`}
                      >
                        {gap.status === "implemented"
                          ? "✓ Löst i koden"
                          : "⏳ Väntar"}
                      </span>
                    </header>
                    <p>
                      <strong>&quot;{gap.rawQuery}&quot;</strong>
                    </p>
                    {gap.detectedIntent ? (
                      <small style={{ color: "var(--p100-accent)" }}>
                        Önskad funktion: {gap.detectedIntent}
                      </small>
                    ) : null}
                    <footer>
                      <small>{gap.createdAt.slice(0, 10)}</small>
                      <button
                        type="button"
                        className="p100-btn p100-btn-xs"
                        onClick={() =>
                          void handleToggleGapStatus(gap.id, gap.status)
                        }
                      >
                        {gap.status === "implemented"
                          ? "Markera som väntande"
                          : "Markera som löst"}
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
