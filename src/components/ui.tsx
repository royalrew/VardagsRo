import {
  BriefcaseBusiness,
  CalendarDays,
  Cross,
  GraduationCap,
  Heart,
  MapPin,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EventCategory, FamilyEvent, FamilyPerson } from "@/lib/types";
import { formatTimeRange } from "@/lib/dates";

type IconType = LucideIcon;

export const categoryMeta: Record<
  EventCategory,
  { label: string; icon: IconType; className: string }
> = {
  work: { label: "Jobb", icon: BriefcaseBusiness, className: "category-work" },
  school: { label: "Skola", icon: GraduationCap, className: "category-school" },
  sport: { label: "Fritid", icon: Trophy, className: "category-sport" },
  health: { label: "Hälsa", icon: Cross, className: "category-health" },
  family: { label: "Familj", icon: Heart, className: "category-family" },
  other: { label: "Övrigt", icon: Sparkles, className: "category-other" },
};

export function Avatar({
  person,
  size = "medium",
  showStatus = false,
}: {
  person: FamilyPerson;
  size?: "small" | "medium" | "large";
  showStatus?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: person.tint, color: person.color }}
      aria-label={`${person.name}, ${person.role}`}
      title={`${person.name} · ${person.role}`}
    >
      {person.initials}
      {showStatus ? <i className="avatar-status" aria-hidden="true" /> : null}
    </span>
  );
}

export function EventRow({
  event,
  person,
  compact = false,
  onClick,
}: {
  event: FamilyEvent;
  person: FamilyPerson;
  compact?: boolean;
  onClick?: () => void;
}) {
  const meta = categoryMeta[event.category];
  const Icon = meta.icon;
  const content = (
    <>
      <span className={`event-icon ${meta.className}`} aria-hidden="true">
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="event-row-copy">
        <strong>{event.title}</strong>
        <span>
          {formatTimeRange(event.startsAt, event.endsAt, event.allDay)}
          {event.location ? (
            <>
              <span aria-hidden="true"> · </span>
              {event.location}
            </>
          ) : null}
        </span>
      </span>
      <Avatar person={person} size="small" />
      {event.status === "needs_review" ? (
        <span className="review-dot" title="Behöver kollas" aria-label="Behöver kollas" />
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button className={`event-row ${compact ? "event-row-compact" : ""}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={`event-row ${compact ? "event-row-compact" : ""}`}>{content}</div>;
}

export function LocationLine({ value }: { value: string }) {
  return (
    <span className="location-line">
      <MapPin size={14} aria-hidden="true" /> {value}
    </span>
  );
}

export function EmptyState({
  icon: Icon = CalendarDays,
  title,
  text,
  action,
}: {
  icon?: IconType;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon size={24} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}
