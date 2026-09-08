import { Check, Circle, Flag, MapPin } from "lucide-react";

import type {
  Project100LiveGateMissionAssessment,
  Project100TrainingLiveGateAssessment,
} from "@/lib/project100-training-live-gate";
import type { Project100TrainingEnvironment } from "@/lib/project100-training-mission";

const environmentLabels: Record<Project100TrainingEnvironment, string> = {
  home: "Hemma",
  outdoor_gym: "Utegym",
  grass: "Gräsmatta",
  forest: "Skog",
  gym: "Gym",
  other: "Annan",
};

function MissionGateCard({ mission }: { mission: Project100LiveGateMissionAssessment }) {
  return (
    <article data-passed={mission.passed}>
      <header>
        <div>
          <span>{mission.missionType === "upper" ? "Pass A" : "Pass B"}</span>
          <strong>{mission.label}</strong>
        </div>
        <em>{mission.passed ? <><Check /> Godkänd</> : <><Circle /> Väntar</>}</em>
      </header>
      <ul>
        {mission.checks.map((check) => (
          <li key={check.id} data-passed={check.passed}>
            {check.passed ? <Check /> : <Circle />}
            <span>{check.label}</span>
            <b>{check.actual}</b>
          </li>
        ))}
      </ul>
      {mission.environments.length > 0 ? (
        <p><MapPin /> {mission.environments.map((environment) => environmentLabels[environment]).join(" · ")}</p>
      ) : null}
      <footer>
        {mission.sessionDate ? <small>Bästa försök: {mission.sessionDate}</small> : <small>Inget uppdrag loggat ännu</small>}
        <span>{mission.nextAction}</span>
      </footer>
    </article>
  );
}

export function TrainingLiveGatePanel({
  assessment,
}: {
  assessment: Project100TrainingLiveGateAssessment;
}) {
  return (
    <section className="p100-live-gate" data-passed={assessment.passed} aria-labelledby="p100-live-gate-title">
      <header>
        <div>
          <span><Flag /> Sista verifieringen · K8</span>
          <h2 id="p100-live-gate-title">Live-gate: {assessment.passedMissionCount}/2 uppdrag godkända</h2>
          <p>{assessment.explanation}</p>
        </div>
        <em>{assessment.passed ? <><Check /> Verifierad</> : "Kod klar · livepass återstår"}</em>
      </header>
      <div className="p100-live-gate-grid">
        <MissionGateCard mission={assessment.missions.upper} />
        <MissionGateCard mission={assessment.missions.lower} />
      </div>
    </section>
  );
}
