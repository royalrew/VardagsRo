"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Lightbulb,
  Link as LinkIcon,
  ListTodo,
  Plus,
  Radio,
  Save,
  Sparkles,
  Tag,
  Trash2,
  Video,
  X,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  CONTENT_STATUS_LABELS,
  PROJECT100_CONTENT_STATUSES,
  type EditorSuggestion,
  type Project100AttachedMedia,
  type Project100ContentProject,
  type Project100ContentStatus,
  type Project100ShotlistItem,
  type Project100ThumbnailIdea,
} from "@/lib/project100-content";
import type { Project100MediaItem } from "@/lib/project100-media";

export function ContentWorkspace({
  projects: initialProjects,
  activeProject: initialActiveProject,
  availableMedia,
}: {
  projects: Project100ContentProject[];
  activeProject: Project100ContentProject | null;
  availableMedia: Project100MediaItem[];
}) {
  const router = useRouter();

  const [projects, setProjects] = useState(initialProjects);
  const [activeProject, setActiveProject] = useState(initialActiveProject);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form State for Active Project
  const [title, setTitle] = useState(initialActiveProject?.title ?? "");
  const [hook, setHook] = useState(initialActiveProject?.hook ?? "");
  const [concept, setConcept] = useState(initialActiveProject?.concept ?? "");
  const [script, setScript] = useState(initialActiveProject?.script ?? "");
  const [status, setStatus] = useState<Project100ContentStatus>(
    initialActiveProject?.status ?? "idea",
  );
  const [targetPublishDate, setTargetPublishDate] = useState(
    initialActiveProject?.targetPublishDate ?? "",
  );
  const [publishedUrl, setPublishedUrl] = useState(
    initialActiveProject?.publishedUrl ?? "",
  );
  const [shotlist, setShotlist] = useState<Project100ShotlistItem[]>(
    initialActiveProject?.shotlist ?? [],
  );
  const [thumbnailIdeas, setThumbnailIdeas] = useState<Project100ThumbnailIdea[]>(
    initialActiveProject?.thumbnailIdeas ?? [],
  );
  const [media, setMedia] = useState<Project100AttachedMedia[]>(
    initialActiveProject?.media ?? [],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Modals & Panels
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [newShotTitle, setNewShotTitle] = useState("");
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [suggestion, setSuggestion] = useState<EditorSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // Sync state when active project changes
  useEffect(() => {
    if (activeProject) {
      setTitle(activeProject.title);
      setHook(activeProject.hook ?? "");
      setConcept(activeProject.concept ?? "");
      setScript(activeProject.script ?? "");
      setStatus(activeProject.status);
      setTargetPublishDate(activeProject.targetPublishDate ?? "");
      setPublishedUrl(activeProject.publishedUrl ?? "");
      setShotlist(activeProject.shotlist ?? []);
      setThumbnailIdeas(activeProject.thumbnailIdeas ?? []);
      setMedia(activeProject.media ?? []);
    }
  }, [activeProject]);

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  async function handleCreateProject() {
    setError(null);
    try {
      const res = await fetch("/api/project100/content/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Ny YouTube-idé" }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects((prev) => [data.project, ...prev]);
        setActiveProject(data.project);
        router.push(`/projekt-100/innehall?id=${data.project.id}`);
      }
    } catch {
      setError("Kunde inte skapa projekt.");
    }
  }

  async function handleSaveProject() {
    if (!activeProject) return;
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/project100/content/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          hook: hook || null,
          concept: concept || null,
          script: script || null,
          status,
          targetPublishDate: targetPublishDate || null,
          publishedUrl: publishedUrl || null,
          shotlist,
          thumbnailIdeas,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Kunde inte spara projektet.");
      }

      const data = await res.json();
      setActiveProject(data.project);
      setProjects((prev) =>
        prev.map((p) => (p.id === data.project.id ? data.project : p)),
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteProject(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm("Vill du ta bort detta innehållsprojekt?")) return;

    try {
      const res = await fetch(`/api/project100/content/projects/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (activeProject?.id === id) {
          const next = projects.find((p) => p.id !== id) ?? null;
          setActiveProject(next);
          if (next) {
            router.push(`/projekt-100/innehall?id=${next.id}`);
          } else {
            router.push("/projekt-100/innehall");
          }
        }
      }
    } catch {
      setError("Kunde inte ta bort projektet.");
    }
  }

  async function handleAttachMedia(mediaItem: Project100MediaItem) {
    if (!activeProject) return;
    try {
      const res = await fetch(
        `/api/project100/content/projects/${activeProject.id}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediaId: mediaItem.id,
            caption: mediaItem.caption,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setMedia((prev) => [...prev, data.media]);
        setShowMediaPicker(false);
      }
    } catch {
      setError("Kunde inte koppla mediet.");
    }
  }

  async function handleDetachMedia(mediaId: string) {
    if (!activeProject) return;
    try {
      const res = await fetch(
        `/api/project100/content/projects/${activeProject.id}/media/${mediaId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setMedia((prev) => prev.filter((m) => m.mediaId !== mediaId));
      }
    } catch {
      setError("Kunde inte koppla loss mediet.");
    }
  }

  async function handleFetchSuggestions() {
    setLoadingSuggestion(true);
    try {
      const res = await fetch("/api/project100/content/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestion(data.suggestions);
      }
    } catch {
      setError("Kunde inte hämta förslag.");
    } finally {
      setLoadingSuggestion(false);
    }
  }

  function handleAddShot() {
    if (!newShotTitle.trim()) return;
    const item: Project100ShotlistItem = {
      id: `shot-${Date.now()}`,
      title: newShotTitle.trim(),
      completed: false,
      note: null,
    };
    setShotlist((prev) => [...prev, item]);
    setNewShotTitle("");
  }

  function handleToggleShot(id: string) {
    setShotlist((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)),
    );
  }

  function handleRemoveShot(id: string) {
    setShotlist((prev) => prev.filter((s) => s.id !== id));
  }

  function handleAddIdea() {
    if (!newIdeaTitle.trim()) return;
    const item: Project100ThumbnailIdea = {
      id: `idea-${Date.now()}`,
      title: newIdeaTitle.trim(),
      concept: null,
    };
    setThumbnailIdeas((prev) => [...prev, item]);
    setNewIdeaTitle("");
  }

  function handleRemoveIdea(id: string) {
    setThumbnailIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="p100-content-workspace">
      {/* 1. Left Column: Projects List & Filter */}
      <aside className="p100-content-sidebar">
        <header className="p100-sidebar-head">
          <div className="p100-content-brand">
            <Youtube />
            <strong>YouTube & Innehåll</strong>
          </div>
          <button
            type="button"
            className="p100-btn p100-btn-primary p100-new-content-btn"
            onClick={handleCreateProject}
          >
            <Plus /> Ny idé / video
          </button>
        </header>

        <div className="p100-content-filter-bar">
          <button
            type="button"
            className={statusFilter === "all" ? "active" : ""}
            onClick={() => setStatusFilter("all")}
          >
            Alla ({projects.length})
          </button>
          {PROJECT100_CONTENT_STATUSES.map((st) => {
            const count = projects.filter((p) => p.status === st).length;
            return (
              <button
                key={st}
                type="button"
                className={statusFilter === st ? "active" : ""}
                onClick={() => setStatusFilter(st)}
              >
                {CONTENT_STATUS_LABELS[st]} ({count})
              </button>
            );
          })}
        </div>

        <ul className="p100-project-list">
          {filteredProjects.length === 0 ? (
            <li className="p100-empty-copy">Inga projekt i detta läge.</li>
          ) : (
            filteredProjects.map((p) => (
              <li
                key={p.id}
                className={`p100-project-item ${
                  activeProject?.id === p.id ? "active" : ""
                }`}
                onClick={() => {
                  setActiveProject(p);
                  router.push(`/projekt-100/innehall?id=${p.id}`);
                }}
              >
                <div className="p100-proj-row">
                  <span className={`p100-status-dot ${p.status}`} />
                  <strong>{p.title}</strong>
                </div>
                <div className="p100-proj-meta">
                  <span className="p100-status-tag">
                    {CONTENT_STATUS_LABELS[p.status]}
                  </span>
                  {p.targetPublishDate ? (
                    <small>
                      <Calendar /> {p.targetPublishDate}
                    </small>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </aside>

      {/* 2. Main Column: Editor & Production Hub */}
      <main className="p100-content-main">
        {activeProject ? (
          <>
            <header className="p100-editor-header">
              <div className="p100-editor-title-row">
                <input
                  type="text"
                  className="p100-project-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Projekttitel (t.ex. 'Vlogg #12: Träning runt skiftarbete')"
                />
                <div className="p100-header-actions">
                  <button
                    type="button"
                    className="p100-btn p100-btn-primary"
                    onClick={handleSaveProject}
                    disabled={isSaving}
                  >
                    <Save /> {isSaving ? "Sparar..." : "Spara"}
                  </button>
                  <button
                    type="button"
                    className="p100-btn p100-btn-danger"
                    onClick={() => handleDeleteProject(activeProject.id)}
                    aria-label="Ta bort projekt"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>

              {/* Status Pipeline Steps */}
              <div className="p100-status-stepper">
                {PROJECT100_CONTENT_STATUSES.map((st, idx) => (
                  <button
                    key={st}
                    type="button"
                    className={`p100-step-btn ${status === st ? "active" : ""}`}
                    onClick={() => setStatus(st)}
                  >
                    <span className="p100-step-num">{idx + 1}</span>
                    <span>{CONTENT_STATUS_LABELS[st]}</span>
                  </button>
                ))}
              </div>

              {/* Publish Info Bar */}
              <div className="p100-publish-meta-bar">
                <div className="p100-meta-field">
                  <label htmlFor="proj-pub-date">
                    <Calendar /> Planerat datum
                  </label>
                  <input
                    id="proj-pub-date"
                    type="date"
                    value={targetPublishDate}
                    onChange={(e) => setTargetPublishDate(e.target.value)}
                  />
                </div>

                <div className="p100-meta-field link-field">
                  <label htmlFor="proj-url">
                    <LinkIcon /> Publicerad URL (YouTube)
                  </label>
                  <input
                    id="proj-url"
                    type="url"
                    value={publishedUrl}
                    onChange={(e) => setPublishedUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
              </div>
            </header>

            {error ? (
              <div className="p100-error-banner" role="alert">
                <AlertCircle /> <span>{error}</span>
              </div>
            ) : null}

            {saveSuccess ? (
              <div className="p100-success-banner">
                <CheckCircle2 /> <span>Ändringarna sparades.</span>
              </div>
            ) : null}

            <div className="p100-editor-body">
              {/* Hook & Concept */}
              <section className="p100-editor-section">
                <div className="p100-section-head">
                  <Lightbulb />
                  <div>
                    <strong>Krok (Hook) & Kärnidé</strong>
                    <p>Hur fångar du tittaren under de första 15 sekunderna?</p>
                  </div>
                  <button
                    type="button"
                    className="p100-btn p100-btn-sm"
                    onClick={handleFetchSuggestions}
                    disabled={loadingSuggestion}
                  >
                    <Sparkles /> {loadingSuggestion ? "Analyserar..." : "Jarvis redaktörshjälp"}
                  </button>
                </div>

                {suggestion ? (
                  <div className="p100-suggestion-box">
                    <header>
                      <Sparkles />
                      <strong>Redaktörsförslag från veckans historik:</strong>
                      <button type="button" onClick={() => setSuggestion(null)}>
                        <X />
                      </button>
                    </header>
                    <div className="p100-sugg-content">
                      <p><b>Föreslagen Hook:</b> {suggestion.hook}</p>
                      <button
                        type="button"
                        className="p100-btn p100-btn-sm"
                        onClick={() => setHook(suggestion.hook)}
                      >
                        Använd denna hook
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="p100-fields-grid">
                  <div className="p100-field">
                    <label htmlFor="proj-hook">Hook (Första 15s)</label>
                    <textarea
                      id="proj-hook"
                      value={hook}
                      onChange={(e) => setHook(e.target.value)}
                      placeholder="t.ex. 'Tre nattpass och 85 kg på vågen – så här fick jag veckan att gå ihop...'"
                      rows={2}
                    />
                  </div>
                  <div className="p100-field">
                    <label htmlFor="proj-concept">Kärnidé & Syfte</label>
                    <textarea
                      id="proj-concept"
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      placeholder="t.ex. 'Visa praktisk matlådelagring och motivation under trötta dagar.'"
                      rows={2}
                    />
                  </div>
                </div>
              </section>

              {/* Script / Talking Points */}
              <section className="p100-editor-section">
                <div className="p100-section-head">
                  <Film />
                  <div>
                    <strong>Manus & Talepunkter</strong>
                    <p>Skriv ner strukturen, tankarna och sammanhanget för videon.</p>
                  </div>
                </div>
                <textarea
                  className="p100-script-textarea"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="1. Intro & nuläge&#10;2. Veckans tyngsta pass&#10;3. Matlådestrategin&#10;4. Slutsatser och nästa vecka..."
                  rows={8}
                />
              </section>

              {/* Shotlist / Checklist */}
              <section className="p100-editor-section">
                <div className="p100-section-head">
                  <ListTodo />
                  <div>
                    <strong>Inspelningslista (Shotlist)</strong>
                    <p>Scener, B-roll och klipp som ska spelas in.</p>
                  </div>
                </div>

                <div className="p100-add-shot-bar">
                  <input
                    type="text"
                    value={newShotTitle}
                    onChange={(e) => setNewShotTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddShot()}
                    placeholder="Ny scen (t.ex. 'B-roll på matlådor i kylen')..."
                  />
                  <button
                    type="button"
                    className="p100-btn p100-btn-sm"
                    onClick={handleAddShot}
                    disabled={!newShotTitle.trim()}
                  >
                    <Plus /> Lägg till
                  </button>
                </div>

                <ul className="p100-shot-list">
                  {shotlist.length === 0 ? (
                    <li className="p100-empty-copy">Inga scener inlagda än.</li>
                  ) : (
                    shotlist.map((shot) => (
                      <li
                        key={shot.id}
                        className={`p100-shot-item ${shot.completed ? "done" : ""}`}
                      >
                        <button
                          type="button"
                          className="p100-shot-checkbox"
                          onClick={() => handleToggleShot(shot.id)}
                        >
                          {shot.completed ? <CheckCircle2 /> : <Circle />}
                        </button>
                        <span className="p100-shot-title">{shot.title}</span>
                        <button
                          type="button"
                          className="p100-shot-del-btn"
                          aria-label="Ta bort scen"
                          onClick={() => handleRemoveShot(shot.id)}
                        >
                          <Trash2 />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              {/* Title & Thumbnail Ideas */}
              <section className="p100-editor-section">
                <div className="p100-section-head">
                  <Tag />
                  <div>
                    <strong>Titel- & Tumnagelsidéer</strong>
                    <p>Alternativa rubriker och koncept för thumbnail.</p>
                  </div>
                </div>

                <div className="p100-add-shot-bar">
                  <input
                    type="text"
                    value={newIdeaTitle}
                    onChange={(e) => setNewIdeaTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddIdea()}
                    placeholder="Idé (t.ex. 'Hur jag tränar runt nattjobb')..."
                  />
                  <button
                    type="button"
                    className="p100-btn p100-btn-sm"
                    onClick={handleAddIdea}
                    disabled={!newIdeaTitle.trim()}
                  >
                    <Plus /> Lägg till
                  </button>
                </div>

                <ul className="p100-idea-tags">
                  {thumbnailIdeas.map((idea) => (
                    <li key={idea.id} className="p100-idea-tag">
                      <span>{idea.title}</span>
                      <button
                        type="button"
                        aria-label="Ta bort idé"
                        onClick={() => handleRemoveIdea(idea.id)}
                      >
                        <X />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Attached Media from Timeline */}
              <section className="p100-editor-section">
                <div className="p100-section-head">
                  <ImageIcon />
                  <div>
                    <strong>Kopplat material från privata tidslinjen</strong>
                    <p>
                      Endast aktivt valda bilder och klipp kopplas till projektet.
                      Ingen automatisk publicering.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="p100-btn p100-btn-sm"
                    onClick={() => setShowMediaPicker(true)}
                  >
                    <Plus /> Välj ur biblioteket
                  </button>
                </div>

                <div className="p100-attached-media-grid">
                  {media.length === 0 ? (
                    <p className="p100-empty-copy">
                      Inget material kopplat än. Välj relevanta foton från din
                      privata tidslinje.
                    </p>
                  ) : (
                    media.map((item) => (
                      <div key={item.mediaId} className="p100-attached-media-card">
                        <div className="p100-media-thumb">
                          {item.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.previewUrl} alt="" />
                          ) : (
                            <ImageIcon />
                          )}
                        </div>
                        <div className="p100-media-card-meta">
                          <small>{item.capturedOn} · {item.category}</small>
                          {item.caption ? <p>{item.caption}</p> : null}
                          <button
                            type="button"
                            className="p100-btn p100-btn-sm p100-btn-danger"
                            onClick={() => handleDetachMedia(item.mediaId)}
                          >
                            Koppla loss
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="p100-content-empty-state">
            <Youtube />
            <h3>Inget projekt valt</h3>
            <p>
              Välj ett befintligt projekt i listan till vänster eller skapa en ny
              idé för att börja skriva manus och koppla material.
            </p>
            <button
              type="button"
              className="p100-btn p100-btn-primary"
              onClick={handleCreateProject}
            >
              <Plus /> Skapa första projektet
            </button>
          </div>
        )}
      </main>

      {/* Media Picker Modal */}
      {showMediaPicker ? (
        <div
          className="p100-training-modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowMediaPicker(false)}
        >
          <div
            className="p100-training-modal p100-media-picker-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="p100-composer-head">
              <div>
                <span>Privat bibliotek</span>
                <h2>Välj material att koppla</h2>
                <p>Bilder du väljer här blir kopplade som referens till detta projekt.</p>
              </div>
              <button
                type="button"
                aria-label="Stäng"
                onClick={() => setShowMediaPicker(false)}
              >
                <X />
              </button>
            </header>

            <div className="p100-picker-scroll">
              <div className="p100-picker-grid">
                {availableMedia.length === 0 ? (
                  <p className="p100-empty-copy">Inga bilder i mediebiblioteket.</p>
                ) : (
                  availableMedia.map((m) => {
                    const isAlreadyAttached = media.some((att) => att.mediaId === m.id);
                    return (
                      <div
                        key={m.id}
                        className={`p100-picker-card ${
                          isAlreadyAttached ? "attached" : ""
                        }`}
                        onClick={() => !isAlreadyAttached && handleAttachMedia(m)}
                      >
                        <div className="p100-picker-img">
                          {m.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.previewUrl} alt="" loading="lazy" />
                          ) : (
                            <ImageIcon />
                          )}
                        </div>
                        <div className="p100-picker-meta">
                          <span>{m.capturedOn}</span>
                          <small>{m.category}</small>
                        </div>
                        {isAlreadyAttached ? (
                          <span className="p100-attached-tag">Kopplad</span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
