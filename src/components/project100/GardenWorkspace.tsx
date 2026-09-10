"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Leaf, LoaderCircle, Send, Sparkles, Sprout, X } from "lucide-react";
import { GARDEN_HABITS, type GardenAction, type GardenSurprise, type GardenView } from "@/lib/garden";
import styles from "./GardenWorkspace.module.css";

function noise(seed: number, n: number) {
  let h = ((seed | 0) * 374761393 + (n | 0) * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function f(n: number): number {
  return Math.round(n * 100) / 100;
}

function GardenScene({ view, busy, onDiscover }: { view: GardenView; busy: boolean; onDiscover: (gift: GardenSurprise) => void }) {
  const growth = Math.min(view.streak, 100);
  const height = view.streak === 0 ? 0 : f(28 + Math.sqrt(growth) * 24);
  const top = f(345 - height);
  const leaves = view.streak === 0 ? 0 : Math.min(95, 2 + view.streak * 3);
  return (
    <div className={styles.scene}>
      <svg viewBox="0 0 900 480" preserveAspectRatio="xMidYMax slice" className={styles.landscape} role="img" aria-label={view.streak === 0 ? "En grön trädgård med ett frö som väntar på att gro." : `Ditt träd växer i en trädgård. ${view.streak} dagar i följd och ${view.checks.length} av fem vanor klara idag.`}>
        <defs>
          <linearGradient id="garden-sky" x2="0" y2="1"><stop stopColor="#dbeae0" /><stop offset="1" stopColor="#faf0cc" /></linearGradient>
          <linearGradient id="garden-ground" x2="0" y2="1"><stop stopColor="#94ae6a" /><stop offset="1" stopColor="#3e6b49" /></linearGradient>
          <radialGradient id="garden-light"><stop stopColor="#fffad6" stopOpacity=".95" /><stop offset="1" stopColor="#fffad6" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="900" height="480" fill="url(#garden-sky)" />
        <circle cx="685" cy="115" r="130" fill="url(#garden-light)" />
        <circle cx="685" cy="115" r="31" fill="#fff9d9" />
        <path d="M0 264 Q130 173 295 255 T620 236 T900 250 V480 H0Z" fill="#b6c6a1" />
        <path d="M0 303 Q200 230 385 284 T700 261 T900 291 V480 H0Z" fill="#99b28c" />
        <path d="M0 353 Q230 276 453 320 T900 318 V480 H0Z" fill="url(#garden-ground)" />
        <path d="M700 480 Q650 416 568 394 Q497 374 459 351" fill="none" stroke="#e3d7ae" strokeWidth="34" opacity=".35" />
        <ellipse cx="450" cy="354" rx={f(36 + growth * .8)} ry="13" fill="#2d5137" opacity=".18" />
        {view.streak === 0 ? <g><ellipse cx="450" cy="349" rx="22" ry="8" fill="#775b3a" /><ellipse cx="450" cy="344" rx="6" ry="9" fill="#bd955a" transform="rotate(30 450 344)" /></g> : <g className={styles.tree}>
          <path d={`M446 348 Q457 ${f(top + height * .6)} 450 ${top}`} fill="none" stroke="#795b3b" strokeWidth={f(4 + growth * .18)} strokeLinecap="round" />
          {Array.from({ length: Math.min(12, Math.ceil(growth / 3)) }, (_, i) => {
            const side = i % 2 ? 1 : -1;
            const y = f(top + 18 + i * height / 17);
            const spread = f((15 + Math.sqrt(growth) * 5) * (0.5 + noise(view.seed, i) * .5));
            return <path key={i} d={`M450 ${f(y + height * .25)} Q${f(450 + side * spread * .5)} ${f(y + 15)} ${f(450 + side * spread)} ${y}`} fill="none" stroke="#795b3b" strokeWidth={f(2 + growth * .025)} strokeLinecap="round" />;
          })}
          {Array.from({ length: leaves }, (_, i) => {
            const angle = noise(view.seed, i + 200) * Math.PI * 2;
            const radius = Math.sqrt(noise(view.seed, i + 400));
            const width = 10 + Math.sqrt(growth) * 10;
            const x = f(450 + Math.cos(angle) * radius * width);
            const y = f(top + height * .2 + Math.sin(angle) * radius * height * .39);
            const deg = f(angle * 180 / Math.PI);
            return <ellipse key={i} cx={x} cy={y} rx={f(7 + Math.sqrt(growth) * 1.2)} ry={f(4 + Math.sqrt(growth) * .85)} fill={["#527b45", "#668e49", "#89a957", "#a7bb65", "#3d6944"][i % 5]} transform={`rotate(${deg} ${x} ${y})`} />;
          })}
        </g>}
        {Array.from({ length: 80 + growth * 2 + view.checks.length * 8 }, (_, i) => {
          const x = f(noise(view.seed, i + 700) * 900);
          const y = f(353 + noise(view.seed, i + 900) * 130);
          const h = f(8 + noise(view.seed, i) * 12);
          return <path key={i} d={`M${x} ${y} q-6 -10 -3 -${h} M${x} ${y} q4 -10 8 -13`} fill="none" stroke={i % 2 ? "#b1c184" : "#648451"} strokeWidth="1.5" opacity=".6" />;
        })}
        {Array.from({ length: Math.min(70, view.streak + view.checks.length) }, (_, i) => {
          const x = f(35 + noise(view.seed, i + 1100) * 830);
          const y = f(361 + noise(view.seed, i + 1200) * 105);
          return <g key={i}><path d={`M${x} ${y}v-10`} stroke="#487045" strokeWidth="2" /><circle cx={x} cy={f(y - 12)} r="3.5" fill={["#f6e7af", "#e7b4a8", "#d3c7dc"][i % 3]} /><circle cx={x} cy={f(y - 12)} r="1.4" fill="#dfbc68" /></g>;
        })}
      </svg>
      <div className={styles.sceneCaption}><span className={styles.liveDot} />{view.started ? "Din alldeles egna lilla värld" : "Här börjar något litet"}</div>
      {view.surprises.map(gift => <button key={gift.id} type="button" className={`${styles.discovery} ${gift.gift ? styles[gift.gift.effect] : styles.unopened}`} style={{ left: `${gift.x}%`, top: `${gift.y}%` }} onClick={() => onDiscover(gift)} disabled={busy} aria-label={gift.gift ? `Återbesök: ${gift.gift.title}` : `Öppna din hemliga upptäckt från dag ${gift.day}`}>
        <span aria-hidden="true">{gift.gift?.symbol ?? "✿"}</span>
      </button>)}
      <div className={styles.sceneFoot}><span>OMGÅNG {Math.max(1, view.run)}</span><span>{view.streak === 0 ? "Ett frö. En början." : `${view.streak} ${view.streak === 1 ? "dag" : "dagar"} av små steg.`}</span></div>
    </div>
  );
}

export function GardenWorkspace({ initialView }: { initialView: GardenView }) {
  const [view, setView] = useState(initialView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [opened, setOpened] = useState<GardenSurprise | null>(null);
  const inFlight = useRef(false);
  const requestVersion = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/project100/garden", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta trädgården.");
      if (version === requestVersion.current) { setView(data); setError(""); }
    } catch (error) {
      if (version === requestVersion.current) setError(error instanceof Error ? error.message : "Kunde inte hämta trädgården.");
    }
  }, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(onVisible, 15_000);
    const midnight = window.setTimeout(() => void refresh(), Math.max(50, new Date(view.nextMidnight).getTime() - Date.now() + 100));
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); clearTimeout(midnight); window.removeEventListener("focus", onVisible); window.removeEventListener("online", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh, view.nextMidnight]);

  useEffect(() => { if (opened && !dialog.current?.open) dialog.current?.showModal(); }, [opened]);
  useEffect(() => {
    if (opened && !view.surprises.some(gift => gift.id === opened.id)) dialog.current?.close();
  }, [opened, view.surprises]);

  async function mutate(action: GardenAction) {
    if (inFlight.current) return;
    inFlight.current = true;
    requestVersion.current += 1;
    setBusy(true); setError(""); setSaved("");
    try {
      const response = await fetch("/api/project100/garden", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara. Försök igen.");
      setView(data);
      setSaved(action.action === "check" ? (action.done ? "Sparat. Ditt lilla steg räknas." : "Avbockningen är ångrad.") : "Trädgården är sparad.");
      if (action.action === "reveal") setOpened(data.surprises.find((gift: GardenSurprise) => gift.id === action.id) ?? null);
    } catch (error) { setError(error instanceof Error ? error.message : "Kunde inte spara. Kontrollera anslutningen och försök igen."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const complete = view.checks.length === GARDEN_HABITS.length;
  const nextGift = (Math.floor(view.streak / 10) + 1) * 10;
  return <div className={styles.garden}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}><Sprout size={15} /> SMÅ STEG, VARJE DAG</p><h1>Min trädgård<span>.</span></h1><p>Fem små löften. Något vackert som växer med dig.</p></div>
      <div className={styles.streak}><Leaf size={22} /><strong>{view.streak}</strong><span>dagar i följd</span></div>
    </header>
    <div className={styles.columns}>
      <section className={styles.gardenPanel} aria-label="Din växande trädgård">
        <GardenScene view={view} busy={busy} onDiscover={gift => gift.gift ? setOpened(gift) : void mutate({ action: "reveal", date: view.date, id: gift.id })} />
        <div className={styles.discoveryBar}><Sparkles size={21} /><div><strong>{view.surprises.some(gift => !gift.gift) ? "Något väntar på att bli upptäckt" : "Lite vardagsmagi, var tionde dag"}</strong><p>{view.surprises.some(gift => !gift.gift) ? "Titta i trädgården. Något har dykt upp — tryck och se." : `${nextGift - view.streak} klarade dagar till nästa hemlighet. Inga ledtrådar i förväg.`}</p></div></div>
        <div className={styles.milestone} aria-label={`${view.streak % 10} av tio dagar mot nästa överraskning`}>{Array.from({ length: 10 }, (_, i) => <span key={i} className={i < view.streak % 10 ? styles.filled : ""}>{i === 9 ? <Sparkles size={13} /> : null}</span>)}</div>
      </section>
      <section className={styles.habits} aria-labelledby="garden-habits">
        <div className={styles.habitHeading}><div><p className={styles.eyebrow}>IDAG · {new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${view.date}T12:00:00Z`))}</p><h2 id="garden-habits">Det lilla räcker.</h2></div><span>{view.checks.length}/5</span></div>
        {!view.started && <div className={styles.start}><p>Plantera fröet för att börja idag. Alla fem vanor behöver vara klara före midnatt.</p><button type="button" disabled={busy} onClick={() => void mutate({ action: "start", date: view.date })}><Sprout size={18} /> Plantera mitt frö</button></div>}
        {view.resetOn === view.date && <p className={styles.reset}>En dag blev inte klar. Trädgården är återställd och ett nytt frö väntar. Dina tidigare upptäckter påverkar vilka överraskningar som kommer nästa gång.</p>}
        <div className={styles.habitList}>{GARDEN_HABITS.map(habit => {
          const done = view.checks.includes(habit.id);
          return <button key={habit.id} type="button" role="checkbox" aria-checked={done} disabled={!view.started || busy} onClick={() => void mutate({ action: "check", date: view.date, habit: habit.id, done: !done })} className={`${styles.habit} ${done ? styles.done : ""}`}><span className={styles.habitIcon} aria-hidden="true">{habit.icon}</span><span className={styles.habitText}><strong>{habit.title}</strong><small>{habit.detail}</small></span><span className={styles.checkbox}>{done ? <Check size={17} /> : null}</span></button>;
        })}</div>
        <div className={styles.status} role="status">{busy ? <><LoaderCircle size={15} className={styles.spin} /> Sparar …</> : complete ? <><Check size={17} /> Alla fem klara. Trädgården har vuxit idag.</> : saved || "Miniminivån räcker. Mer är alltid bonus."}</div>
        {error && <div className={styles.error} role="alert">{error} <button type="button" onClick={() => void refresh()}>Hämta igen</button></div>}
      </section>
    </div>
    <div className={styles.bottom}><div className={styles.telegram}><Send size={22} /><div><strong>En bock bort, även i Telegram.</strong><p>Skriv <code>/vanor</code> till Jarvis eller tryck på ”🌱 Min trädgård”. Bocka av direkt där — samma trädgård följer med hit.</p></div><ChevronRight size={20} /></div><details className={styles.rules}><summary>Så fungerar din trädgård</summary><p>Alla fem vanor varje dag. En missad dag återställer hela trädgården och räknaren. Nya dagar börjar kl. 00.00 i {view.timeZone}. Du kan ångra dagens bockar fram till dess. Var tionde dag i följd får du en hemlig upptäckt. Vid en omstart varierar trädgården och överraskningarnas placeringar.</p><p>Avbockningen är din egen bekräftelse. Rörelsebocken skapar inget träningspass eller någon matlogg.</p></details></div>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setOpened(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {opened?.gift && <div className={styles.giftBody}><button className={styles.close} type="button" onClick={() => dialog.current?.close()} aria-label="Stäng upptäckten"><X /></button><span className={`${styles.giftSymbol} ${styles[opened.gift.effect]}`} aria-hidden="true">{opened.gift.symbol}</span><p className={styles.eyebrow}>EN UPPTÄCKT FRÅN DAG {opened.day}</p><h2>{opened.gift.title}</h2><p>{opened.gift.text}</p><button className={styles.back} type="button" onClick={() => dialog.current?.close()}>Tillbaka till trädgården <Leaf size={16} /></button></div>}
    </dialog>
  </div>;
}
