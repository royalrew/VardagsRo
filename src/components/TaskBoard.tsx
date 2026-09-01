"use client";

import {
  Backpack,
  BookOpenCheck,
  Check,
  Circle,
  ClipboardPenLine,
  FileText,
  FlaskConical,
  ListChecks,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui";
import type {
  FamilyDocument,
  FamilyPerson,
  FamilyTask,
  TaskKind,
} from "@/lib/types";

type TaskFilter = "open" | "completed";
type ScopeFilter = "all" | "mine";

const taskKindMeta: Record<
  TaskKind,
  { label: string; className: string; icon: typeof BookOpenCheck }
> = {
  homework: { label: "Läxa", className: "task-kind-homework", icon: BookOpenCheck },
  exam: { label: "Prov", className: "task-kind-exam", icon: FlaskConical },
  bring: { label: "Ta med", className: "task-kind-bring", icon: Backpack },
  form: { label: "Blankett", className: "task-kind-form", icon: ClipboardPenLine },
  preparation: { label: "Förbered", className: "task-kind-preparation", icon: ListChecks },
  other: { label: "Uppgift", className: "task-kind-other", icon: Sparkles },
};

export function TaskBoard({
  tasks,
  people,
  documents,
  currentPerson,
  onToggle,
  onOpenDocument,
}: {
  tasks: FamilyTask[];
  people: FamilyPerson[];
  documents: FamilyDocument[];
  currentPerson?: FamilyPerson;
  onToggle: (task: FamilyTask, completed: boolean) => Promise<boolean>;
  onOpenDocument: (documentId: string) => void;
}) {
  const isChild = currentPerson?.personType === "child";
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [scope, setScope] = useState<ScopeFilter>(isChild ? "mine" : "all");
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const scopedTasks = useMemo(() => {
    if (scope === "mine" && currentPerson) {
      return tasks.filter(
        (t) => t.personId === currentPerson.id || t.personId === null,
      );
    }
    return tasks;
  }, [tasks, scope, currentPerson]);

  const openCount = scopedTasks.filter((task) => !task.completedAt).length;
  const completedCount = scopedTasks.length - openCount;
  const visibleTasks = useMemo(
    () =>
      scopedTasks
        .filter((task) => (filter === "open" ? !task.completedAt : Boolean(task.completedAt)))
        .sort(compareTasks),
    [filter, scopedTasks],
  );

  async function toggleTask(task: FamilyTask) {
    if (pendingTaskId) return;
    setPendingTaskId(task.id);
    try {
      await onToggle(task, !task.completedAt);
    } finally {
      setPendingTaskId(null);
    }
  }

  return (
    <section className="card task-board" aria-labelledby="task-board-heading">
      <header className="task-board-header">
        <div className="task-board-title">
          <span className="task-board-icon" aria-hidden="true">
            <ListChecks size={21} />
          </span>
          <div>
            <span className="section-kicker">Att göra</span>
            <h2 id="task-board-heading">
              {openCount
                ? `${openCount} ${openCount === 1 ? "sak" : "saker"} kvar`
                : "Allt är klart"}
            </h2>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {isChild && (
            <div className="task-filter" role="tablist" aria-label="Filtrera person">
              <button
                type="button"
                role="tab"
                aria-selected={scope === "mine"}
                className={scope === "mine" ? "active" : ""}
                onClick={() => setScope("mine")}
              >
                Mina
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scope === "all"}
                className={scope === "all" ? "active" : ""}
                onClick={() => setScope("all")}
              >
                Alla
              </button>
            </div>
          )}

          <div className="task-filter" role="tablist" aria-label="Visa uppgifter">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "open"}
              className={filter === "open" ? "active" : ""}
              onClick={() => setFilter("open")}
            >
              Kvar <span>{openCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "completed"}
              className={filter === "completed" ? "active" : ""}
              onClick={() => setFilter("completed")}
            >
              Klart <span>{completedCount}</span>
            </button>
          </div>
        </div>
      </header>

      {visibleTasks.length ? (
        <div className="task-list">
          {visibleTasks.map((task) => {
            const person = people.find((item) => item.id === task.personId) ?? null;
            const source = task.documentId
              ? documents.find((document) => document.id === task.documentId) ?? null
              : null;
            const kind = taskKindMeta[task.kind];
            const KindIcon = kind.icon;
            const due = describeDeadline(task);
            const isPending = pendingTaskId === task.id;

            return (
              <article
                className={`task-row${task.completedAt ? " task-row-completed" : ""}`}
                key={task.id}
              >
                <button
                  type="button"
                  className="task-toggle"
                  onClick={() => void toggleTask(task)}
                  disabled={Boolean(pendingTaskId)}
                  aria-label={
                    task.completedAt
                      ? `Markera ${task.title} som öppen igen`
                      : `Markera ${task.title} som klar`
                  }
                  aria-pressed={Boolean(task.completedAt)}
                >
                  {isPending ? (
                    <LoaderCircle className="task-toggle-spinner" size={17} />
                  ) : task.completedAt ? (
                    <Check size={17} />
                  ) : (
                    <Circle size={17} />
                  )}
                </button>

                <span className={`task-kind-icon ${kind.className}`} aria-hidden="true">
                  <KindIcon size={18} />
                </span>

                <div className="task-copy">
                  <div className="task-title-line">
                    <strong>{task.title}</strong>
                    <span className={`task-kind-label ${kind.className}`}>{kind.label}</span>
                    {task.reviewStatus === "needs_review" ? (
                      <span className="task-review-label">Kontrollera</span>
                    ) : null}
                  </div>
                  {task.notes ? <p>{task.notes}</p> : null}
                  <div className="task-meta">
                    <span className={due.overdue ? "task-deadline task-deadline-overdue" : "task-deadline"}>
                      {due.label}
                    </span>
                    {person ? (
                      <span className="task-person">
                        <Avatar person={person} size="small" />
                        {person.name}
                      </span>
                    ) : null}
                    {source ? (
                      <button
                        type="button"
                        className="task-source"
                        onClick={() => onOpenDocument(source.id)}
                        title={task.sourceExcerpt ?? `Öppna ${source.title}`}
                      >
                        <FileText size={13} />
                        {source.title}
                      </button>
                    ) : (
                      <span className="task-source task-source-manual">
                        <FileText size={13} />
                        {task.documentId ? "Källdokument saknas" : "Manuellt tillagd"}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="task-empty">
          <span aria-hidden="true">{filter === "open" ? <Check size={22} /> : <ListChecks size={22} />}</span>
          <div>
            <strong>{filter === "open" ? "Inget kvar att göra" : "Inget avklarat ännu"}</strong>
            <p>
              {filter === "open"
                ? "När ett dokument innehåller en läxa, blankett eller sak att ta med syns den här."
                : "Uppgifter du markerar som klara samlas här och kan öppnas igen."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function compareTasks(a: FamilyTask, b: FamilyTask): number {
  if (a.completedAt && b.completedAt) {
    return +new Date(b.completedAt) - +new Date(a.completedAt);
  }
  if (!a.dueAt && !b.dueAt) return a.title.localeCompare(b.title, "sv");
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  return +new Date(a.dueAt) - +new Date(b.dueAt);
}

function describeDeadline(task: FamilyTask): { label: string; overdue: boolean } {
  if (!task.dueAt) return { label: "Ingen deadline", overdue: false };
  const dueAt = new Date(task.dueAt);
  if (Number.isNaN(dueAt.getTime())) return { label: "Deadline behöver kollas", overdue: false };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  const dayDifference = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  const overdue = !task.completedAt && dueAt.getTime() < now.getTime();
  const dateLabel =
    dayDifference === 0
      ? "Idag"
      : dayDifference === 1
        ? "Imorgon"
        : new Intl.DateTimeFormat("sv-SE", {
            weekday: "short",
            day: "numeric",
            month: "short",
          }).format(dueAt);

  return {
    label: `${overdue ? "Försenad" : task.completedAt ? "Deadline" : "Senast"} · ${dateLabel}`,
    overdue,
  };
}
