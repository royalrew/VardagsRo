"use client";

import {
  Camera,
  Eye,
  EyeOff,
  ImageIcon,
  Images,
  Link2,
  Loader2,
  Lock,
  Rows3,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  formatMediaSize,
  PROJECT100_MEDIA_CATEGORY_LABELS,
  PROJECT100_MEDIA_CATEGORY_ORDER,
  PROJECT100_SENSITIVE_MEDIA_CATEGORIES,
  type Project100MediaCategory,
  type Project100MediaItem,
  type Project100MediaLibrary,
} from "@/lib/project100-media";

interface SessionOption {
  id: string;
  title: string;
  sessionDate: string;
}

interface PendingUpload {
  file: File;
  localUrl: string;
  preview: Blob | null;
  width: number | null;
  height: number | null;
}

const PREVIEW_EDGE = 640;
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(calendarDate: string): string {
  return dateFormatter.format(new Date(`${calendarDate}T12:00:00`));
}

function isSensitive(category: Project100MediaCategory): boolean {
  return PROJECT100_SENSITIVE_MEDIA_CATEGORIES.includes(category);
}

/**
 * The small copy the gallery loads is made here, in the browser, before the
 * picture leaves the device. A failed preview is not an error: the original is
 * still stored and the tile simply falls back to its own metadata.
 */
async function buildPreview(
  file: File,
): Promise<{ preview: Blob | null; width: number | null; height: number | null }> {
  if (typeof createImageBitmap !== "function") {
    return { preview: null, width: null, height: null };
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.min(1, PREVIEW_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { preview: null, width, height };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.72),
    );
    return { preview, width, height };
  } catch {
    return { preview: null, width: null, height: null };
  } finally {
    bitmap?.close();
  }
}

async function failureFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

function MediaTile({
  item,
  revealed,
  onOpen,
}: {
  item: Project100MediaItem;
  revealed: boolean;
  onOpen: () => void;
}) {
  const hidden = isSensitive(item.category) && !revealed;
  return (
    <button type="button" className="p100-media-tile" onClick={onOpen}>
      <span className={`p100-media-frame${hidden ? " hidden" : ""}`}>
        {item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt={item.caption ?? "Privat bild"} loading="lazy" />
        ) : (
          <ImageIcon />
        )}
        {hidden ? (
          <span className="p100-media-locked">
            <Lock /> Dold
          </span>
        ) : null}
      </span>
      <span className="p100-media-tile-meta">
        <small>{PROJECT100_MEDIA_CATEGORY_LABELS[item.category]}</small>
        <b>{formatDate(item.capturedOn)}</b>
        {item.caption ? <i>{item.caption}</i> : null}
      </span>
    </button>
  );
}

function Composer({
  pending,
  category,
  sessions,
  busy,
  error,
  today,
  onClose,
  onSubmit,
}: {
  pending: PendingUpload;
  category: Project100MediaCategory;
  sessions: SessionOption[];
  busy: boolean;
  error: string | null;
  today: string;
  onClose: () => void;
  onSubmit: (form: {
    category: Project100MediaCategory;
    capturedOn: string;
    caption: string;
    sessionId: string;
  }) => void;
}) {
  const [draft, setDraft] = useState({
    category,
    capturedOn: today,
    caption: "",
    sessionId: "",
  });

  return (
    <div className="p100-media-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="p100-media-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-composer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="p100-composer-head">
          <div>
            <span>Privat bild</span>
            <h2 id="media-composer-title">Spara i ditt bibliotek</h2>
            <p>Bilden lagras privat och kan bara öppnas via en kortlivad länk.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng">
            <X />
          </button>
        </header>
        <div className="p100-media-composer-body">
          <figure className={`p100-media-composer-preview${isSensitive(draft.category) ? " sensitive" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.localUrl} alt="Bilden du valde" />
            <figcaption>
              {pending.width && pending.height
                ? `${pending.width} × ${pending.height} px · `
                : ""}
              {formatMediaSize(pending.file.size)}
              {pending.preview ? " · förhandsbild skapad" : " · ingen förhandsbild"}
            </figcaption>
          </figure>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(draft);
            }}
          >
            <div className="p100-media-category-choice">
              {PROJECT100_MEDIA_CATEGORY_ORDER.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={draft.category === value ? "active" : ""}
                  onClick={() => setDraft({ ...draft, category: value })}
                >
                  {PROJECT100_MEDIA_CATEGORY_LABELS[value]}
                </button>
              ))}
            </div>
            <label>
              <span>Datum</span>
              <input
                required
                type="date"
                value={draft.capturedOn}
                onChange={(event) => setDraft({ ...draft, capturedOn: event.target.value })}
              />
            </label>
            <label>
              <span>Kommentar</span>
              <input
                maxLength={500}
                value={draft.caption}
                placeholder="Valfritt — ljus, vinkel, känsla eller vad du åt"
                onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
              />
            </label>
            <label>
              <span>Koppla till pass</span>
              <select
                value={draft.sessionId}
                onChange={(event) => setDraft({ ...draft, sessionId: event.target.value })}
              >
                <option value="">Ingen koppling</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.sessionDate} · {session.title}
                  </option>
                ))}
              </select>
            </label>
            {isSensitive(draft.category) ? (
              <p className="p100-media-privacy-note">
                <Lock /> Kroppsbilder visas dolda i galleriet tills du själv väljer att
                visa dem.
              </p>
            ) : null}
            {error ? (
              <p className="p100-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <footer className="p100-composer-actions">
              <button type="button" onClick={onClose}>
                Avbryt
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Sparar…" : "Spara privat"}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}

function Viewer({
  item,
  onClose,
  onDelete,
}: {
  item: Project100MediaItem;
  onClose: () => void;
  onDelete: (item: Project100MediaItem) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/project100/media/${encodeURIComponent(item.id)}/url`)
      .then(async (response) => {
        if (!response.ok) throw await failureFrom(response, "Bilden kunde inte öppnas.");
        return (await response.json()) as { url: string };
      })
      .then((body) => {
        if (active) setUrl(body.url);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Något gick fel.");
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="p100-media-viewer" role="dialog" aria-modal="true" aria-label="Bild i fullskärm">
      <header>
        <div>
          <small>{PROJECT100_MEDIA_CATEGORY_LABELS[item.category]}</small>
          <strong>{formatDate(item.capturedOn)}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Stäng">
          <X />
        </button>
      </header>
      <div className="p100-media-viewer-stage">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.caption ?? "Privat bild i fullskärm"} />
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <span className="p100-media-spinner">
            <Loader2 />
          </span>
        )}
      </div>
      <footer>
        <dl>
          {item.caption ? (
            <div>
              <dt>Kommentar</dt>
              <dd>{item.caption}</dd>
            </div>
          ) : null}
          {item.sessionTitle ? (
            <div>
              <dt>Kopplat pass</dt>
              <dd>
                <Link2 /> {item.sessionTitle}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Original</dt>
            <dd>
              {item.width && item.height ? `${item.width} × ${item.height} px · ` : ""}
              {formatMediaSize(item.originalBytes)}
            </dd>
          </div>
        </dl>
        <button type="button" onClick={() => onDelete(item)}>
          <Trash2 /> Radera helt
        </button>
      </footer>
    </div>
  );
}

export function MediaLibrary({
  library,
  sessions,
  today,
  activeCategory,
}: {
  library: Project100MediaLibrary;
  sessions: SessionOption[];
  today: string;
  activeCategory: Project100MediaCategory | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(library.items);
  const [loaded, setLoaded] = useState(library.items);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [viewing, setViewing] = useState<Project100MediaItem | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Signed preview addresses expire, so a fresh server render replaces the
  // optimistic list rather than being merged into it.
  if (loaded !== library.items) {
    setLoaded(library.items);
    setItems(library.items);
  }

  const clearPending = useCallback(() => {
    setPending((current) => {
      if (current) URL.revokeObjectURL(current.localUrl);
      return null;
    });
    setError(null);
  }, []);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    const { preview, width, height } = await buildPreview(file);
    setPending({ file, localUrl: URL.createObjectURL(file), preview, width, height });
  }

  async function upload(form: {
    category: Project100MediaCategory;
    capturedOn: string;
    caption: string;
    sessionId: string;
  }) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", pending.file);
      if (pending.preview) body.set("preview", pending.preview, "preview.jpg");
      body.set("category", form.category);
      body.set("capturedOn", form.capturedOn);
      if (form.caption.trim()) body.set("caption", form.caption.trim());
      if (form.sessionId) body.set("sessionId", form.sessionId);
      if (pending.width) body.set("width", String(pending.width));
      if (pending.height) body.set("height", String(pending.height));

      const response = await fetch("/api/project100/media", { method: "POST", body });
      if (!response.ok) throw await failureFrom(response, "Bilden kunde inte sparas.");
      const saved = (await response.json()) as { media: Project100MediaItem };
      setItems((current) => [saved.media, ...current]);
      clearPending();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Project100MediaItem) {
    if (
      !window.confirm(
        "Radera bilden helt? Både originalet och förhandsbilden tas bort och går inte att få tillbaka.",
      )
    ) {
      return;
    }
    const response = await fetch(`/api/project100/media/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Bilden kunde inte raderas.")).message);
      return;
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setViewing(null);
    router.refresh();
  }

  const total = Object.values(library.counts).reduce((sum, count) => sum + count, 0);
  const hasSensitive = items.some((item) => isSensitive(item.category));

  return (
    <div className="p100-media-workspace">
      <header className="p100-page-head">
        <div>
          <span>Minnas</span>
          <h1>Media</h1>
          <p>
            Ditt privata bibliotek för kropp, mat, träning och material som kan bli
            innehåll senare. Ingenting härifrån lämnar Projekt 100 utan att du väljer det.
          </p>
        </div>
        <div className="p100-head-actions">
          <button
            type="button"
            className="p100-button-secondary p100-media-camera"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera /> Kamera
          </button>
          <button type="button" className="p100-button" onClick={() => pickerRef.current?.click()}>
            <Upload /> Lägg till bild
          </button>
        </div>
      </header>

      <input
        ref={pickerRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {!library.storageConfigured ? (
        <p className="p100-media-warning" role="status">
          <ShieldAlert /> Bildlagringen är inte konfigurerad i den här miljön, så nya bilder
          kan inte sparas privat ännu.
        </p>
      ) : null}

      <div className="p100-media-toolbar">
        <nav aria-label="Kategori">
          <Link href="/projekt-100/media" className={activeCategory === null ? "active" : ""}>
            Alla <b>{total}</b>
          </Link>
          {PROJECT100_MEDIA_CATEGORY_ORDER.map((category) => (
            <Link
              key={category}
              href={`/projekt-100/media?kategori=${category}`}
              className={activeCategory === category ? "active" : ""}
            >
              {PROJECT100_MEDIA_CATEGORY_LABELS[category]} <b>{library.counts[category]}</b>
            </Link>
          ))}
        </nav>
        <div className="p100-media-view-tools">
          {hasSensitive ? (
            <button
              type="button"
              className={revealed ? "active" : ""}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? <EyeOff /> : <Eye />}
              {revealed ? "Dölj kroppsbilder" : "Visa kroppsbilder"}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={view === "grid" ? "Visa som lista" : "Visa som galleri"}
            onClick={() => setView((current) => (current === "grid" ? "list" : "grid"))}
          >
            {view === "grid" ? <Rows3 /> : <Images />}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p100-media-empty">
          <ImageIcon />
          <strong>
            {total === 0 ? "Biblioteket är tomt" : "Inga bilder i den här kategorin"}
          </strong>
          <p>
            Ta en bild med kameran eller välj en från datorn. Den sparas privat med datum,
            kategori och en valfri kommentar.
          </p>
          <button type="button" onClick={() => pickerRef.current?.click()}>
            <Upload /> Lägg till din första bild
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="p100-media-grid">
          {items.map((item) => (
            <MediaTile
              key={item.id}
              item={item}
              revealed={revealed}
              onOpen={() => setViewing(item)}
            />
          ))}
        </div>
      ) : (
        <div className="p100-media-list">
          {items.map((item) => (
            <article key={item.id}>
              <button type="button" onClick={() => setViewing(item)}>
                <span
                  className={`p100-media-thumb${
                    isSensitive(item.category) && !revealed ? " hidden" : ""
                  }`}
                >
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" loading="lazy" />
                  ) : (
                    <ImageIcon />
                  )}
                </span>
                <span className="p100-media-list-text">
                  <small>
                    {formatDate(item.capturedOn)} ·{" "}
                    {PROJECT100_MEDIA_CATEGORY_LABELS[item.category]}
                  </small>
                  <strong>{item.caption ?? "Utan kommentar"}</strong>
                  {item.sessionTitle ? (
                    <i>
                      <Link2 /> {item.sessionTitle}
                    </i>
                  ) : null}
                </span>
                <span className="p100-media-list-size">{formatMediaSize(item.originalBytes)}</span>
              </button>
              <button
                type="button"
                className="p100-icon-button"
                aria-label="Radera bilden"
                onClick={() => void remove(item)}
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      )}

      {pending ? (
        <Composer
          pending={pending}
          category={activeCategory ?? "body"}
          sessions={sessions}
          busy={busy}
          error={error}
          today={today}
          onClose={() => {
            if (!busy) clearPending();
          }}
          onSubmit={(form) => void upload(form)}
        />
      ) : null}

      {viewing ? (
        <Viewer
          key={viewing.id}
          item={viewing}
          onClose={() => setViewing(null)}
          onDelete={(item) => void remove(item)}
        />
      ) : null}
    </div>
  );
}
