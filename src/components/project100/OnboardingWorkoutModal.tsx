"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Dumbbell,
  Flame,
  Home,
  Hourglass,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";

import {
  buildHandstandWorkout,
  getHandstandStep,
} from "@/lib/project100-handstand-track";
import type { Project100ActivityType } from "@/lib/project100-training";

export type OnboardingGoal =
  | "handstand"
  | "get_started"
  | "strength"
  | "hypertrophy";

export type OnboardingLocation = "home_bodyweight" | "home_dumbbells" | "gym";

export type OnboardingDuration = "15" | "30" | "45";

export interface OnboardingGeneratedWorkout {
  title: string;
  explanation: string;
  activityType: Project100ActivityType;
  durationMinutes: string;
  location: string;
  goal?: OnboardingGoal;
  exercises: {
    id: string;
    name: string;
    notes: string;
    sets: {
      id: string;
      reps: string;
      weightKg: string;
      durationMinutes: string;
      durationSeconds?: string;
      distanceKm: string;
      rpe: string;
      done: boolean;
    }[];
  }[];
  hasCameraOption?: boolean;
  cameraHref?: string;
}

function generateProposal(
  goal: OnboardingGoal,
  location: OnboardingLocation,
  duration: OnboardingDuration,
): OnboardingGeneratedWorkout {
  const durationNum = parseInt(duration, 10);
  const locationLabel =
    location === "home_bodyweight"
      ? "Hemma (kroppsvikt)"
      : location === "home_dumbbells"
      ? "Hemma (hantlar)"
      : "Gym / Utegym";
  const activityType: Project100ActivityType =
    location === "gym" ? "outdoor_gym" : "strength_home";

  if (goal === "handstand") {
    const handstand = buildHandstandWorkout(1);
    return {
      title: handstand.title,
      explanation: `Steg 1 i 10-stegs progressionen. Bygger rörlighet och tålighet i handlederna för att ge en trygg grund innan vi klättrar mot vägg.`,
      activityType,
      durationMinutes: duration,
      location: locationLabel,
      goal: "handstand",
      exercises: handstand.exercises.map((ex) => ({
        id: crypto.randomUUID(),
        name: ex.name,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({
          id: crypto.randomUUID(),
          reps: s.reps ?? "",
          weightKg: s.weightKg ?? "",
          durationMinutes: s.durationMinutes ?? "",
          durationSeconds: s.durationSeconds ?? "",
          distanceKm: s.distanceKm ?? "",
          rpe: s.rpe ?? "7",
          done: false,
        })),
      })),
      hasCameraOption: true,
      cameraHref: "/projekt-100/traning/motion?source=active",
    };
  }

  if (goal === "get_started") {
    return {
      title: "Mjukstart · Helkropp & Rörlighet",
      explanation: `Ett skonsamt introduktionspass på ${duration} minuter som väcker kroppen och ökar cirkulationen med enkla basrörelser.`,
      activityType,
      durationMinutes: duration,
      location: locationLabel,
      goal: "get_started",
      exercises: [
        {
          id: crypto.randomUUID(),
          name: "Knäböj till stol / Air Squats",
          notes: "Kontrollerat tempo, tryck genom hela foten.",
          sets: Array.from({ length: durationNum <= 15 ? 2 : 3 }).map(() => ({
            id: crypto.randomUUID(),
            reps: "10",
            weightKg: "",
            durationMinutes: "",
            durationSeconds: "",
            distanceKm: "",
            rpe: "5",
            done: false,
          })),
        },
        {
          id: crypto.randomUUID(),
          name: "Lutande armhävningar mot bord eller vägg",
          notes: "Rak kroppslinje, armbågar vinklade 45°.",
          sets: Array.from({ length: durationNum <= 15 ? 2 : 3 }).map(() => ({
            id: crypto.randomUUID(),
            reps: "8",
            weightKg: "",
            durationMinutes: "",
            durationSeconds: "",
            distanceKm: "",
            rpe: "5",
            done: false,
          })),
        },
        {
          id: crypto.randomUUID(),
          name: "Höftlyft på golv (Glute Bridge)",
          notes: "Pressa upp höften, håll 2 sekunder i toppen.",
          sets: Array.from({ length: 2 }).map(() => ({
            id: crypto.randomUUID(),
            reps: "12",
            weightKg: "",
            durationMinutes: "",
            durationSeconds: "",
            distanceKm: "",
            rpe: "5",
            done: false,
          })),
        },
      ],
      hasCameraOption: true,
      cameraHref: "/projekt-100/traning/motion?source=active",
    };
  }

  if (goal === "strength") {
    return {
      title: "Klassisk Styrka · Grundpass",
      explanation: `Stabila basövningar anpassade för ${locationLabel}. Fokus på god form och märkbar kontakt.`,
      activityType,
      durationMinutes: duration,
      location: locationLabel,
      goal: "strength",
      exercises: [
        {
          id: crypto.randomUUID(),
          name: location === "home_dumbbells" ? "Goblet Squats med hantel" : "Knäböj (Air Squats)",
          notes: "Djup under parallellt om rörligheten tillåter, stolt bröst.",
          sets: Array.from({ length: durationNum <= 15 ? 3 : 4 }).map(() => ({
            id: crypto.randomUUID(),
            reps: "8",
            weightKg: location === "home_dumbbells" ? "12" : "",
            durationMinutes: "",
            durationSeconds: "",
            distanceKm: "",
            rpe: "7",
            done: false,
          })),
        },
        {
          id: crypto.randomUUID(),
          name: "Armhävningar / Push-ups",
          notes: "Bröstkorg ner till mattan, aktiv bålspänning.",
          sets: Array.from({ length: durationNum <= 15 ? 3 : 4 }).map(() => ({
            id: crypto.randomUUID(),
            reps: "8",
            weightKg: "",
            durationMinutes: "",
            durationSeconds: "",
            distanceKm: "",
            rpe: "7",
            done: false,
          })),
        },
        {
          id: crypto.randomUUID(),
          name: "Planka med skulderpress",
          notes: "30-45 sekunder kontrollerat håll.",
          sets: Array.from({ length: 3 }).map(() => ({
            id: crypto.randomUUID(),
            reps: "",
            weightKg: "",
            durationMinutes: "",
            durationSeconds: "30",
            distanceKm: "",
            rpe: "7",
            done: false,
          })),
        },
      ],
      hasCameraOption: true,
      cameraHref: "/projekt-100/traning/motion?source=active",
    };
  }

  // Hypertrophy
  return {
    title: "Muskeltillväxt · Volym & Kontakt",
    explanation: `Fokuserad muskelkontakt och kontrollerat tempo anpassat efter dina förutsättningar på ${duration} min.`,
    activityType,
    durationMinutes: duration,
    location: locationLabel,
    goal: "hypertrophy",
    exercises: [
      {
        id: crypto.randomUUID(),
        name: location === "home_dumbbells" ? "Utfallssteg med hantlar" : "Bulgariska utfall",
        notes: "Långsam excentrisk fas (3 s ner), explosivt upp.",
        sets: Array.from({ length: 3 }).map(() => ({
          id: crypto.randomUUID(),
          reps: "10",
          weightKg: location === "home_dumbbells" ? "10" : "",
          durationMinutes: "",
          durationSeconds: "",
          distanceKm: "",
          rpe: "8",
          done: false,
        })),
      },
      {
        id: crypto.randomUUID(),
        name: "Armhävningar med paus i botten",
        notes: "1 sekunds paus med bröstet precis ovanför golvet.",
        sets: Array.from({ length: 3 }).map(() => ({
          id: crypto.randomUUID(),
          reps: "10",
          weightKg: "",
          durationMinutes: "",
          durationSeconds: "",
          distanceKm: "",
          rpe: "8",
          done: false,
        })),
      },
      {
        id: crypto.randomUUID(),
        name:
          location === "home_dumbbells"
            ? "Hantelrodd (Dumbbell Row)"
            : "Smal armhävning på knä (Triceps)",
        notes:
          location === "home_dumbbells"
            ? "Dra armbågen bakåt mot höften, nyp ihop skulderbladet."
            : "Armbågar tätt intill kroppen, kontrollerad rörelse.",
        sets: Array.from({ length: 3 }).map(() => ({
          id: crypto.randomUUID(),
          reps: "10",
          weightKg: location === "home_dumbbells" ? "10" : "",
          durationMinutes: "",
          durationSeconds: "",
          distanceKm: "",
          rpe: "8",
          done: false,
        })),
      },
    ],
  };
}

function formatProposalSetTarget(set?: OnboardingGeneratedWorkout["exercises"][0]["sets"][0]): string {
  if (!set) return "";
  if (set.durationSeconds && set.durationSeconds.trim() && set.durationSeconds !== "0") {
    return `× ${set.durationSeconds} sek`;
  }
  if (set.reps && set.reps.trim() && set.reps !== "0") {
    return `× ${set.reps} reps${set.weightKg ? ` @ ${set.weightKg} kg` : ""}`;
  }
  if (set.durationMinutes && set.durationMinutes.trim() && set.durationMinutes !== "0") {
    return `× ${set.durationMinutes} min`;
  }
  return "";
}

export function OnboardingWorkoutModal({
  onClose,
  onStartWorkout,
  onStartCameraWorkout,
}: {
  onClose: () => void;
  onStartWorkout: (workout: OnboardingGeneratedWorkout) => void;
  onStartCameraWorkout?: (workout: OnboardingGeneratedWorkout) => void;
}) {
  const [stepIndex, setStepIndex] = useState<1 | 2 | 3 | 4>(1);
  const [goal, setGoal] = useState<OnboardingGoal>("get_started");
  const [location, setLocation] = useState<OnboardingLocation>("home_bodyweight");
  const [duration, setDuration] = useState<OnboardingDuration>("30");

  const proposal = generateProposal(goal, location, duration);

  return (
    <div
      className="p100-training-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="p100-training-modal p100-onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="p100-composer-head p100-onboarding-head">
          <div className="p100-onboarding-head-info">
            <span className="p100-onboarding-badge">
              <Sparkles size={13} /> Introduktion · Lugn start
            </span>
            <h2 id="onboarding-modal-title" className="p100-onboarding-title">
              {stepIndex < 4 ? "Hjälp mig komma igång" : "Ditt rekommenderade pass"}
            </h2>
            <p className="p100-onboarding-subtitle">
              {stepIndex === 1 && "Vad vill du få ut av träningen?"}
              {stepIndex === 2 && "Var tränar du idag?"}
              {stepIndex === 3 && "Hur mycket tid har du just nu?"}
              {stepIndex === 4 && "Ett beprövat upplägg anpassat efter dina svar."}
            </p>
          </div>
          <button type="button" className="p100-modal-close-btn" onClick={onClose} aria-label="Stäng">
            <X size={18} />
          </button>
        </header>

        <div className="p100-onboarding-body">
          {/* Steg 1: Mål */}
          {stepIndex === 1 && (
            <div className="p100-onboarding-choices">
              <button
                type="button"
                className={`p100-choice-card ${goal === "handstand" ? "selected" : ""}`}
                onClick={() => {
                  setGoal("handstand");
                  setStepIndex(2);
                }}
              >
                <span className="p100-choice-icon" style={{ background: "rgba(157, 217, 175, 0.15)", color: "#9dd9af" }}>
                  🤸
                </span>
                <div className="p100-choice-text">
                  <strong>Lära mig något: Stå på händer</strong>
                  <p>10-stegs progression från handledspreparering till fritt handstående.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${goal === "get_started" ? "selected" : ""}`}
                onClick={() => {
                  setGoal("get_started");
                  setStepIndex(2);
                }}
              >
                <span className="p100-choice-icon">
                  <Flame size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>Komma igång mjukt</strong>
                  <p>Låg starttröskel, rörlighet och energi utan prestationspress eller träningsvärk.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${goal === "strength" ? "selected" : ""}`}
                onClick={() => {
                  setGoal("strength");
                  setStepIndex(2);
                }}
              >
                <span className="p100-choice-icon">
                  <Trophy size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>Bli starkare</strong>
                  <p>Klassiska basrörelser och ökad kraft för en tålig kropp i vardagen.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${goal === "hypertrophy" ? "selected" : ""}`}
                onClick={() => {
                  setGoal("hypertrophy");
                  setStepIndex(2);
                }}
              >
                <span className="p100-choice-icon">
                  <Dumbbell size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>Bygga muskler</strong>
                  <p>Fokuserad muskelkontakt och progressiv belastning för volym.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>
            </div>
          )}

          {/* Steg 2: Plats & utrustning */}
          {stepIndex === 2 && (
            <div className="p100-onboarding-choices">
              <button
                type="button"
                className={`p100-choice-card ${location === "home_bodyweight" ? "selected" : ""}`}
                onClick={() => {
                  setLocation("home_bodyweight");
                  setStepIndex(3);
                }}
              >
                <span className="p100-choice-icon">
                  <Home size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>Hemma med kroppsvikt</strong>
                  <p>Ingen utrustning krävs – bara lite golvyta eller en matta.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${location === "home_dumbbells" ? "selected" : ""}`}
                onClick={() => {
                  setLocation("home_dumbbells");
                  setStepIndex(3);
                }}
              >
                <span className="p100-choice-icon">
                  <Dumbbell size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>Hemma med hantlar / gummiband</strong>
                  <p>Möjlighet att lägga till extra yttre belastning vid behov.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${location === "gym" ? "selected" : ""}`}
                onClick={() => {
                  setLocation("gym");
                  setStepIndex(3);
                }}
              >
                <span className="p100-choice-icon">
                  <Zap size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>Utegym eller gym</strong>
                  <p>Tillgång till stänger, bänkar och fria vikter.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>
            </div>
          )}

          {/* Steg 3: Tid */}
          {stepIndex === 3 && (
            <div className="p100-onboarding-choices">
              <button
                type="button"
                className={`p100-choice-card ${duration === "15" ? "selected" : ""}`}
                onClick={() => {
                  setDuration("15");
                  setStepIndex(4);
                }}
              >
                <span className="p100-choice-icon">
                  <Hourglass size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>15 minuter</strong>
                  <p>Snabbt och fokuserat pass. Perfekt mellan möten eller när tiden är knapp.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${duration === "30" ? "selected" : ""}`}
                onClick={() => {
                  setDuration("30");
                  setStepIndex(4);
                }}
              >
                <span className="p100-choice-icon">
                  <Hourglass size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>30 minuter</strong>
                  <p>Standardpass med lagom tid för uppvärmning, set och rimlig vila.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>

              <button
                type="button"
                className={`p100-choice-card ${duration === "45" ? "selected" : ""}`}
                onClick={() => {
                  setDuration("45");
                  setStepIndex(4);
                }}
              >
                <span className="p100-choice-icon">
                  <Hourglass size={20} />
                </span>
                <div className="p100-choice-text">
                  <strong>45 minuter</strong>
                  <p>Grundligt pass med fler set och mer utrymme för progression.</p>
                </div>
                <ArrowRight className="p100-choice-arrow" size={18} />
              </button>
            </div>
          )}

          {/* Steg 4: Rekommenderat förslag */}
          {stepIndex === 4 && (
            <div className="p100-proposal-view">
              <div className="p100-proposal-card">
                <div className="p100-proposal-head">
                  <div>
                    <span className="p100-proposal-tag">Rekommenderat förslag</span>
                    <h3 className="p100-proposal-title">{proposal.title}</h3>
                    <div className="p100-proposal-meta-pills">
                      <span className="p100-proposal-pill">
                        <Hourglass size={13} /> Ca {proposal.durationMinutes} minuter
                      </span>
                      <span className="p100-proposal-pill">
                        <Home size={13} /> {proposal.location}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p100-proposal-explanation-box">
                  <p className="p100-proposal-explanation">{proposal.explanation}</p>
                </div>

                <div className="p100-proposal-exercises">
                  <h4 className="p100-proposal-exercises-heading">Övningar i passet</h4>
                  <ul className="p100-proposal-exercises-list">
                    {proposal.exercises.map((ex, idx) => (
                      <li key={ex.id || idx} className="p100-proposal-exercise-item">
                        <div className="p100-proposal-ex-info">
                          <strong className="p100-proposal-ex-name">{ex.name}</strong>
                          {ex.notes ? <p className="p100-proposal-ex-notes">{ex.notes}</p> : null}
                        </div>
                        <span className="p100-proposal-ex-sets">
                          {ex.sets.length} set {formatProposalSetTarget(ex.sets[0])}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="p100-composer-actions p100-onboarding-actions">
          {stepIndex > 1 ? (
            <button
              type="button"
              className="p100-button-secondary p100-btn-back"
              onClick={() => setStepIndex((prev) => (prev - 1) as 1 | 2 | 3)}
            >
              <ArrowLeft size={16} /> Tillbaka
            </button>
          ) : (
            <button type="button" className="p100-button-ghost" onClick={onClose}>
              Avbryt
            </button>
          )}

          {stepIndex === 4 ? (
            <div className="p100-onboarding-actions-right">
              {proposal.hasCameraOption ? (
                onStartCameraWorkout ? (
                  <button
                    type="button"
                    className="p100-btn-camera"
                    onClick={() => onStartCameraWorkout(proposal)}
                  >
                    <Camera size={16} /> Motion Lab (Kamera)
                  </button>
                ) : proposal.cameraHref ? (
                  <Link
                    href={proposal.cameraHref}
                    className="p100-btn-camera"
                    onClick={onClose}
                  >
                    <Camera size={16} /> Motion Lab (Kamera)
                  </Link>
                ) : null
              ) : null}
              <button
                type="button"
                className="p100-button p100-btn-start-primary"
                onClick={() => onStartWorkout(proposal)}
              >
                <Play size={16} /> Starta träningen
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
