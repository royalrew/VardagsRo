"use client";

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatWorkoutSetTarget,
  getWorkoutSnapshotProgress,
  saveWorkoutMemorySnapshot,
  type WorkoutMemoryExercise,
  type WorkoutMemorySet,
  type WorkoutMemorySnapshot,
} from "@/lib/project100-workout-memory";

export interface ActiveWorkoutRunnerProps {
  snapshot: WorkoutMemorySnapshot;
  onUpdateSnapshot: (snapshot: WorkoutMemorySnapshot) => void;
  onPause: () => void;
  onFinish: (resultSnapshot: WorkoutMemorySnapshot) => Promise<void>;
  onSwitchToCamera?: () => void;
  onClose: () => void;
}

type RunnerPhase = "active-set" | "resting" | "summary";

const RPE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "5", label: "5 · Bekvämt", desc: "Lätt kontakt, god marginal" },
  { value: "6", label: "6 · Måttligt", desc: "Kännbart men lätt att kontrollera" },
  { value: "7", label: "7 · Ansträngande", desc: "Bra träningsstimulans, kontrollerad form" },
  { value: "8", label: "8 · Tufft", desc: "Cirka 2 repetitioner kvar i reserv" },
  { value: "9", label: "9 · Mycket tufft", desc: "Cirka 1 repetition kvar i reserv" },
  { value: "10", label: "10 · Maxinsats", desc: "Inga repetitioner kvar" },
];

export function ActiveWorkoutRunner({
  snapshot,
  onUpdateSnapshot,
  onPause,
  onFinish,
  onSwitchToCamera,
  onClose,
}: ActiveWorkoutRunnerProps) {
  // Find first uncompleted exercise and set
  const initialPosition = useMemo(() => {
    let hasUnfinished = false;
    for (let exIdx = 0; exIdx < snapshot.exercises.length; exIdx++) {
      const ex = snapshot.exercises[exIdx];
      for (let sIdx = 0; sIdx < ex.sets.length; sIdx++) {
        if (!ex.sets[sIdx].done) {
          hasUnfinished = true;
          return { exerciseIndex: exIdx, setIndex: sIdx, allDone: false };
        }
      }
    }
    return { exerciseIndex: 0, setIndex: 0, allDone: !hasUnfinished };
  }, [snapshot.exercises]);

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(initialPosition.exerciseIndex);
  const [currentSetIndex, setCurrentSetIndex] = useState(initialPosition.setIndex);
  const [phase, setPhase] = useState<RunnerPhase>(initialPosition.allDone ? "summary" : "active-set");

  // Rest timer state
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(60);

  // Hold timer state (for isometric exercises like handstand or plank)
  const [holdActive, setHoldActive] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(0);

  // Active set input overrides
  const [actualReps, setActualReps] = useState<string>("");
  const [actualSeconds, setActualSeconds] = useState<string>("");
  const [actualWeightKg, setActualWeightKg] = useState<string>("");

  // Summary state
  const [effort, setEffort] = useState<string>(snapshot.effort || "7");
  const [notes, setNotes] = useState<string>(snapshot.notes || "");
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const currentExercise: WorkoutMemoryExercise | undefined =
    snapshot.exercises[currentExerciseIndex];
  const currentSet: WorkoutMemorySet | undefined =
    currentExercise?.sets[currentSetIndex];

  const isHoldExercise = Boolean(
    (currentSet?.durationSeconds && currentSet.durationSeconds.trim() && currentSet.durationSeconds !== "0") ||
    (currentExercise?.notes && currentExercise.notes.toLowerCase().includes("sekund")),
  );

  // Synchronize input fields whenever active set changes
  useEffect(() => {
    if (currentSet) {
      setActualReps(currentSet.actualReps || currentSet.reps || "");
      setActualSeconds(currentSet.actualDurationSeconds || currentSet.durationSeconds || "");
      setActualWeightKg(currentSet.actualWeightKg || currentSet.weightKg || "");
      setHoldSeconds(
        currentSet.actualDurationSeconds ? Number(currentSet.actualDurationSeconds) || 0 : 0,
      );
      setHoldActive(false);
    }
  }, [currentExerciseIndex, currentSetIndex, currentSet]);

  // Hold stopwatch tick
  useEffect(() => {
    if (!holdActive) return;
    const interval = window.setInterval(() => {
      setHoldSeconds((prev) => {
        const next = prev + 1;
        setActualSeconds(String(next));
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [holdActive]);

  // Rest countdown tick
  useEffect(() => {
    if (phase !== "resting") return;
    const interval = window.setInterval(() => {
      setRestSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Timer finished, but do not forcefully advance without user being ready
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // Progress summary
  const progress = useMemo(() => getWorkoutSnapshotProgress(snapshot), [snapshot]);

  // Check next set position
  const findNextPosition = useCallback(() => {
    if (!currentExercise) return null;
    if (currentSetIndex + 1 < currentExercise.sets.length) {
      return { exerciseIndex: currentExerciseIndex, setIndex: currentSetIndex + 1 };
    }
    if (currentExerciseIndex + 1 < snapshot.exercises.length) {
      return { exerciseIndex: currentExerciseIndex + 1, setIndex: 0 };
    }
    return null;
  }, [currentExercise, currentSetIndex, currentExerciseIndex, snapshot.exercises.length]);

  // Advance to next set or summary
  const handleCompleteCurrentSet = useCallback(() => {
    if (!currentExercise || !currentSet) return;

    setHoldActive(false);

    // Create updated snapshot with set marked done
    const updatedExercises = snapshot.exercises.map((ex, exIdx) => {
      if (exIdx !== currentExerciseIndex) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, sIdx) => {
          if (sIdx !== currentSetIndex) return s;
          return {
            ...s,
            done: true,
            actualReps: actualReps.trim() || s.reps,
            actualDurationSeconds: isHoldExercise
              ? String(holdSeconds > 0 ? holdSeconds : actualSeconds.trim() || s.durationSeconds || "")
              : undefined,
            actualWeightKg: actualWeightKg.trim() || s.weightKg,
          };
        }),
      };
    });

    const nextSnapshot: WorkoutMemorySnapshot = {
      ...snapshot,
      updatedAtMs: Date.now(),
      exercises: updatedExercises,
    };

    saveWorkoutMemorySnapshot(nextSnapshot);
    onUpdateSnapshot(nextSnapshot);

    const nextPos = findNextPosition();
    if (nextPos) {
      setRestSecondsRemaining(60);
      setPhase("resting");
    } else {
      setPhase("summary");
    }
  }, [
    currentExercise,
    currentSet,
    snapshot,
    currentExerciseIndex,
    currentSetIndex,
    actualReps,
    isHoldExercise,
    holdSeconds,
    actualSeconds,
    actualWeightKg,
    onUpdateSnapshot,
    findNextPosition,
  ]);

  const handleProceedFromRest = useCallback(() => {
    const nextPos = findNextPosition();
    if (nextPos) {
      setCurrentExerciseIndex(nextPos.exerciseIndex);
      setCurrentSetIndex(nextPos.setIndex);
      setPhase("active-set");
    } else {
      setPhase("summary");
    }
  }, [findNextPosition]);

  // Keybindings (Spacebar for Done / Ready)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (phase === "active-set") {
          handleCompleteCurrentSet();
        } else if (phase === "resting") {
          handleProceedFromRest();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, handleCompleteCurrentSet, handleProceedFromRest]);

  async function handleFinishWorkout() {
    setIsFinishing(true);
    setFinishError(null);
    try {
      const elapsedMinutes = Math.max(
        1,
        Math.round((Date.now() - snapshot.startedAtMs) / (60 * 1000)),
      );
      const finishedSnapshot: WorkoutMemorySnapshot = {
        ...snapshot,
        durationMinutes: String(elapsedMinutes),
        effort: effort.trim() || "",
        notes: notes.trim(),
        updatedAtMs: Date.now(),
      };
      await onFinish(finishedSnapshot);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Kunde inte spara passet.");
    } finally {
      setIsFinishing(false);
    }
  }

  return (
    <div
      className="p100-training-modal-backdrop p100-active-runner-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Aktivt träningspass"
    >
      <div className="p100-active-runner-shell">
        {/* Top bar */}
        <header className="p100-active-runner-header">
          <div className="p100-active-runner-title-group">
            <span className="p100-active-runner-badge">
              <Sparkles size={13} /> Guidad träning
            </span>
            <h2 className="p100-active-runner-title">{snapshot.title}</h2>
          </div>

          <div className="p100-active-runner-actions">
            {onSwitchToCamera ? (
              <button
                type="button"
                className="p100-button-secondary p100-runner-btn-camera"
                onClick={onSwitchToCamera}
                title="Växla till Motion Lab för kameraräkning"
              >
                <Camera size={15} /> Träna med kamera
              </button>
            ) : null}

            <button
              type="button"
              className="p100-button-secondary"
              onClick={onPause}
              title="Pausa och spara i träningsminnet"
            >
              <Pause size={15} /> Pausa passet
            </button>

            {phase !== "summary" ? (
              <button
                type="button"
                className="p100-button-secondary"
                onClick={() => setPhase("summary")}
              >
                Avsluta pass
              </button>
            ) : (
              <button type="button" className="p100-runner-close" onClick={onClose} title="Stäng">
                <X size={18} />
              </button>
            )}
          </div>
        </header>

        {/* Global Progress Strip */}
        <div className="p100-active-runner-progress-bar">
          <div
            className="p100-active-runner-progress-fill"
            style={{
              width: `${progress.totalSets > 0 ? (progress.completedSets / progress.totalSets) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="p100-active-runner-progress-info">
          <span>{progress.progressSummary}</span>
          <small>
            <Clock size={12} /> {Math.max(1, Math.round((Date.now() - snapshot.startedAtMs) / 60000))} min aktiv tid
          </small>
        </div>

        {/* MAIN BODY: ACTIVE SET PHASE */}
        {phase === "active-set" && currentExercise && currentSet ? (
          <main className="p100-active-runner-main">
            <div className="p100-active-runner-exercise-meta">
              <span className="p100-active-runner-step-tag">
                Övning {currentExerciseIndex + 1} av {snapshot.exercises.length}
              </span>
              <h3 className="p100-active-runner-exercise-name">{currentExercise.name}</h3>
              {currentExercise.notes ? (
                <p className="p100-active-runner-exercise-cue">{currentExercise.notes}</p>
              ) : null}
            </div>

            <div className="p100-active-runner-card">
              <header className="p100-active-runner-card-head">
                <span className="p100-active-runner-set-badge">
                  Set {currentSetIndex + 1} av {currentExercise.sets.length}
                </span>
                <span className="p100-active-runner-target-pill">
                  Mål: {formatWorkoutSetTarget(currentSet)}
                </span>
              </header>

              {/* ISOMETRIC HOLD TIMER */}
              {isHoldExercise ? (
                <div className="p100-active-runner-hold-box">
                  <div className="p100-active-runner-hold-digits">
                    {String(Math.floor(holdSeconds / 60)).padStart(2, "0")}:
                    {String(holdSeconds % 60).padStart(2, "0")}
                  </div>
                  <div className="p100-active-runner-hold-controls">
                    {!holdActive ? (
                      <button
                        type="button"
                        className="p100-button p100-runner-hold-btn"
                        onClick={() => setHoldActive(true)}
                      >
                        <Play size={16} /> Starta hålltid
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="p100-button-secondary p100-runner-hold-btn"
                        onClick={() => setHoldActive(false)}
                      >
                        <Pause size={16} /> Pausa tid
                      </button>
                    )}
                    <button
                      type="button"
                      className="p100-button-secondary"
                      onClick={() => {
                        setHoldActive(false);
                        setHoldSeconds(0);
                        setActualSeconds("");
                      }}
                      title="Nollställ tid"
                    >
                      <RotateCcw size={15} /> Nollställ
                    </button>
                  </div>
                  <div className="p100-active-runner-manual-override">
                    <label>
                      <span>Eller ange sekunder manuellt:</span>
                      <input
                        type="number"
                        min="0"
                        max="3600"
                        value={actualSeconds}
                        onChange={(e) => setActualSeconds(e.target.value)}
                        placeholder={currentSet.durationSeconds || "20"}
                      />
                      <span>sek</span>
                    </label>
                  </div>
                </div>
              ) : (
                /* REP-BASED SET CONTROLS */
                <div className="p100-active-runner-rep-box">
                  <div className="p100-active-runner-metric-stepper">
                    <span className="p100-metric-label">Repetitioners mål & utfall</span>
                    <div className="p100-stepper-row">
                      <button
                        type="button"
                        onClick={() =>
                          setActualReps((prev) =>
                            String(Math.max(0, (parseInt(prev || currentSet.reps || "10", 10) || 0) - 1)),
                          )
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={actualReps}
                        onChange={(e) => setActualReps(e.target.value)}
                        placeholder={currentSet.reps || "10"}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setActualReps((prev) =>
                            String((parseInt(prev || currentSet.reps || "10", 10) || 0) + 1),
                          )
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {currentSet.weightKg || actualWeightKg ? (
                    <div className="p100-active-runner-metric-stepper">
                      <span className="p100-metric-label">Vikt (kg)</span>
                      <div className="p100-stepper-row">
                        <button
                          type="button"
                          onClick={() =>
                            setActualWeightKg((prev) =>
                              String(Math.max(0, (parseFloat(prev || currentSet.weightKg || "0") || 0) - 1)),
                            )
                          }
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={actualWeightKg}
                          onChange={(e) => setActualWeightKg(e.target.value)}
                          placeholder={currentSet.weightKg || "0"}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setActualWeightKg((prev) =>
                              String((parseFloat(prev || currentSet.weightKg || "0") || 0) + 1),
                            )
                          }
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* PRIMARY ACTION BUTTON */}
              <div className="p100-active-runner-confirm-area">
                <button
                  type="button"
                  className="p100-button p100-active-runner-done-btn"
                  onClick={handleCompleteCurrentSet}
                >
                  <CheckCircle2 size={18} /> Markera set klart
                  <kbd className="p100-runner-kbd">Mellanslag</kbd>
                </button>
              </div>

              {/* Quick Jump / Skip controls */}
              <footer className="p100-active-runner-card-foot">
                {currentExerciseIndex > 0 ? (
                  <button
                    type="button"
                    className="p100-link-btn"
                    onClick={() => {
                      setCurrentExerciseIndex((prev) => prev - 1);
                      setCurrentSetIndex(0);
                    }}
                  >
                    <ArrowLeft size={14} /> Föregående övning
                  </button>
                ) : <span />}

                {currentExerciseIndex + 1 < snapshot.exercises.length ? (
                  <button
                    type="button"
                    className="p100-link-btn"
                    onClick={() => {
                      setCurrentExerciseIndex((prev) => prev + 1);
                      setCurrentSetIndex(0);
                    }}
                  >
                    Hoppa till nästa övning <ChevronRight size={14} />
                  </button>
                ) : null}
              </footer>
            </div>
          </main>
        ) : null}

        {/* REST PHASE */}
        {phase === "resting" ? (
          <main className="p100-active-runner-main p100-runner-rest-main">
            <div className="p100-runner-rest-card">
              <span className="p100-runner-rest-badge">
                <Timer size={16} /> Vila
              </span>

              <h3 className="p100-runner-rest-heading">Snyggt jobbat! Bra utfört set.</h3>
              <p className="p100-runner-rest-subtitle">
                Andas lugnt och ladda inför nästa insats.
              </p>

              <div className="p100-runner-rest-countdown">
                <span className="p100-runner-rest-timer-val">{restSecondsRemaining}</span>
                <span className="p100-runner-rest-timer-unit">sekunder kvar</span>
              </div>

              <div className="p100-runner-rest-time-adjusters">
                <button
                  type="button"
                  className="p100-button-secondary"
                  onClick={() => setRestSecondsRemaining((prev) => Math.max(0, prev - 15))}
                >
                  -15s
                </button>
                <button
                  type="button"
                  className="p100-button-secondary"
                  onClick={() => setRestSecondsRemaining((prev) => prev + 30)}
                >
                  +30s
                </button>
              </div>

              <div className="p100-runner-rest-action-area">
                <button
                  type="button"
                  className="p100-button p100-runner-rest-proceed-btn"
                  onClick={handleProceedFromRest}
                >
                  <Play size={17} /> Redo nu · Nästa set
                  <kbd className="p100-runner-kbd">Mellanslag</kbd>
                </button>
                <p className="p100-runner-rest-note">
                  Vilans slut är ingen order att fortsätta innan du är redo.
                </p>
              </div>
            </div>
          </main>
        ) : null}

        {/* SUMMARY / FINISH PHASE */}
        {phase === "summary" ? (
          <main className="p100-active-runner-main p100-runner-summary-main">
            <div className="p100-runner-summary-card">
              <span className="p100-runner-summary-badge">
                <CheckCircle2 size={16} /> Passöversikt
              </span>

              <h3>Sammanfattning av utfört arbete</h3>
              <p className="p100-runner-summary-intro">
                Endast de set du faktiskt genomfört och bekräftat sparas i din träningshistorik.
              </p>

              <div className="p100-runner-summary-metrics">
                <article>
                  <span>Genomförda set</span>
                  <strong>{progress.completedSets} av {progress.totalSets}</strong>
                </article>
                <article>
                  <span>Aktiv tid</span>
                  <strong>{Math.max(1, Math.round((Date.now() - snapshot.startedAtMs) / 60000))} min</strong>
                </article>
                <article>
                  <span>Status</span>
                  <strong>{progress.isAllDone ? "Helt genomfört" : "Delvis genomfört"}</strong>
                </article>
              </div>

              <div className="p100-runner-summary-list">
                <h4>Övningar & Set</h4>
                <ul>
                  {snapshot.exercises.map((ex) => {
                    const doneCount = ex.sets.filter((s) => s.done).length;
                    return (
                      <li key={ex.id} className={doneCount > 0 ? "done-ex" : "pending-ex"}>
                        <div>
                          <strong>{ex.name}</strong>
                          <small>
                            {doneCount} av {ex.sets.length} set genomförda
                          </small>
                        </div>
                        {doneCount > 0 ? (
                          <span className="p100-tag-done">Utförd</span>
                        ) : (
                          <span className="p100-tag-skipped">Överhoppad</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="p100-runner-effort-picker">
                <label>
                  <span>Upplevd ansträngning (RPE)</span>
                  <select value={effort} onChange={(e) => setEffort(e.target.value)}>
                    {RPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.desc}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="p100-runner-notes-input">
                <label>
                  <span>Passanteckning (valfritt)</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Hur kändes kroppen? Något att minnas till nästa gång?"
                  />
                </label>
              </div>

              {finishError ? (
                <p className="p100-form-error" role="alert">
                  {finishError}
                </p>
              ) : null}

              <footer className="p100-runner-summary-actions">
                <button
                  type="button"
                  className="p100-button-secondary"
                  onClick={() => setPhase("active-set")}
                  disabled={isFinishing}
                >
                  <ArrowLeft size={15} /> Tillbaka till träningen
                </button>
                <button
                  type="button"
                  className="p100-button p100-runner-save-btn"
                  onClick={handleFinishWorkout}
                  disabled={isFinishing || progress.completedSets === 0}
                >
                  {isFinishing ? "Sparar..." : "💾 Spara till träningsloggen"}
                </button>
              </footer>
            </div>
          </main>
        ) : null}
      </div>
    </div>
  );
}
