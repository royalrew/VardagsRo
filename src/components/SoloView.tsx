"use client";

import {
  Activity,
  Bike,
  BookOpen,
  Camera,
  ChevronRight,
  CircleCheck,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Leaf,
  Moon,
  Mountain,
  Plus,
  Scale,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { readNumber, type SoloProgressView } from "@/components/solo-contracts";
import { isoWeekNumberForCalendarDate } from "@/lib/dates";

const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "long" });

async function failureFrom(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

function WeightChart({ progress }: { progress: SoloProgressView }) {
  const points = progress.recentHealthDays
    .filter((day) => day.weightKg !== null)
    .slice()
    .reverse()
    .slice(-8);
  const startWeight = points[0]?.weightKg ?? progress.summary.weightKg ?? 80;
  const currentWeight = progress.summary.weightKg ?? startWeight;
  const goalWeight = progress.settings.weightGoalKg ?? 100;
  const values = points.map((point) => point.weightKg as number);
  const min = Math.min(startWeight, ...values) - 1;
  const max = Math.max(goalWeight, ...values) + 1;
  const plotted =
    points.length > 1
      ? points
      : [
          { date: progress.today, weightKg: startWeight },
          { date: progress.today, weightKg: currentWeight },
        ];
  const line = plotted
    .map((point, index) => {
      const x = 7 + (index / Math.max(1, plotted.length - 1)) * 86;
      const y = 80 - (((point.weightKg as number) - min) / (max - min)) * 60;
      return `${x},${y}`;
    })
    .join(" ");
  const completed = Math.max(
    0,
    Math.min(
      100,
      ((currentWeight - startWeight) / (goalWeight - startWeight || 1)) * 100,
    ),
  );

  return (
    <section className="hq-card hq-weight-card">
      <div className="hq-card-head">
        <div>
          <span className="hq-kicker">Viktresan</span>
          <h3>Mot {goalWeight} kg</h3>
        </div>
        <span className="hq-pill">
          <Activity size={14} /> Pågående
        </span>
      </div>
      <div className="hq-weight-numbers">
        <div><strong>{currentWeight.toFixed(1)}</strong><span>kg idag</span></div>
        <div><strong>{Math.max(0, goalWeight - currentWeight).toFixed(1)}</strong><span>kg kvar</span></div>
        <div><strong>{Math.round(completed)}%</strong><span>av resan</span></div>
      </div>
      <div className="hq-chart" aria-label={`Viktutveckling mot ${goalWeight} kilo`}>
        <div className="hq-goal-line"><span>{goalWeight} kg</span></div>
        <svg viewBox="0 0 100 90" preserveAspectRatio="none" role="img">
          <defs>
            <linearGradient id="weightArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c8f45d" stopOpacity=".25" />
              <stop offset="100%" stopColor="#c8f45d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`7,82 ${line} 93,82`} fill="url(#weightArea)" />
          <polyline
            points={line}
            fill="none"
            stroke="#c8f45d"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="hq-chart-axis"><span>Start</span><span>Idag</span></div>
      </div>
    </section>
  );
}

function TodayForm({
  progress,
  onSaved,
  onClose,
}: {
  progress: SoloProgressView;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const current = progress.healthToday;
  const [weight, setWeight] = useState(current?.weightKg?.toString() ?? "");
  const [sleep, setSleep] = useState(current?.sleepHours?.toString() ?? "");
  const [workouts, setWorkouts] = useState(String(current?.workouts ?? 0));
  const [energy, setEnergy] = useState(current?.energy ?? 3);
  const [dietHeld, setDietHeld] = useState<boolean | null>(current?.dietHeld ?? null);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/solo/health", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: progress.today,
          sleepHours: readNumber(sleep, "Sömnen"),
          workouts: readNumber(workouts, "Träningspassen") ?? 0,
          weightKg: readNumber(weight, "Vikten"),
          energy,
          dietHeld,
          mobility: current?.mobility ?? null,
          note: note.trim() || null,
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Kunde inte spara dagen.");

      if (progress.settings.weightGoalKg !== 100) {
        const settings = await fetch("/api/solo/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weightGoalKg: 100 }),
        });
        if (!settings.ok) throw await failureFrom(settings, "Kunde inte spara målet.");
      }
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hq-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="hq-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><span className="hq-kicker">Dagens check-in</span><h2 id="today-title">Logga dagen</h2></div>
          <button type="button" onClick={onClose} aria-label="Stäng"><X /></button>
        </header>
        <form onSubmit={submit}>
          <div className="hq-form-grid">
            <label><span><Scale size={16} /> Vikt</span><div className="hq-input-unit"><input value={weight} inputMode="decimal" placeholder="80,0" onChange={(event) => setWeight(event.target.value)} /><b>kg</b></div></label>
            <label><span><Moon size={16} /> Sömn</span><div className="hq-input-unit"><input value={sleep} inputMode="decimal" placeholder="7,5" onChange={(event) => setSleep(event.target.value)} /><b>tim</b></div></label>
            <label><span><Dumbbell size={16} /> Träningspass</span><div className="hq-input-unit"><input value={workouts} type="number" min={0} max={10} onChange={(event) => setWorkouts(event.target.value)} /><b>st</b></div></label>
          </div>
          <fieldset className="hq-choice">
            <legend>Energi idag</legend>
            <div>{[1, 2, 3, 4, 5].map((step) => <button key={step} type="button" className={energy === step ? "active" : ""} onClick={() => setEnergy(step)}>{step}</button>)}</div>
          </fieldset>
          <fieldset className="hq-choice hq-choice-wide">
            <legend>Har kosten stöttat målet idag?</legend>
            <div><button type="button" className={dietHeld === true ? "active" : ""} onClick={() => setDietHeld(true)}>Ja, absolut</button><button type="button" className={dietHeld === false ? "active" : ""} onClick={() => setDietHeld(false)}>Inte idag</button></div>
          </fieldset>
          <label className="hq-note-label">
            <span><BookOpen size={16} /> Dagboksanteckning</span>
            <textarea maxLength={500} rows={4} value={note} placeholder="Hur kändes kroppen? Vad fungerade? Vad tar du med dig till imorgon?" onChange={(event) => setNote(event.target.value)} />
            <small>{note.length}/500</small>
          </label>
          {error ? <p className="hq-error">{error}</p> : null}
          <div className="hq-modal-actions"><button type="button" className="hq-secondary" onClick={onClose}>Avbryt</button><button type="submit" className="hq-primary" disabled={busy}>{busy ? "Sparar…" : "Spara dagen"}</button></div>
        </form>
      </div>
    </div>
  );
}

const week = [
  { day: "MÅN", label: "Styrka", Icon: Dumbbell },
  { day: "TIS", label: "Löpning", Icon: Footprints },
  { day: "ONS", label: "Vila", Icon: Moon },
  { day: "TOR", label: "Utegym", Icon: Mountain },
  { day: "FRE", label: "Cykel", Icon: Bike },
  { day: "LÖR", label: "Styrka", Icon: Dumbbell },
  { day: "SÖN", label: "Skogen", Icon: Leaf },
];

export function SoloView({
  initialProgress = null,
  initialOpenLog = false,
}: {
  initialProgress?: SoloProgressView | null;
  initialOpenLog?: boolean;
}) {
  const [progress, setProgress] = useState<SoloProgressView | null>(initialProgress);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(initialOpenLog);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/solo");
      if (!response.ok) throw new Error("Kunde inte hämta din resa.");
      const body = (await response.json()) as { progress: SoloProgressView };
      setProgress(body.progress);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    }
  }, []);

  useEffect(() => {
    if (initialProgress) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [initialProgress, load]);

  if (error) return <p className="hq-loading hq-error">{error}</p>;
  if (!progress) return <div className="hq-loading"><span /><p>Jarvis hämtar din resa…</p></div>;

  const currentWeight = progress.summary.weightKg ?? 80;
  const workoutsThisWeek = progress.recentHealthDays
    .slice(0, 7)
    .reduce((sum, day) => sum + day.workouts, 0);
  const loggedThisWeek = progress.recentHealthDays.slice(0, 7).length;

  return (
    <div className="solo-hq">
      <main>
        <section className="hq-hero">
          <div>
            <p className="hq-kicker">{weekday.format(new Date(`${progress.today}T12:00:00`)).toUpperCase()} · RESAN MOT 100 KG</p>
            <h1>Bygg kroppen.<br /><em>Dokumentera resan.</em></h1>
            <p>Från {currentWeight.toFixed(1)} till 100 kg — ett pass, en måltid och en dag i taget.</p>
          </div>
          <div className="hq-hero-actions">
            <button className="hq-primary" onClick={() => setLogging(true)}><Plus size={19} /> Logga idag</button>
            <Link className="hq-camera" href="/projekt-100/media"><Camera size={19} /> Lägg till bild</Link>
          </div>
        </section>

        <section className="hq-metrics">
          <article><span className="hq-icon"><Scale /></span><div><small>NUVARANDE VIKT</small><strong>{currentWeight.toFixed(1)} <i>kg</i></strong><span className="hq-trend">{progress.summary.weightTrendKg === null ? "Startvärde" : `${progress.summary.weightTrendKg >= 0 ? "+" : ""}${progress.summary.weightTrendKg} kg senaste tiden`}</span></div></article>
          <article><span className="hq-icon"><Dumbbell /></span><div><small>PASS DENNA VECKA</small><strong>{workoutsThisWeek} <i>/ 5</i></strong><span>{Math.max(0, 5 - workoutsThisWeek)} pass kvar</span></div></article>
          <article><span className="hq-icon"><Flame /></span><div><small>LOGGADE DAGAR</small><strong>{loggedThisWeek} <i>/ 7</i></strong><span>Minne byggs av ärliga dagar</span></div></article>
          <article><span className="hq-icon"><Zap /></span><div><small>ENERGI IDAG</small><strong>{progress.healthToday?.energy ?? "—"} <i>/ 5</i></strong><span>{progress.healthToday ? "Dagen är loggad" : "Väntar på check-in"}</span></div></article>
        </section>

        <div className="hq-dashboard-grid">
          <WeightChart progress={progress} />
          <section className="hq-card hq-focus-card">
            <div className="hq-card-head"><div><span className="hq-kicker">VECKA {isoWeekNumberForCalendarDate(progress.today)}</span><h3>Veckans fokus</h3></div><Link href="/projekt-100/schema" aria-label="Visa veckoplan"><ChevronRight /></Link></div>
            <div className="hq-week">
              {week.map(({ day, label, Icon }, index) => {
                const done = index < workoutsThisWeek;
                const active = index === workoutsThisWeek;
                return <div key={day} className={`${done ? "done" : ""} ${active ? "active" : ""}`}><span>{day}</span><i>{done ? <CircleCheck /> : <Icon />}</i><b>{label}</b></div>;
              })}
            </div>
            <div className="hq-week-progress"><span style={{ width: `${Math.min(100, (workoutsThisWeek / 5) * 100)}%` }} /></div>
            <p>{workoutsThisWeek} av 5 pass genomförda <b>— fortsätt bygga.</b></p>
          </section>
        </div>

        <section className="hq-jarvis-strip">
          <span><HeartPulse /></span>
          <div><small>JARVIS · DAGLIG ANALYS</small><p>{progress.healthToday ? `Dagen är fångad. ${progress.healthToday.workouts > 0 ? "Träningen är gjord" : "Nästa bästa steg är rörelse"} — håll kvällens beslut enkelt.` : "Du har inte loggat idag ännu. Ge mig vikt, energi och några ärliga rader så bygger vi minnet tillsammans."}</p></div>
          <button onClick={() => setLogging(true)}>Öppna check-in <ChevronRight size={16} /></button>
        </section>
      </main>
      {logging ? <TodayForm progress={progress} onSaved={load} onClose={() => setLogging(false)} /> : null}
    </div>
  );
}
