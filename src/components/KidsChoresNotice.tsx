"use client";

import { Check, Circle, LoaderCircle, Plus, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui";
import {
  getCleaningAreaForPerson,
  getKidsChoresOverview,
} from "@/lib/kids-chores";
import type { FamilyPerson, FamilyTask } from "@/lib/types";

export function KidsChoresNotice({
  currentPerson,
  people,
  tasks,
  onToggleTask,
  onOpenAddChore,
  referenceDate,
  timeZone,
}: {
  currentPerson: FamilyPerson | null;
  people: FamilyPerson[];
  tasks: FamilyTask[];
  onToggleTask: (task: FamilyTask, completed: boolean) => Promise<boolean>;
  onOpenAddChore: () => void;
  referenceDate: Date;
  timeZone: string;
}) {
  const isChild = currentPerson?.personType === "child";
  const childCleaningArea = useMemo(
    () => (currentPerson ? getCleaningAreaForPerson(currentPerson) : null),
    [currentPerson],
  );

  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const overview = useMemo(
    () => getKidsChoresOverview(people, tasks, referenceDate, timeZone),
    [people, tasks, referenceDate, timeZone],
  );

  const myChores = useMemo(() => {
    if (!currentPerson) return [];
    return overview.find((summary) => summary.person.id === currentPerson.id)?.tasks ?? [];
  }, [currentPerson, overview]);

  const openMyChores = myChores.filter((t) => !t.completedAt);
  async function handleToggle(task: FamilyTask) {
    if (pendingTaskId) return;
    setPendingTaskId(task.id);
    try {
      await onToggleTask(task, !task.completedAt);
    } finally {
      setPendingTaskId(null);
    }
  }

  // Child view: Personalized banner for their cleaning area
  if (isChild && childCleaningArea) {
    const isAllDone = myChores.length > 0 && openMyChores.length === 0;

    return (
      <section
        className={`kids-chores-notice kids-chores-child-notice ${
          isAllDone ? "kids-chores-done" : ""
        }`}
        aria-label="Ditt städområde"
      >
        <div className="kids-notice-header">
          <div className="kids-notice-badge">
            <span className="kids-notice-icon">{childCleaningArea.icon}</span>
            <div>
              <span className="section-kicker">Ditt städområde</span>
              <h3>{childCleaningArea.area}</h3>
            </div>
          </div>
          <div className="kids-notice-status">
            {myChores.length === 0 ? (
              <span className="kids-pill kids-pill-neutral">Inga uppgifter just nu</span>
            ) : isAllDone ? (
              <span className="kids-pill kids-pill-success">
                <Trophy size={14} /> Allt klart! Bra jobbat!
              </span>
            ) : (
              <span className="kids-pill kids-pill-progress">
                {openMyChores.length} {openMyChores.length === 1 ? "uppgift kvar" : "uppgifter kvar"}
              </span>
            )}
          </div>
        </div>

        {openMyChores.length > 0 ? (
          <div className="kids-notice-task-list">
            {openMyChores.map((task) => {
              const isPending = pendingTaskId === task.id;
              return (
                <div key={task.id} className="kids-notice-task-item">
                  <button
                    type="button"
                    className="kids-task-checkbox"
                    onClick={() => void handleToggle(task)}
                    disabled={Boolean(pendingTaskId)}
                    aria-label={`Markera "${task.title}" som klar`}
                  >
                    {isPending ? (
                      <LoaderCircle className="kids-spinner" size={20} />
                    ) : (
                      <Circle size={20} />
                    )}
                  </button>
                  <div className="kids-task-text">
                    <strong>{task.title}</strong>
                    {task.notes ? <small>{task.notes}</small> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : isAllDone ? (
          <p className="kids-notice-congrats">
            ⭐ Fantastiskt! Du har klarat alla dina uppgifter i {childCleaningArea.area.toLowerCase()}!
          </p>
        ) : (
          <p className="kids-notice-empty">
            {childCleaningArea.description}
          </p>
        )}
      </section>
    );
  }

  // Parent / Adult view: Chores Overview for Alma, Shureym and Cuzeyr
  return (
    <section className="kids-chores-notice kids-chores-parent-notice" aria-label="Barnens städområden">
      <div className="kids-notice-header">
        <div className="kids-notice-badge">
          <span className="kids-notice-icon">✨</span>
          <div>
            <span className="section-kicker">Barnens Städområden</span>
            <h3>Städuppgifter & To-Do</h3>
          </div>
        </div>
        <button
          type="button"
          className="button button-soft button-small"
          onClick={onOpenAddChore}
        >
          <Plus size={15} /> Lägg till städuppgift
        </button>
      </div>

      <div className="kids-overview-grid">
        {overview.map((summary) => {
          const area = summary.cleaningArea;
          const openCount = summary.openCount;
          const hasTasks = summary.tasks.length > 0;
          const isDone = summary.allDone;

          return (
            <div
              key={summary.person.id}
              className={`kids-overview-card ${isDone ? "card-done" : ""}`}
            >
              <div className="kids-overview-card-header">
                <Avatar person={summary.person} size="small" />
                <div>
                  <strong>{summary.person.name}</strong>
                  <span className="kids-area-tag">
                    {area ? `${area.icon} ${area.area}` : "Uppgifter"}
                  </span>
                </div>
              </div>

              <div className="kids-overview-card-body">
                {hasTasks ? (
                  isDone ? (
                    <span className="kids-status-done">
                      <Check size={14} /> Klart idag!
                    </span>
                  ) : (
                    <span className="kids-status-pending">
                      {openCount} {openCount === 1 ? "uppgift kvar" : "uppgifter kvar"}
                    </span>
                  )
                ) : (
                  <span className="kids-status-empty">Inga uppgifter inlagda</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
