"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  ListChecks,
  MapPin,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { capitalize, formatLongDate, formatTimeRange } from "@/lib/dates";
import type { FamilyDocument, FamilyEvent, FamilyPerson } from "@/lib/types";
import { Avatar, categoryMeta } from "@/components/ui";

function ModalFrame({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label={label}>
        <button className="icon-button modal-close floating-close" onClick={onClose} aria-label="Stäng">
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}

export function EventDetailModal({
  event,
  person,
  document,
  onClose,
  onOpenDocument,
}: {
  event: FamilyEvent | null;
  person: FamilyPerson | null;
  document: FamilyDocument | null;
  onClose: () => void;
  onOpenDocument: (document: FamilyDocument) => void;
}) {
  if (!event || !person) return null;
  const meta = categoryMeta[event.category];
  const Icon = meta.icon;
  return (
    <ModalFrame onClose={onClose} label={event.title}>
      <div className="detail-hero">
        <span className={`detail-category-icon ${meta.className}`}>
          <Icon size={24} />
        </span>
        <span className={`status-badge ${event.status === "confirmed" ? "status-confirmed" : "status-review"}`}>
          {event.status === "confirmed" ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
          {event.status === "confirmed" ? "Kontrollerad" : "Behöver kollas"}
        </span>
        <h2>{event.title}</h2>
        <p>
          {capitalize(formatLongDate(event.startsAt))} · {formatTimeRange(event.startsAt, event.endsAt, event.allDay)}
        </p>
      </div>
      <div className="detail-facts">
        <div>
          <Avatar person={person} />
          <span>
            <small>Gäller</small>
            <strong>{person.name} · {person.role}</strong>
          </span>
        </div>
        {event.location ? (
          <div>
            <span className="fact-icon"><MapPin size={18} /></span>
            <span>
              <small>Plats</small>
              <strong>{event.location}</strong>
            </span>
          </div>
        ) : null}
        <div>
          <span className="fact-icon"><ShieldCheck size={18} /></span>
          <span>
            <small>Tolkning</small>
            <strong>{Math.round(event.confidence * 100)} % säker</strong>
          </span>
        </div>
      </div>
      {event.sourceExcerpt ? (
        <blockquote className="source-excerpt">“{event.sourceExcerpt}”</blockquote>
      ) : null}
      {document ? (
        <button className="source-card" onClick={() => onOpenDocument(document)}>
          <FileText size={20} />
          <span>
            <small>Källa</small>
            <strong>{document.title}</strong>
          </span>
          <ExternalLink size={16} />
        </button>
      ) : (
        <div className="source-card source-manual">
          <CalendarDays size={20} />
          <span>
            <small>Källa</small>
            <strong>Manuellt tillagd</strong>
          </span>
        </div>
      )}
    </ModalFrame>
  );
}

export function DocumentDetailModal({
  document,
  person,
  events,
  onClose,
  onDelete,
}: {
  document: FamilyDocument | null;
  person: FamilyPerson | null;
  events: FamilyEvent[];
  onClose: () => void;
  onDelete: (document: FamilyDocument) => void;
}) {
  const [opening, setOpening] = useState(false);
  if (!document) return null;

  async function openOriginal() {
    setOpening(true);
    try {
      const response = await fetch(`/api/documents/${document!.id}/url`);
      const payload = (await response.json()) as { url?: string };
      if (response.ok && payload.url) window.open(payload.url, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  }

  return (
    <ModalFrame onClose={onClose} label={document.title}>
      <div className="detail-hero document-detail-hero">
        <span className="detail-category-icon category-school"><FileText size={24} /></span>
        <span className={`status-badge ${document.status === "confirmed" ? "status-confirmed" : "status-review"}`}>
          {document.status === "confirmed" ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
          {document.status === "confirmed" ? "Kontrollerat" : "Behöver kollas"}
        </span>
        <h2>{document.title}</h2>
        <p>{document.summary}</p>
      </div>
      <div className="document-detail-meta">
        {person ? (
          <span><Avatar person={person} size="small" /> {person.name}</span>
        ) : null}
        <span>{document.documentType}</span>
        <span>{document.periodLabel}</span>
        <span>
          <ListChecks size={13} /> {document.tasksCount} {document.tasksCount === 1 ? "uppgift" : "uppgifter"}
        </span>
      </div>
      <div className="found-events">
        <h3>Hittade tider <span>{events.length}</span></h3>
        {events.map((event) => (
          <div key={event.id}>
            <span className="event-date-tile">
              <b>{new Date(event.startsAt).getDate()}</b>
              {new Intl.DateTimeFormat("sv-SE", { month: "short" }).format(new Date(event.startsAt))}
            </span>
            <span>
              <strong>{event.title}</strong>
              <small>{formatTimeRange(event.startsAt, event.endsAt, event.allDay)}{event.location ? ` · ${event.location}` : ""}</small>
            </span>
          </div>
        ))}
      </div>
      <footer className="detail-actions">
        <button className="button button-danger-soft" onClick={() => onDelete(document)}>
          <Trash2 size={16} /> Radera
        </button>
        {document.storageKey ? (
          <button className="button button-primary" onClick={() => void openOriginal()} disabled={opening}>
            <ExternalLink size={16} /> {opening ? "Öppnar…" : "Visa originalet"}
          </button>
        ) : (
          <span className="demo-source-note">Original saknas för demodata</span>
        )}
      </footer>
    </ModalFrame>
  );
}
