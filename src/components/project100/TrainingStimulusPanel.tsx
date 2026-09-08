import { Activity, AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";

import type {
  Project100StimulusArea,
  Project100StimulusLevel,
  Project100TrainingStimulusAssessment,
} from "@/lib/project100-training-stimulus";

const icons: Record<Project100StimulusLevel, typeof Activity> = {
  not_assessable: CircleHelp,
  light: Activity,
  likely_sufficient: CheckCircle2,
  high_load: AlertTriangle,
};

function evidenceText(area: Project100StimulusArea): string {
  const evidence = area.evidence;
  const work = evidence.totalReps > 0
    ? `${evidence.totalReps} reps${evidence.externalVolumeKg !== null && evidence.externalVolumeKg > 0
        ? ` · ${evidence.externalVolumeKg.toLocaleString("sv-SE")} kg extern volym`
        : ""}`
    : evidence.totalHoldSeconds > 0
      ? `${evidence.totalHoldSeconds} sek hålltid`
      : "ingen mängd";
  const effort = evidence.averageRpe === null
    ? "RPE saknas"
    : `RPE ${evidence.averageRpe.toLocaleString("sv-SE")} · cirka ${evidence.estimatedRir?.toLocaleString("sv-SE")} RIR`;
  const rom = evidence.averageRomConfidence === null
    ? "ROM-confidence saknas"
    : `ROM-confidence ${Math.round(evidence.averageRomConfidence * 100)}%`;
  return `${evidence.relevantSets} set · ${work} · ${effort} · ${rom} · ${evidence.priorWeeklySets} tidigare veckoset · ${evidence.weeklySetsIncludingToday} inklusive idag`;
}

export function TrainingStimulusPanel({
  assessment,
}: {
  assessment: Project100TrainingStimulusAssessment;
}) {
  const OverallIcon = icons[assessment.level];
  return (
    <section className="p100-stimulus" data-level={assessment.level} aria-labelledby="p100-stimulus-title">
      <header>
        <div>
          <span><Activity /> Muskelbyggande stimulans</span>
          <h3 id="p100-stimulus-title">{assessment.label}</h3>
          <p>{assessment.explanation}</p>
        </div>
        <em><OverallIcon /> Separat från plantäckning</em>
      </header>
      <div className="p100-stimulus-areas">
        {assessment.areas.map((area) => {
          const Icon = icons[area.level];
          return (
            <article key={area.movementPattern} data-level={area.level}>
              <header>
                <div>
                  <span>{area.label}</span>
                  <strong>{area.muscleGroupLabel}</strong>
                </div>
                <em><Icon /> {area.level === "not_assessable" ? "Obedömbart" : area.level === "light" ? "Lätt" : area.level === "likely_sufficient" ? "Troligen tillräckligt" : "Hög belastning"}</em>
              </header>
              <p>{area.explanation}</p>
              <small>{evidenceText(area)}</small>
              {area.evidence.dataGaps.length > 0 ? (
                <ul>{area.evidence.dataGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
              ) : null}
            </article>
          );
        })}
      </div>
      <footer>{assessment.disclaimer}</footer>
    </section>
  );
}
