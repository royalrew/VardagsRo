"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Beef,
  BookOpen,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  Info,
  Layers,
  Moon,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wheat,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
  type Project100InsightHighlight,
  type Project100InsightPeriodPreset,
  type Project100InsightsSummary,
  type Project100MetricDelta,
} from "@/lib/project100-insights";
import { MetricChart, type MetricChartPoint } from "@/components/project100/MetricChart";

const fullDate = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const shortDay = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
});

function formatDelta(delta: Project100MetricDelta, unit: string, invertGood = false) {
  if (delta.change === null) return null;
  const isZero = delta.change === 0;
  const isPositive = delta.change > 0;
  const isGood = invertGood ? !isPositive : isPositive;

  const sign = isPositive ? "+" : "";
  const pct = delta.changePercent !== null ? ` (${sign}${delta.changePercent}%)` : "";

  return (
    <span
      className={`p100-insight-delta ${
        isZero ? "neutral" : isGood ? "positive" : "negative"
      }`}
    >
      {isPositive ? <ArrowUpRight /> : isZero ? <ArrowRight /> : <ArrowDownRight />}
      {sign}
      {delta.change.toLocaleString("sv-SE")} {unit}
      {pct}
    </span>
  );
}

export function InsightsWorkspace({
  insights,
}: {
  insights: Project100InsightsSummary;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"weight" | "training" | "nutrition" | "recovery" | "table">("weight");

  function selectPeriod(preset: Project100InsightPeriodPreset) {
    router.push(`/projekt-100/insikter?period=${preset}`);
  }

  // Weight points for MetricChart
  const weightPoints: MetricChartPoint[] = insights.timeline
    .filter((t) => t.weightKg !== null)
    .map((t) => ({
      measuredOn: t.date,
      value: t.weightKg as number,
    }));

  return (
    <div className="p100-insights-workspace">
      <header className="p100-page-head p100-insights-head">
        <div>
          <span>Tvärfunktionell analys · Fas 6</span>
          <h1>Insikter & Utveckling</h1>
          <p>
            Spårbar sammanställning av träning, kost, kroppsmått och dagsform i relation till
            ditt verkliga jobbschema.
          </p>
        </div>
      </header>

      {/* Period selector */}
      <div className="p100-insights-controls">
        <nav className="p100-tab-nav" aria-label="Analysperiod">
          <button
            type="button"
            className={insights.period === "30d" ? "active" : ""}
            onClick={() => selectPeriod("30d")}
          >
            Senaste 30 dagarna
          </button>
          <button
            type="button"
            className={insights.period === "90d" ? "active" : ""}
            onClick={() => selectPeriod("90d")}
          >
            90 dagar
          </button>
          <button
            type="button"
            className={insights.period === "180d" ? "active" : ""}
            onClick={() => selectPeriod("180d")}
          >
            6 månader
          </button>
          <button
            type="button"
            className={insights.period === "year" ? "active" : ""}
            onClick={() => selectPeriod("year")}
          >
            Helår
          </button>
        </nav>
        <div className="p100-insights-range-badge">
          <Calendar />
          <span>
            {fullDate.format(new Date(`${insights.from}T12:00:00Z`))} –{" "}
            {fullDate.format(new Date(`${insights.to}T12:00:00Z`))}
          </span>
          <small>
            Jämfört med {shortDay.format(new Date(`${insights.compareFrom}T12:00:00Z`))} –{" "}
            {shortDay.format(new Date(`${insights.compareTo}T12:00:00Z`))}
          </small>
        </div>
      </div>

      {/* 4 Primary KPI Summary Cards */}
      <section className="p100-insights-kpi-grid" aria-label="Nyckeltal för perioden">
        {/* 1. Kropp & Vikt */}
        <article className="p100-insight-kpi-card">
          <header>
            <div>
              <small>Kroppsresa</small>
              <strong>Viktutveckling</strong>
            </div>
            <span>
              <Scale />
            </span>
          </header>
          <div className="p100-kpi-main">
            <b>
              {insights.body.endWeightKg !== null
                ? `${insights.body.endWeightKg.toLocaleString("sv-SE")} kg`
                : "Ingen vikt"}
            </b>
            {formatDelta(insights.body.weightDelta, "kg")}
          </div>
          <footer>
            <small>
              {insights.body.measurementCount > 0
                ? `${insights.body.measurementCount} invägningar (min ${insights.body.minWeightKg} · max ${insights.body.maxWeightKg} kg)`
                : "Inga vägningar under perioden"}
            </small>
          </footer>
        </article>

        {/* 2. Träning & Volym */}
        <article className="p100-insight-kpi-card">
          <header>
            <div>
              <small>Träning</small>
              <strong>Träningsvolym</strong>
            </div>
            <span>
              <Dumbbell />
            </span>
          </header>
          <div className="p100-kpi-main">
            <b>
              {insights.training.totalVolumeKg.current !== null
                ? `${Math.round(insights.training.totalVolumeKg.current / 1000).toLocaleString("sv-SE")} ton`
                : "0 kg"}
            </b>
            {formatDelta(insights.training.completedSessions, "pass")}
          </div>
          <footer>
            <small>
              {insights.training.completedSessions.current ?? 0} genomförda pass ·{" "}
              {Math.round((insights.training.totalMinutes.current ?? 0) / 60)} timmar
            </small>
          </footer>
        </article>

        {/* 3. Kost & Protein */}
        <article className="p100-insight-kpi-card">
          <header>
            <div>
              <small>Kost & Näring</small>
              <strong>Snittprotein</strong>
            </div>
            <span>
              <Beef />
            </span>
          </header>
          <div className="p100-kpi-main">
            <b>
              {insights.nutrition.averageProteinG.current !== null
                ? `${insights.nutrition.averageProteinG.current} g/dag`
                : "Ej loggat"}
            </b>
            {formatDelta(insights.nutrition.averageProteinG, "g")}
          </div>
          <footer>
            <small>
              {insights.nutrition.proteinTargetCoverageRate !== null
                ? `${Math.round(insights.nutrition.proteinTargetCoverageRate * 100)}% dagar nådde målet (${insights.nutrition.loggedDaysCount} loggade dagar)`
                : "Inga måltider loggade"}
            </small>
          </footer>
        </article>

        {/* 4. Sömn & Återhämtning */}
        <article className="p100-insight-kpi-card">
          <header>
            <div>
              <small>Återhämtning</small>
              <strong>Snittsömn</strong>
            </div>
            <span>
              <Moon />
            </span>
          </header>
          <div className="p100-kpi-main">
            <b>
              {insights.recovery.averageSleepHours.current !== null
                ? `${insights.recovery.averageSleepHours.current.toLocaleString("sv-SE")} h/natt`
                : "Ej loggat"}
            </b>
            {formatDelta(insights.recovery.averageSleepHours, "h")}
          </div>
          <footer>
            <small>
              {insights.recovery.loggedDaysCount > 0
                ? `${insights.recovery.loggedDaysCount} nätter loggade · Snittenergi ${insights.recovery.averageEnergy.current ?? "—"}/5`
                : "Inga dagboksanteckningar"}
            </small>
          </footer>
        </article>
      </section>

      {/* Highlights / Syntes */}
      {insights.highlights.length > 0 ? (
        <section className="p100-nutrition-panel p100-insights-highlights-panel">
          <header>
            <div>
              <span>Strukturerad sammanfattning</span>
              <h2>Viktiga mönster under perioden</h2>
            </div>
            <Sparkles />
          </header>
          <div className="p100-insights-highlights-list">
            {insights.highlights.map((h, index) => (
              <article key={index} className={`p100-highlight-card ${h.kind}`}>
                <div className="p100-highlight-icon">
                  {h.kind === "positive" ? (
                    <TrendingUp />
                  ) : h.kind === "neutral" ? (
                    <Info />
                  ) : (
                    <TrendingDown />
                  )}
                </div>
                <div>
                  <strong>{h.title}</strong>
                  <p>{h.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* Work vs Off Days Comparison Card */}
      <section className="p100-nutrition-panel p100-work-comparison-panel">
        <header>
          <div>
            <span>Schema & Belastning</span>
            <h2>Arbetsdagar vs Lediga dagar</h2>
          </div>
          <BriefcaseBusiness />
        </header>
        <div className="p100-work-comparison-grid">
          <article className="p100-work-stat-box work">
            <header>
              <BriefcaseBusiness />
              <strong>Arbetsdagar ({insights.workComparison.workDaysCount} st)</strong>
            </header>
            <dl>
              <div>
                <dt>Arbetad tid</dt>
                <dd>{insights.workComparison.workHoursTotal} timmar</dd>
              </div>
              <div>
                <dt>Träningsfrekvens</dt>
                <dd>
                  {insights.workComparison.sessionsOnWorkDays} pass (
                  {Math.round(insights.workComparison.sessionsOnWorkDaysRate * 100)}% av dagarna)
                </dd>
              </div>
              <div>
                <dt>Snittsömn</dt>
                <dd>
                  {insights.workComparison.averageSleepOnWorkDays !== null
                    ? `${insights.workComparison.averageSleepOnWorkDays.toLocaleString("sv-SE")} h`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Snittenergi</dt>
                <dd>
                  {insights.workComparison.averageEnergyOnWorkDays !== null
                    ? `${insights.workComparison.averageEnergyOnWorkDays}/5`
                    : "—"}
                </dd>
              </div>
            </dl>
          </article>

          <article className="p100-work-stat-box off">
            <header>
              <CheckCircle2 />
              <strong>Lediga dagar ({insights.workComparison.offDaysCount} st)</strong>
            </header>
            <dl>
              <div>
                <dt>Egentid / Vila</dt>
                <dd>Fri schemaläggning</dd>
              </div>
              <div>
                <dt>Träningsfrekvens</dt>
                <dd>
                  {insights.workComparison.sessionsOnOffDays} pass (
                  {Math.round(insights.workComparison.sessionsOnOffDaysRate * 100)}% av dagarna)
                </dd>
              </div>
              <div>
                <dt>Snittsömn</dt>
                <dd>
                  {insights.workComparison.averageSleepOnOffDays !== null
                    ? `${insights.workComparison.averageSleepOnOffDays.toLocaleString("sv-SE")} h`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Snittenergi</dt>
                <dd>
                  {insights.workComparison.averageEnergyOnOffDays !== null
                    ? `${insights.workComparison.averageEnergyOnOffDays}/5`
                    : "—"}
                </dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      {/* Interactive Charts & Detailed Tabs */}
      <section className="p100-nutrition-panel p100-insights-tabs-panel">
        <header className="p100-tabs-header">
          <div className="p100-filter-toggle">
            <button
              type="button"
              className={activeTab === "weight" ? "active" : ""}
              onClick={() => setActiveTab("weight")}
            >
              <Scale /> Vikt & Mått
            </button>
            <button
              type="button"
              className={activeTab === "training" ? "active" : ""}
              onClick={() => setActiveTab("training")}
            >
              <Dumbbell /> Träning & Volym
            </button>
            <button
              type="button"
              className={activeTab === "nutrition" ? "active" : ""}
              onClick={() => setActiveTab("nutrition")}
            >
              <Beef /> Kost & Protein
            </button>
            <button
              type="button"
              className={activeTab === "recovery" ? "active" : ""}
              onClick={() => setActiveTab("recovery")}
            >
              <Moon /> Sömn & Energi
            </button>
            <button
              type="button"
              className={activeTab === "table" ? "active" : ""}
              onClick={() => setActiveTab("table")}
            >
              <BarChart3 /> All data
            </button>
          </div>
        </header>

        <div className="p100-tab-content">
          {/* Tab 1: Vikt & Mått */}
          {activeTab === "weight" ? (
            <div className="p100-tab-pane">
              <h3>Viktkurva under perioden</h3>
              <MetricChart
                label="Kroppsvikt"
                unit="kg"
                points={weightPoints}
                reference={null}
                domain={{ from: insights.from, to: insights.to }}
                emptyTitle="Inga invägningar under vald period"
                emptyDescription="Logga din vikt i kroppssektionen så ritas utvecklingskurvan här."
              />

              {insights.body.metricChanges.length > 0 ? (
                <div className="p100-metric-changes-section">
                  <h4>Övriga kroppsmått</h4>
                  <div className="p100-metric-changes-grid">
                    {insights.body.metricChanges.map((m) => (
                      <article key={m.metric}>
                        <strong>{m.label}</strong>
                        <div>
                          <span>Start: {m.startValue} {m.unit}</span>
                          <span>Slut: {m.endValue} {m.unit}</span>
                          <b>
                            {m.delta > 0 ? `+${m.delta}` : m.delta} {m.unit}
                          </b>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Tab 2: Träning & Volym */}
          {activeTab === "training" ? (
            <div className="p100-tab-pane">
              <h3>Aktivitetsfördelning & Muskelgrupper</h3>
              <div className="p100-training-insights-grid">
                <div className="p100-activity-list">
                  <h4>Aktiviteter</h4>
                  {insights.training.activityBreakdown.length === 0 ? (
                    <p className="p100-empty-copy">Inga genomförda träningspass i perioden.</p>
                  ) : (
                    <ul>
                      {insights.training.activityBreakdown.map((a) => (
                        <li key={a.activityType}>
                          <strong>{a.label}</strong>
                          <span>{a.count} pass · {a.minutes} minuter</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p100-muscles-list">
                  <h4>Tränade muskelgrupper (arbetsset)</h4>
                  {insights.training.muscleGroupSets.length === 0 ? (
                    <p className="p100-empty-copy">Inga set med muskelklassning under perioden.</p>
                  ) : (
                    <ul>
                      {insights.training.muscleGroupSets.map((m) => (
                        <li key={m.muscleGroup}>
                          <strong>{m.label}</strong>
                          <span>{m.sets} set</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Tab 3: Kost & Protein */}
          {activeTab === "nutrition" ? (
            <div className="p100-tab-pane">
              <h3>Kost- & Näringsöversikt</h3>
              <dl className="p100-nutrition-detail-stats">
                <div>
                  <dt>Genomsnittligt protein</dt>
                  <dd>{insights.nutrition.averageProteinG.current ?? "—"} g / loggad dag</dd>
                </div>
                <div>
                  <dt>Genomsnittlig energi</dt>
                  <dd>{insights.nutrition.averageKcal.current ?? "—"} kcal / loggad dag</dd>
                </div>
                <div>
                  <dt>Dagar som mötte målet</dt>
                  <dd>
                    {insights.nutrition.proteinTargetHitDays} av {insights.nutrition.loggedDaysCount} loggade dagar
                  </dd>
                </div>
                <div>
                  <dt>Lagade satser till frysen</dt>
                  <dd>{insights.nutrition.batchesCooked} st</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {/* Tab 4: Sömn & Energi */}
          {activeTab === "recovery" ? (
            <div className="p100-tab-pane">
              <h3>Återhämtning & Dagsform</h3>
              <dl className="p100-nutrition-detail-stats">
                <div>
                  <dt>Genomsnittlig sömn</dt>
                  <dd>{insights.recovery.averageSleepHours.current ?? "—"} timmar</dd>
                </div>
                <div>
                  <dt>Genomsnittlig energi</dt>
                  <dd>{insights.recovery.averageEnergy.current ?? "—"} / 5</dd>
                </div>
                <div>
                  <dt>Genomsnittligt humör</dt>
                  <dd>{insights.recovery.averageMood.current ?? "—"} / 5</dd>
                </div>
                <div>
                  <dt>Loggade dagar i dagboken</dt>
                  <dd>{insights.recovery.loggedDaysCount} st</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {/* Tab 5: All data tabell */}
          {activeTab === "table" ? (
            <div className="p100-tab-pane">
              <h3>Dag-för-dag data under perioden</h3>
              <div className="p100-insights-table-scroll">
                <table className="p100-insights-table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Jobb</th>
                      <th>Vikt</th>
                      <th>Träning</th>
                      <th>Volym</th>
                      <th>Protein</th>
                      <th>Kalorier</th>
                      <th>Sömn</th>
                      <th>Energi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.timeline.map((point) => (
                      <tr key={point.date}>
                        <td>
                          <strong>{shortDay.format(new Date(`${point.date}T12:00:00Z`))}</strong>
                        </td>
                        <td>{point.isWorkDay ? `${point.workHours} h jobb` : "Ledig"}</td>
                        <td>{point.weightKg !== null ? `${point.weightKg} kg` : "—"}</td>
                        <td>{point.hasCompletedSession ? `${point.trainingMinutes} min` : "—"}</td>
                        <td>{point.trainingVolumeKg !== null ? `${point.trainingVolumeKg} kg` : "—"}</td>
                        <td>{point.proteinG !== null ? `${point.proteinG} g` : "—"}</td>
                        <td>{point.kcal !== null ? `${point.kcal} kcal` : "—"}</td>
                        <td>{point.sleepHours !== null ? `${point.sleepHours} h` : "—"}</td>
                        <td>{point.energy !== null ? `${point.energy}/5` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
