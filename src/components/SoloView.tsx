"use client";

import { Flame, Lock, Plus, Shield, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SOLO_ACTION_RULES,
  soloActionRule,
  type SoloAction,
  type SoloActionKind,
} from "@/lib/solo";
import { SOLO_BRANCHES, type SoloTalentNode } from "@/lib/solo-talents";
import {
  readNumber,
  type SoloProgressView,
} from "@/components/solo-contracts";

const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A saved form that looks exactly like an unsaved one reads as a failure. The
 * time is part of the receipt on purpose: pressing save again changes it, so
 * the second attempt is visibly a second attempt rather than silence twice.
 */
function Receipt({ at, children }: { at: string | null; children: string }) {
  if (at === null) return null;
  return (
    <p className="solo-saved" role="status">
      {children} kl. {at}
    </p>
  );
}

function formatOre(ore: number): string {
  return `${number.format(Math.round(ore / 100))} kr`;
}

async function failureFrom(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

function progressLabel(node: SoloTalentNode): string {
  switch (node.unit) {
    case "ore":
      return `${formatOre(node.progress)} av ${formatOre(node.target)}`;
    case "percent":
      return `${node.progress} av ${node.target}`;
    case "weeks":
      return `${node.progress} av ${node.target} veckor`;
    default:
      return `${node.progress} av ${node.target}`;
  }
}

function Meter({
  label,
  value,
  max,
  caption,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  caption: string;
  tone: "boss" | "level" | "stat";
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`solo-meter solo-meter-${tone}`}>
      <div className="solo-meter-head">
        <span>{label}</span>
        <span className="solo-meter-caption">{caption}</span>
      </div>
      <div
        className="solo-meter-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="solo-meter-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TalentNode({ node }: { node: SoloTalentNode }) {
  return (
    <div className={`solo-node solo-node-${node.state}`}>
      <button type="button" className="solo-node-face">
        {node.state === "locked" ? (
          <Lock size={14} aria-hidden />
        ) : (
          <span className="solo-node-initial">{node.title.slice(0, 1)}</span>
        )}
        <span className="solo-node-title">{node.title}</span>
      </button>
      <div className="solo-node-tip" role="tooltip">
        <strong>{node.title}</strong>
        <span className="solo-node-req">{node.requirement}</span>
        <span className="solo-node-meaning">{node.meaning}</span>
        <span className="solo-node-progress">
          {node.state === "unlocked" ? "Öppnad" : progressLabel(node)}
        </span>
        {node.how.length === 0 ? null : (
          <ul className="solo-how">
            {node.how.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TalentTree({ nodes }: { nodes: SoloTalentNode[] }) {
  return (
    <div className="solo-tree">
      {SOLO_BRANCHES.map((branch) => {
        const inBranch = nodes.filter((node) => node.branch === branch.id);
        const tiers = [...new Set(inBranch.map((node) => node.tier))].sort(
          (left, right) => left - right,
        );
        return (
          <section key={branch.id} className="solo-branch">
            <header>
              <h3>{branch.title}</h3>
              <p>{branch.purpose}</p>
            </header>
            {tiers.map((tier) => (
              <div key={tier} className="solo-tier">
                {inBranch
                  .filter((node) => node.tier === tier)
                  .map((node) => (
                    <TalentNode key={node.id} node={node} />
                  ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ActionForm({
  today,
  onLogged,
}: {
  today: string;
  onLogged: () => void;
}) {
  const [kind, setKind] = useState<SoloActionKind>("application_sent");
  const [occurredOn, setOccurredOn] = useState(today);
  const [evidence, setEvidence] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedXp, setSavedXp] = useState(0);

  const rule = soloActionRule(kind);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSavedAt(null);
    const kronor = Number(amount.replace(/\s/g, "").replace(",", "."));
    const amountOre =
      rule.amount === "none" || amount.trim() === ""
        ? null
        : Math.round(kronor * 100);
    try {
      const response = await fetch("/api/solo/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, occurredOn, evidence, amountOre }),
      });
      if (!response.ok) throw await failureFrom(response, "Kunde inte spara.");
      setEvidence("");
      setAmount("");
      setSavedXp(rule.xp);
      setSavedAt(clock.format(new Date()));
      onLogged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="solo-form" onSubmit={submit}>
      <h3>
        <Plus size={15} aria-hidden /> Logga något som lämnat datorn
      </h3>
      <label>
        Vad hände
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as SoloActionKind)}
        >
          {SOLO_ACTION_RULES.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label} · {option.xp} XP
            </option>
          ))}
        </select>
      </label>
      <label>
        Datum
        <input
          type="date"
          value={occurredOn}
          max={today}
          onChange={(event) => setOccurredOn(event.target.value)}
        />
      </label>
      <label>
        Bevis
        <input
          type="text"
          value={evidence}
          placeholder={rule.evidenceHint}
          onChange={(event) => setEvidence(event.target.value)}
          required
          minLength={3}
        />
      </label>
      {rule.amount === "none" ? null : (
        <label>
          Belopp i kronor{rule.amount === "required" ? "" : " (valfritt)"}
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required={rule.amount === "required"}
          />
        </label>
      )}
      {error ? <p className="solo-error">{error}</p> : null}
      <Receipt at={savedAt}>{`Loggat, +${savedXp} XP`}</Receipt>
      <button type="submit" disabled={busy}>
        {busy ? "Sparar…" : `Logga för ${rule.xp} XP`}
      </button>
    </form>
  );
}

function HealthForm({
  today,
  current,
  settings,
  onSaved,
}: {
  today: string;
  current: SoloProgressView["healthToday"];
  settings: SoloProgressView["settings"];
  onSaved: () => void;
}) {
  const [sleep, setSleep] = useState(current?.sleepHours?.toString() ?? "");
  const [workouts, setWorkouts] = useState(String(current?.workouts ?? 0));
  const [weight, setWeight] = useState(current?.weightKg?.toString() ?? "");
  const [energy, setEnergy] = useState(current?.energy ?? 0);
  const [dietHeld, setDietHeld] = useState<boolean | null>(
    current?.dietHeld ?? null,
  );
  const [mobility, setMobility] = useState<boolean | null>(
    current?.mobility ?? null,
  );
  const [weightGoal, setWeightGoal] = useState(
    settings.weightGoalKg?.toString() ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSavedAt(null);
    try {
      const response = await fetch("/api/solo/health", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: today,
          sleepHours: readNumber(sleep, "Sömnen"),
          workouts: readNumber(workouts, "Träningspassen") ?? 0,
          weightKg: readNumber(weight, "Vikten"),
          energy: energy === 0 ? null : energy,
          dietHeld,
          mobility,
          note: null,
        }),
      });
      if (!response.ok) {
        throw await failureFrom(response, "Kunde inte spara dagen.");
      }

      // The goal describes a body rather than a day, so it is only written when
      // it actually changed.
      const goal = readNumber(weightGoal, "Viktmålet");
      if (goal !== settings.weightGoalKg) {
        const saved = await fetch("/api/solo/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weightGoalKg: goal }),
        });
        if (!saved.ok) {
          throw await failureFrom(saved, "Kunde inte spara viktmålet.");
        }
      }
      setSavedAt(clock.format(new Date()));
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="solo-form" onSubmit={submit}>
      <h3>Dagen i dag</h3>
      <p className={current ? "solo-logged" : "solo-unlogged"}>
        {current ? "Loggad. Spara igen för att ändra." : "Inte loggad än."}
      </p>
      <label>
        Sömn i natt, timmar
        <input
          type="text"
          inputMode="decimal"
          value={sleep}
          onChange={(event) => setSleep(event.target.value)}
        />
      </label>
      <label>
        Träningspass i dag
        <input
          type="number"
          min={0}
          max={10}
          value={workouts}
          onChange={(event) => setWorkouts(event.target.value)}
        />
        <small>Femton minuter räknas. En promenad räknas.</small>
      </label>
      <fieldset className="solo-scale">
        <legend>Rörlighet för ryggen</legend>
        <button
          type="button"
          className={mobility === true ? "active" : ""}
          onClick={() => setMobility(true)}
          aria-pressed={mobility === true}
        >
          Ja
        </button>
        <button
          type="button"
          className={mobility === false ? "active" : ""}
          onClick={() => setMobility(false)}
          aria-pressed={mobility === false}
        >
          Nej
        </button>
      </fieldset>
      <label>
        Vikt i kg (valfritt)
        <input
          type="text"
          inputMode="decimal"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
        />
      </label>
      <label>
        Viktmål i kg
        <input
          type="text"
          inputMode="decimal"
          value={weightGoal}
          onChange={(event) => setWeightGoal(event.target.value)}
        />
        <small>Utan mål har vikten ingen riktning att mätas mot.</small>
      </label>
      <fieldset className="solo-scale">
        <legend>Energi i kväll</legend>
        {[1, 2, 3, 4, 5].map((step) => (
          <button
            key={step}
            type="button"
            className={energy === step ? "active" : ""}
            onClick={() => setEnergy(step)}
            aria-pressed={energy === step}
          >
            {step}
          </button>
        ))}
      </fieldset>
      <fieldset className="solo-scale">
        <legend>Höll kosten</legend>
        <button
          type="button"
          className={dietHeld === true ? "active" : ""}
          onClick={() => setDietHeld(true)}
          aria-pressed={dietHeld === true}
        >
          Ja
        </button>
        <button
          type="button"
          className={dietHeld === false ? "active" : ""}
          onClick={() => setDietHeld(false)}
          aria-pressed={dietHeld === false}
        >
          Nej
        </button>
      </fieldset>
      {error ? <p className="solo-error">{error}</p> : null}
      <Receipt at={savedAt}>Dagen sparad</Receipt>
      <button type="submit" disabled={busy}>
        {busy ? "Sparar…" : "Spara dagen"}
      </button>
    </form>
  );
}

function RecentLog({
  actions,
  onChanged,
}: {
  actions: SoloAction[];
  onChanged: () => void;
}) {
  async function remove(id: string) {
    // A ledger that cannot be corrected stops being believed, so a mistyped
    // entry is removable without ceremony.
    if (!window.confirm("Ta bort posten?")) return;
    await fetch(`/api/solo/actions/${id}`, { method: "DELETE" });
    onChanged();
  }

  if (actions.length === 0) {
    return (
      <section className="solo-log">
        <h3>Loggen</h3>
        <p>Tom. Den första posten är alltid den dyraste.</p>
      </section>
    );
  }

  return (
    <section className="solo-log">
      <h3>Loggen</h3>
      <ul>
        {actions.map((action) => (
          <li key={action.id}>
            <span className="solo-log-date">{action.occurredOn}</span>
            <span className="solo-log-kind">
              {soloActionRule(action.kind).label}
            </span>
            <span className="solo-log-evidence">{action.evidence}</span>
            {action.amountOre === null ? null : (
              <span className="solo-log-amount">
                {formatOre(action.amountOre)}
              </span>
            )}
            <span className="solo-log-xp">+{action.xp}</span>
            <button
              type="button"
              onClick={() => void remove(action.id)}
              aria-label={`Ta bort posten från ${action.occurredOn}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SoloView() {
  const [progress, setProgress] = useState<SoloProgressView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/solo");
      if (!response.ok) throw new Error("Kunde inte hämta ditt spår.");
      const body = (await response.json()) as { progress: SoloProgressView };
      setProgress(body.progress);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    }
  }, []);

  useEffect(() => {
    // Reading the ledger is exactly the case the rule carves out: state
    // arrives from an external system, and never synchronously. Every setState
    // below happens after the request has come back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const unlocked = useMemo(
    () =>
      progress?.talents.filter((node) => node.state === "unlocked").length ?? 0,
    [progress],
  );

  if (error) return <p className="solo-error">{error}</p>;
  if (!progress) return <p className="solo-loading">Hämtar ditt spår…</p>;

  const { summary, talents } = progress;
  const health = summary.stats.health;

  return (
    <div className="solo">
      <header className="solo-head">
        <div>
          <p className="solo-eyebrow">Nivå {summary.level.level}</p>
          <h2>{summary.boss.label}</h2>
          <p className="solo-sub">{summary.boss.description}</p>
        </div>
        <div className="solo-badges">
          <span title="Veckor i rad med full kvot">
            <Flame size={14} aria-hidden /> {summary.streak.weeks} v
          </span>
          {summary.streak.shieldReady ? (
            <span title="En missad vecka förlåts">
              <Shield size={14} aria-hidden /> Sköld
            </span>
          ) : null}
          <span title="Öppnade noder">
            <Target size={14} aria-hidden /> {unlocked}/{talents.length}
          </span>
        </div>
      </header>

      <Meter
        tone="boss"
        label={`Bossen: ${summary.boss.label}`}
        value={summary.boss.incomeOre}
        max={summary.boss.targetOre}
        caption={`${formatOre(summary.boss.incomeOre)} av ${formatOre(summary.boss.targetOre)} senaste 30 dagarna`}
      />
      <Meter
        tone="level"
        label={`Nivå ${summary.level.level}`}
        value={summary.level.into}
        max={summary.level.span}
        caption={`${summary.level.into} / ${summary.level.span} XP till nivå ${summary.level.level + 1}`}
      />

      <div className="solo-stats">
        <Meter
          tone="stat"
          label="Karriär"
          value={summary.stats.career}
          max={100}
          caption={`${summary.stats.career} av 100`}
        />
        <Meter
          tone="stat"
          label="Ekonomi"
          value={summary.stats.economy}
          max={100}
          caption={`${summary.stats.economy} av 100`}
        />
        <Meter
          tone="stat"
          label="Hälsa"
          value={health ?? 0}
          max={100}
          caption={health === null ? "För få loggade dagar" : `${health} av 100`}
        />
      </div>

      {summary.pipelineOre > 0 ? (
        <p className="solo-pipeline">
          Ute men obetalt: {formatOre(summary.pipelineOre)}
        </p>
      ) : null}

      <section className="solo-quests">
        <h3>Nästa steg</h3>
        {progress.quests.length === 0 ? (
          <p>Veckan är körd. Inget mer krävs för att streaken ska hålla.</p>
        ) : (
          <ol>
            {progress.quests.map((quest) => (
              <li key={quest.id}>
                <strong>{quest.title}</strong>
                <span>{quest.detail}</span>
                {quest.how.length === 0 ? null : (
                  <ul className="solo-how">
                    {quest.how.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <TalentTree nodes={talents} />

      <div className="solo-forms">
        <ActionForm today={progress.today} onLogged={load} />
        <HealthForm
          today={progress.today}
          current={progress.healthToday}
          settings={progress.settings}
          onSaved={load}
        />
      </div>

      <RecentLog actions={progress.recentActions} onChanged={load} />

      <section className="solo-zero">
        <h3>Ger noll XP</h3>
        <ul>
          {progress.zeroXpActivities.map((activity) => (
            <li key={activity}>{activity}</li>
          ))}
        </ul>
        <p>
          Inte för att det är värdelöst, utan för att det aldrig har gett dig en
          krona. Bara det som en annan människa kan se räknas här.
        </p>
      </section>
    </div>
  );
}
