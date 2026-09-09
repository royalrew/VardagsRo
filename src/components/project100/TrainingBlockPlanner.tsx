"use client";

import { Backpack, Camera, Check, MapPin, Save, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  recommendProject100MissionExercises,
  type Project100MissionType,
  type Project100MovementPattern,
  type Project100TrainingEnvironment,
} from "@/lib/project100-training-mission";
import {
  estimateLoadedBackpackWeight,
  validateLoadedBackpackSetup,
  type BackpackCarryPosition,
  type LoadedBackpackSafetyCheck,
  type TrainingEquipment,
} from "@/lib/motion-equipment";
import {
  buildMotionMissionLaunchHref,
  getCore24MissionTrackingId,
  type MotionMissionLaunch,
} from "@/lib/motion-mission-launch";
import type { Core24Variation } from "@/lib/motion-core24";
import { cyclingWarmupIsComplete, markCyclingWarmupComplete, subscribeToWarmupMemory } from "@/lib/project100-warmup-memory";
import { CyclingWarmup } from "./CyclingWarmup";

interface PlannerRequirement {
  movementPattern: Project100MovementPattern;
  remainingSets: number;
  targetSets: number;
  targetReps: number;
}

interface ManualSetDraft {
  familyId: string;
  exerciseName: string;
  movementPattern: Project100MovementPattern;
  variation: Core24Variation;
  targetReps: number;
  reps: string;
  durationSeconds: string;
  rpe: string;
  controlledRom: boolean;
}

const environments: Array<{ id: Project100TrainingEnvironment; label: string }> = [
  { id: "home", label: "Hemma" },
  { id: "outdoor_gym", label: "Utegym" },
  { id: "grass", label: "Gräsmatta" },
  { id: "forest", label: "Skog" },
  { id: "gym", label: "Gym" },
  { id: "other", label: "Annan plats" },
];

const equipmentChoices: Array<{ id: Exclude<TrainingEquipment, "bodyweight">; label: string }> = [
  { id: "loaded_backpack", label: "Laddad ryggsäck" },
  { id: "dumbbell", label: "Hantel" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "bench_or_chair", label: "Bänk/stol" },
  { id: "pullup_bar", label: "Chinsstång" },
  { id: "low_bar_or_straps", label: "Låg stång/remmar" },
  { id: "resistance_band", label: "Träningsband" },
  { id: "wall", label: "Fri vägg" },
  { id: "bicycle", label: "Cykel" },
];

const qualityLabels = {
  gold: "Guld",
  silver: "Silver",
  manual: "Manuell",
} as const;



function plannerStorageKey(missionId: string): string {
  return `project100:training-setup:${missionId}`;
}

function parseSwedishNumber(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function TrainingBlockPlanner({
  missionId,
  missionType,
  requirements,
  onSaved,
}: {
  missionId: string;
  missionType: Project100MissionType;
  requirements: readonly PlannerRequirement[];
  onSaved: () => Promise<void>;
}) {
  const [environment, setEnvironment] = useState<Project100TrainingEnvironment>("home");
  const [equipment, setEquipment] = useState<TrainingEquipment[]>([]);
  const [waterLiters, setWaterLiters] = useState("");
  const [bagWeightKg, setBagWeightKg] = useState("");
  const [measuredTotalKg, setMeasuredTotalKg] = useState("");
  const [carryPosition, setCarryPosition] = useState<BackpackCarryPosition>("back");
  const [backpackSafety, setBackpackSafety] = useState<LoadedBackpackSafetyCheck>({
    contentsSecured: false,
    closuresClosed: false,
    seamsAndStrapsIntact: false,
    canReleaseSafely: false,
  });
  const [warmupDismissed, setWarmupDismissed] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualSetDraft | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const manualEventIdRef = useRef<string | null>(null);
  const warmupCompleted = useSyncExternalStore(
    subscribeToWarmupMemory,
    () => cyclingWarmupIsComplete(missionId),
    () => false,
  );

  useEffect(() => {
    const hydrationFrame = requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(plannerStorageKey(missionId)) ?? "null") as {
          environment?: Project100TrainingEnvironment;
          equipment?: TrainingEquipment[];
        } | null;
        if (stored?.environment && environments.some((item) => item.id === stored.environment)) {
          setEnvironment(stored.environment);
        }
        if (Array.isArray(stored?.equipment)) {
          const allowed = new Set(equipmentChoices.map((item) => item.id));
          setEquipment(stored.equipment.filter((item) => item === "bodyweight" || allowed.has(item as Exclude<TrainingEquipment, "bodyweight">)));
        }
      } catch {
        // En trasig sessionsinställning ersätts när användaren gör nästa val.
      }
    });
    return () => cancelAnimationFrame(hydrationFrame);
  }, [missionId]);

  function savePlannerSetup(
    nextEnvironment: Project100TrainingEnvironment,
    nextEquipment: TrainingEquipment[],
  ) {
    try {
      sessionStorage.setItem(plannerStorageKey(missionId), JSON.stringify({
        environment: nextEnvironment,
        equipment: nextEquipment,
      }));
    } catch {
      // Valen fungerar fortfarande för den öppna sidan om lagring inte är tillgänglig.
    }
  }

  const backpackSelected = equipment.includes("loaded_backpack");
  const backpackEstimate = useMemo(() => estimateLoadedBackpackWeight({
    waterLiters: parseSwedishNumber(waterLiters) ?? 0,
    bagWeightKg: parseSwedishNumber(bagWeightKg),
    measuredTotalKg: parseSwedishNumber(measuredTotalKg),
  }), [bagWeightKg, measuredTotalKg, waterLiters]);
  const backpackSafetyResult = useMemo(
    () => validateLoadedBackpackSetup(backpackSafety),
    [backpackSafety],
  );
  const backpackReady = backpackSelected
    && backpackEstimate.estimatedKg > 0
    && carryPosition !== "other"
    && backpackSafetyResult.safeToRecommend;

  const effectiveEquipment = useMemo(() => {
    const selected = equipment.filter((item) => item !== "loaded_backpack");
    return backpackReady ? [...selected, "loaded_backpack" as const] : selected;
  }, [backpackReady, equipment]);

  const recommendations = useMemo(() => recommendProject100MissionExercises({
    missionType,
    environment,
    availableEquipment: effectiveEquipment,
    backpackCarryPosition: backpackReady ? carryPosition : undefined,
  }), [backpackReady, carryPosition, effectiveEquipment, environment, missionType]);

  function toggleEquipment(item: TrainingEquipment) {
    setEquipment((current) => {
      const next = current.includes(item)
        ? current.filter((candidate) => candidate !== item)
        : [...current, item];
      savePlannerSetup(environment, next);
      return next;
    });
  }

  function toggleSafety(item: keyof LoadedBackpackSafetyCheck) {
    setBackpackSafety((current) => ({ ...current, [item]: !current[item] }));
  }

  function openManualSet(
    familyId: string,
    movementPattern: Project100MovementPattern,
    variation: Core24Variation,
    targetReps: number,
  ) {
    const isHold = familyId === "plank";
    manualEventIdRef.current = `manual-set-${crypto.randomUUID()}`;
    setManualError(null);
    setManualDraft({
      familyId,
      exerciseName: variation.name,
      movementPattern,
      variation,
      targetReps,
      reps: isHold ? "" : String(targetReps),
      durationSeconds: isHold ? String(targetReps) : "",
      rpe: "",
      controlledRom: false,
    });
  }

  async function saveManualSet() {
    if (!manualDraft) return;
    const reps = parseSwedishNumber(manualDraft.reps);
    const durationSeconds = parseSwedishNumber(manualDraft.durationSeconds);
    const rpe = parseSwedishNumber(manualDraft.rpe);
    if (reps === undefined && durationSeconds === undefined) {
      setManualError("Ange repetitioner eller hålltid.");
      return;
    }
    if (reps !== undefined && !Number.isInteger(reps)) {
      setManualError("Repetitioner måste vara ett heltal.");
      return;
    }
    if (durationSeconds !== undefined && !Number.isInteger(durationSeconds)) {
      setManualError("Hålltid måste anges i hela sekunder.");
      return;
    }
    if (rpe !== undefined && (rpe < 1 || rpe > 10)) {
      setManualError("RPE måste vara mellan 1 och 10.");
      return;
    }

    const usesBackpack = manualDraft.variation.equipment.includes("loaded_backpack");
    const performedAt = new Date().toISOString();
    const sourceEventId = manualEventIdRef.current ?? `manual-set-${crypto.randomUUID()}`;
    manualEventIdRef.current = sourceEventId;
    setSavingManual(true);
    setManualError(null);
    try {
      const response = await fetch(`/api/project100/training/mission/${encodeURIComponent(missionId)}/blocks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startedAt: performedAt,
          endedAt: performedAt,
          activeSeconds: 0,
          environment,
          location: null,
          source: "manual",
          sourceEventId,
          setupProfileId: null,
          exercises: [{
            name: manualDraft.exerciseName,
            movementPattern: manualDraft.movementPattern,
            purpose: "strength_hypertrophy",
            notes: usesBackpack
              ? `loaded_backpack · ${backpackEstimate.estimatedKg} kg (${backpackEstimate.confidence}) · ${carryPosition}`
              : null,
            sets: [{
              reps: reps ?? null,
              weightKg: usesBackpack ? backpackEstimate.estimatedKg : null,
              durationSeconds: durationSeconds ?? null,
              distanceMeters: null,
              rpe: rpe ?? null,
              performedAt,
              sourceEventId,
              observationLevel: "manual",
              romConfidence: manualDraft.controlledRom ? 0.6 : null,
            }],
          }],
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; details?: string } | null;
        throw new Error(body?.details ?? body?.error ?? "Setet kunde inte sparas.");
      }
      await onSaved();
      manualEventIdRef.current = null;
      setManualDraft(null);
    } catch (caught) {
      setManualError(caught instanceof Error ? caught.message : "Setet kunde inte sparas.");
    } finally {
      setSavingManual(false);
    }
  }

  const remainingPatterns = new Map(requirements.map((item) => [item.movementPattern, item]));
  const remainingRecommendations = recommendations.filter((item) =>
    (remainingPatterns.get(item.movementPattern)?.remainingSets ?? 0) > 0);
  const nextGroup = remainingRecommendations.find((item) => item.recommendations.length > 0);
  const nextRecommendation = nextGroup?.recommendations[0];
  const nextVariation = nextRecommendation?.availableVariations
    .filter((variation) => variation.difficulty <= 3)
    .find((variation) => getCore24MissionTrackingId(nextRecommendation.familyId, variation.id) !== null)
    ?? nextRecommendation?.availableVariations.find((variation) => variation.difficulty <= 3);
  const nextRequirement = nextGroup ? remainingPatterns.get(nextGroup.movementPattern) : undefined;
  const nextTrackingId = nextRecommendation && nextVariation
    ? getCore24MissionTrackingId(nextRecommendation.familyId, nextVariation.id)
    : null;
  const nextLaunchHref = nextGroup && nextRecommendation && nextVariation && nextTrackingId
    ? buildMotionMissionLaunchHref({
        missionId,
        familyId: nextRecommendation.familyId as MotionMissionLaunch["familyId"],
        variationId: nextVariation.id,
        exerciseId: nextTrackingId,
        exerciseName: nextVariation.name,
        movementPattern: nextGroup.movementPattern,
        environment,
        targetReps: nextRequirement?.targetReps ?? 10,
        targetDurationSeconds: nextTrackingId === "plank" ? nextRequirement?.targetReps ?? 30 : null,
        weightKg: null,
        backpackCarryPosition: null,
      })
    : null;
  const canWarmUpOnBike = !warmupDismissed
    && !warmupCompleted
    && requirements.length > 0
    && requirements.every((item) => item.remainingSets === item.targetSets);

  return (
    <section className="p100-block-planner" aria-labelledby="p100-block-planner-title">
      <header>
        <div>
          <span><Sparkles /> Ditt pass</span>
          <h3 id="p100-block-planner-title">Nästa steg</h3>
          <p>En övning i taget. Du kan använda kameran eller bekräfta dina set själv.</p>
        </div>
        <em><MapPin /> {environments.find((item) => item.id === environment)?.label}</em>
      </header>

      <details className="p100-block-details">
        <summary>Ändra plats och utrustning</summary>
      <div className="p100-block-planner-controls">
        <label>
          <span>Miljö</span>
          <select value={environment} onChange={(event) => {
            const nextEnvironment = event.target.value as Project100TrainingEnvironment;
            setEnvironment(nextEnvironment);
            savePlannerSetup(nextEnvironment, equipment);
          }}>
            {environments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Utrustning som finns här</legend>
          <div className="p100-equipment-choices">
            {equipmentChoices.map((item) => {
              const selected = equipment.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleEquipment(item.id)}
                >
                  {selected ? <Check /> : item.id === "loaded_backpack" ? <Backpack /> : null}
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {backpackSelected ? (
        <div className="p100-backpack-setup" data-ready={backpackReady}>
          <header>
            <div>
              <span><Backpack /> Ryggsäcksbelastning</span>
              <strong>
                {backpackEstimate.estimatedKg > 0
                  ? `${backpackEstimate.estimatedKg.toLocaleString("sv-SE")} kg ${backpackEstimate.confidence === "measured" ? "uppmätt" : "uppskattad"}`
                  : "Ange lasten"}
              </strong>
            </div>
            <em>{backpackReady ? <><ShieldCheck /> Klar att använda</> : "Inte säkerhetsgodkänd ännu"}</em>
          </header>
          <div className="p100-backpack-fields">
            <label><span>Vatten (liter)</span><input inputMode="decimal" value={waterLiters} onChange={(event) => setWaterLiters(event.target.value)} placeholder="t.ex. 4" /></label>
            <label><span>Väskans vikt (kg)</span><input inputMode="decimal" value={bagWeightKg} onChange={(event) => setBagWeightKg(event.target.value)} placeholder="valfritt" /></label>
            <label><span>Uppmätt totalvikt</span><input inputMode="decimal" value={measuredTotalKg} onChange={(event) => setMeasuredTotalKg(event.target.value)} placeholder="om du vägt den" /></label>
            <label>
              <span>Bärposition</span>
              <select value={carryPosition} onChange={(event) => setCarryPosition(event.target.value as BackpackCarryPosition)}>
                <option value="back">På ryggen</option>
                <option value="front_hug">Kramad framför kroppen</option>
                <option value="goblet_hold">Goblet-grepp</option>
                <option value="other">Annan placering</option>
              </select>
            </label>
          </div>
          <div className="p100-backpack-checks">
            {([
              ["contentsSecured", "Flaskorna kan inte förskjutas"],
              ["closuresClosed", "Alla stängningar är stängda"],
              ["seamsAndStrapsIntact", "Sömmar och remmar är hela"],
              ["canReleaseSafely", "Jag kan släppa eller ta av lasten säkert"],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <input type="checkbox" checked={backpackSafety[key]} onChange={() => toggleSafety(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p>
            Kameran uppskattar aldrig vikten. Ryggsäcken tas bara med i förslagen när vikt och alla säkerhetspunkter är bekräftade.
          </p>
        </div>
      ) : null}

      </details>
      {canWarmUpOnBike ? (
        <CyclingWarmup missionId={missionId} onComplete={() => {
          markCyclingWarmupComplete(missionId);
          setWarmupDismissed(true);
        }} />
      ) : null}

      {!canWarmUpOnBike && nextGroup && nextRecommendation && nextVariation ? (
        <section className="p100-next-training-step" aria-labelledby="p100-next-training-step-title">
          <div>
            <span>Steg 2 · Styrka</span>
            <h4 id="p100-next-training-step-title">{nextVariation.name}</h4>
            <p>
              Set {(nextRequirement?.targetSets ?? 3) - (nextRequirement?.remainingSets ?? 3) + 1} av {nextRequirement?.targetSets ?? 3} · mål {nextRequirement?.targetReps ?? 10} {nextTrackingId === "plank" ? "sek" : "reps"}.
              {nextLaunchHref
                ? " Kameran hjälper dig att räkna och setet sparas när du bekräftar det."
                : " Genomför setet och bekräfta sedan reps och ansträngning."}
            </p>
          </div>
          <div className="p100-next-training-actions">
            {nextLaunchHref ? (
              <Link href={nextLaunchHref}><Camera /> Starta med kamera</Link>
            ) : null}
            <button
              type="button"
              onClick={() => openManualSet(
                nextRecommendation.familyId,
                nextGroup.movementPattern,
                nextVariation,
                nextRequirement?.targetReps ?? 10,
              )}
            ><Save /> {nextLaunchHref ? "Gör utan kamera" : "Starta set"}</button>
          </div>
          <small>Motion Lab öppnas i samma flik. Efter sparat set går du tillbaka till dagens uppdrag.</small>
        </section>
      ) : null}

      <details className="p100-block-details">
        <summary>Visa hela planen och andra alternativ</summary>
        <div className="p100-block-recommendations">
        {remainingRecommendations.length === 0 ? (
          <p className="p100-block-planner-done">Alla rörelsemönster i dagens uppdrag är redan täckta.</p>
        ) : remainingRecommendations.map((group) => {
          const requirement = remainingPatterns.get(group.movementPattern);
          return (
            <article key={group.movementPattern}>
              <header>
                <div>
                  <span>{group.label}</span>
                  <strong>{requirement?.remainingSets} set återstår</strong>
                </div>
              </header>
              {group.recommendations.length === 0 ? (
                <p>Ingen Core 24-övning passar den valda miljön och utrustningen. Byt miljö, lägg till utrustning eller logga manuellt.</p>
              ) : (
                <div className="p100-block-options">
                  {group.recommendations.slice(0, 2).map((recommendation) => {
                    const startingVariations = recommendation.availableVariations
                      .filter((variation) => variation.difficulty <= 3)
                      .slice(0, 3);
                    return (
                      <section key={recommendation.familyId}>
                        <div>
                          <strong>{recommendation.name}</strong>
                          <span data-tier={recommendation.qualityTier}>{qualityLabels[recommendation.qualityTier]}</span>
                          <em>{recommendation.utilityScore}/100 nytta</em>
                        </div>
                        {startingVariations.length > 0 ? (
                          <div className="p100-block-variations">
                            {startingVariations.map((variation) => {
                              const trackingId = getCore24MissionTrackingId(recommendation.familyId, variation.id);
                              const usesBackpack = variation.equipment.includes("loaded_backpack");
                              const launchHref = trackingId ? buildMotionMissionLaunchHref({
                                missionId,
                                familyId: recommendation.familyId as MotionMissionLaunch["familyId"],
                                variationId: variation.id,
                                exerciseId: trackingId,
                                exerciseName: variation.name,
                                movementPattern: group.movementPattern,
                                environment,
                                targetReps: requirement?.targetReps ?? 10,
                                targetDurationSeconds: trackingId === "plank" ? requirement?.targetReps ?? 30 : null,
                                weightKg: usesBackpack ? backpackEstimate.estimatedKg : null,
                                backpackCarryPosition: usesBackpack ? carryPosition : null,
                              }) : null;
                              return (
                                <div key={variation.id}>
                                  <span>{variation.name}</span>
                                  <div>
                                    {launchHref ? <Link href={launchHref}><Camera /> Motion Lab</Link> : null}
                                    <button
                                      type="button"
                                      onClick={() => openManualSet(
                                        recommendation.familyId,
                                        group.movementPattern,
                                        variation,
                                        requirement?.targetReps ?? 10,
                                      )}
                                    ><Save /> Logga set</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : <small>Personlig progression behöver kalibreras först</small>}
                        <p>{recommendation.reasons[1]} {recommendation.reasons[2]}</p>
                      </section>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
        </div>
      </details>

      {manualDraft ? (
        <div className="p100-manual-set" role="dialog" aria-modal="true" aria-labelledby="p100-manual-set-title">
          <div>
            <header>
              <div><span>Manuell registrering</span><strong id="p100-manual-set-title">{manualDraft.exerciseName}</strong></div>
              <button type="button" aria-label="Stäng" onClick={() => setManualDraft(null)}><X /></button>
            </header>
            <div className="p100-manual-set-fields">
              <label><span>Repetitioner</span><input inputMode="numeric" value={manualDraft.reps} onChange={(event) => setManualDraft({ ...manualDraft, reps: event.target.value })} /></label>
              <label><span>Hålltid (sek)</span><input inputMode="numeric" value={manualDraft.durationSeconds} onChange={(event) => setManualDraft({ ...manualDraft, durationSeconds: event.target.value })} /></label>
              <label><span>RPE 1–10</span><input inputMode="decimal" value={manualDraft.rpe} onChange={(event) => setManualDraft({ ...manualDraft, rpe: event.target.value })} placeholder="valfritt" /></label>
            </div>
            <label className="p100-manual-rom">
              <input
                type="checkbox"
                checked={manualDraft.controlledRom}
                onChange={(event) => setManualDraft({ ...manualDraft, controlledRom: event.target.checked })}
              />
              <span>Jag använde ett kontrollerat rörelseomfång som passar övningen</span>
            </label>
            {manualDraft.variation.equipment.includes("loaded_backpack") ? (
              <p>Belastning: {backpackEstimate.estimatedKg.toLocaleString("sv-SE")} kg · {carryPosition}</p>
            ) : null}
            {manualError ? <p className="p100-form-error" role="alert">{manualError}</p> : null}
            <footer>
              <button type="button" onClick={() => setManualDraft(null)}>Avbryt</button>
              <button type="button" disabled={savingManual} onClick={saveManualSet}><Save /> {savingManual ? "Sparar…" : "Spara set"}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
