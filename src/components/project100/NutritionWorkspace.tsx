"use client";

import {
  Beef,
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  Gauge,
  ImageIcon,
  Info,
  PackageOpen,
  Pencil,
  Plus,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Utensils,
  Wheat,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { addCalendarDateDays } from "@/lib/dates";
import {
  PROJECT100_LOAD_LABELS,
  PROJECT100_MEAL_TYPES,
  PROJECT100_MEAL_TYPE_LABELS,
  PROJECT100_SUPPLEMENT_KINDS,
  PROJECT100_SUPPLEMENT_KIND_LABELS,
  PROJECT100_TIMING_MATTERS,
  PROJECT100_TIMING_NOTES,
  batchPortionMacros,
  buildProject100MealSuggestions,
  formatGrams,
  proteinGoalGrams,
  sumMealMacros,
  type Project100Food,
  type Project100Meal,
  type Project100MealBatch,
  type Project100MealType,
  type Project100NutritionView,
  type Project100SupplementKind,
} from "@/lib/project100-nutrition";

type Composer = "meal" | "food" | "batch" | "supplement" | "target" | null;

interface PendingImage {
  file: File;
  localUrl: string;
  preview: Blob | null;
  width: number | null;
  height: number | null;
}

interface MealDraft {
  source: "manual" | "batch";
  batchId: string;
  portions: string;
  title: string;
  eatenOn: string;
  eatenAt: string;
  mealType: Project100MealType;
  proteinG: string;
  carbsG: string;
  fatG: string;
  kcal: string;
  hungerBefore: string;
  fullnessAfter: string;
  note: string;
}

interface BatchItemDraft {
  id: string;
  foodId: string;
  grams: string;
}

const shortDate = new Intl.DateTimeFormat("sv-SE", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function dateLabel(value: string): string {
  return shortDate.format(new Date(`${value}T12:00:00Z`));
}

function timeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function minuteValue(value: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
}

function optionalNumber(value: string, label: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} måste vara ett positivt tal.`);
  return parsed;
}

function requiredNumber(value: string, label: string): number {
  const parsed = optionalNumber(value, label);
  if (parsed === null || parsed <= 0) throw new Error(`${label} måste vara större än noll.`);
  return parsed;
}

async function failureFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

async function buildPreview(file: File): Promise<Omit<PendingImage, "file" | "localUrl">> {
  if (typeof createImageBitmap !== "function") {
    return { preview: null, width: null, height: null };
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.min(1, 640 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { preview: null, width, height };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.72),
    );
    return { preview, width, height };
  } catch {
    return { preview: null, width: null, height: null };
  } finally {
    bitmap?.close();
  }
}

function mealTypeForMinute(minute: number): Project100MealType {
  if (minute < 10 * 60) return "breakfast";
  if (minute < 14 * 60) return "lunch";
  if (minute < 18 * 60) return "snack";
  return "dinner";
}

function freshMeal(day: string, nowMinute: number, batchId = ""): MealDraft {
  return {
    source: batchId ? "batch" : "manual",
    batchId,
    portions: "1",
    title: "",
    eatenOn: day,
    eatenAt: timeValue(nowMinute),
    mealType: mealTypeForMinute(nowMinute),
    proteinG: "",
    carbsG: "",
    fatG: "",
    kcal: "",
    hungerBefore: "",
    fullnessAfter: "",
    note: "",
  };
}

function sortMeals(meals: Project100Meal[]): Project100Meal[] {
  return [...meals].sort(
    (left, right) =>
      (left.eatenAtMinute ?? Number.MAX_SAFE_INTEGER) -
      (right.eatenAtMinute ?? Number.MAX_SAFE_INTEGER),
  );
}

function ModalShell({
  eyebrow,
  title,
  description,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="p100-training-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="p100-training-modal p100-nutrition-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="p100-composer-head">
          <div><span>{eyebrow}</span><h2 id="nutrition-modal-title">{title}</h2><p>{description}</p></div>
          <button type="button" onClick={onClose} aria-label="Stäng"><X /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function NutritionWorkspace({
  initialView,
  initialComposer,
  nowMinute,
}: {
  initialView: Project100NutritionView;
  initialComposer: "meal" | "batch" | null;
  nowMinute: number;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(initialView);
  const [composer, setComposer] = useState<Composer>(initialComposer);
  const [meal, setMeal] = useState(() => freshMeal(initialView.day, nowMinute));
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [food, setFood] = useState({
    name: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "", kcalPer100g: "",
    isStaple: false, stapleTargetGrams: "",
  });
  const [batch, setBatch] = useState({
    name: "", cookedOn: initialView.today, portionsTotal: "6", note: "",
    items: [{ id: crypto.randomUUID(), foodId: initialView.foods[0]?.id ?? "", grams: "" }] as BatchItemDraft[],
  });
  const [supplement, setSupplement] = useState({
    name: "", kind: "protein" as Project100SupplementKind, doseAmount: "", doseUnit: "g",
    purpose: "", timingMatters: true, timingNote: "",
  });
  const [targetDraft, setTargetDraft] = useState(
    initialView.target.overrideGrams?.toString() ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eaten = useMemo(() => sumMealMacros(view.meals), [view.meals]);
  const effectiveGoal = proteinGoalGrams(view.target);
  const coverage = effectiveGoal === null ? null : Math.min(100, Math.round((eaten.proteinG / effectiveGoal) * 100));
  const openBatches = view.batches.filter((item) => item.portionsLeft > 0);
  const portionsLeft = openBatches.reduce((sum, item) => sum + Math.floor(item.portionsLeft), 0);
  const suggestions = useMemo(
    () =>
      view.day === view.today
        ? buildProject100MealSuggestions({
            target: view.target,
            eatenProteinG: eaten.proteinG,
            batches: view.batches,
            supplements: view.supplements,
            nextWorkInMinutes: view.nextWorkInMinutes,
          })
        : [],
    [eaten.proteinG, view],
  );

  function resetComposer(destinationDay: string = view.day) {
    if (pendingImage) URL.revokeObjectURL(pendingImage.localUrl);
    setPendingImage(null);
    setComposer(null);
    setError(null);
    if (initialComposer !== null || destinationDay !== view.day) {
      router.replace(`/projekt-100/kost?dag=${destinationDay}`, { scroll: false });
    }
  }

  function closeComposer() {
    if (!busy) resetComposer();
  }

  function finishComposer(destinationDay: string = view.day) {
    resetComposer(destinationDay);
    if (initialComposer === null && destinationDay === view.day) router.refresh();
  }

  function openMeal(batchId = "") {
    setMeal(freshMeal(view.day, nowMinute, batchId));
    setPendingImage(null);
    setError(null);
    setComposer("meal");
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    const preview = await buildPreview(file);
    setPendingImage({ file, localUrl: URL.createObjectURL(file), ...preview });
    setMeal(freshMeal(view.day, nowMinute));
    setComposer("meal");
    if (cameraRef.current) cameraRef.current.value = "";
  }

  async function uploadMealImage(title: string): Promise<string | null> {
    if (!pendingImage) return null;
    const body = new FormData();
    body.set("file", pendingImage.file);
    if (pendingImage.preview) body.set("preview", pendingImage.preview, "preview.jpg");
    body.set("category", "food");
    body.set("capturedOn", meal.eatenOn);
    body.set("caption", title);
    if (pendingImage.width) body.set("width", String(pendingImage.width));
    if (pendingImage.height) body.set("height", String(pendingImage.height));
    const response = await fetch("/api/project100/media", { method: "POST", body });
    if (!response.ok) throw await failureFrom(response, "Bilden kunde inte sparas.");
    const saved = (await response.json()) as { media: { id: string } };
    return saved.media.id;
  }

  async function submitMeal(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fallbackTitle = PROJECT100_MEAL_TYPE_LABELS[meal.mealType];
      const title = meal.title.trim() || fallbackTitle;
      const mediaId = await uploadMealImage(title);
      const shared = {
        eatenOn: meal.eatenOn,
        eatenAtMinute: minuteValue(meal.eatenAt),
        mealType: meal.mealType,
        hungerBefore: optionalNumber(meal.hungerBefore, "Hunger"),
        fullnessAfter: optionalNumber(meal.fullnessAfter, "Mättnad"),
        note: meal.note.trim() || null,
        mediaId,
      };
      const payload = meal.source === "batch"
        ? {
            source: "batch" as const,
            batchId: meal.batchId,
            portions: requiredNumber(meal.portions, "Portioner"),
            ...shared,
          }
        : {
            source: "manual" as const,
            title,
            proteinG: optionalNumber(meal.proteinG, "Protein"),
            carbsG: optionalNumber(meal.carbsG, "Kolhydrater"),
            fatG: optionalNumber(meal.fatG, "Fett"),
            kcal: optionalNumber(meal.kcal, "Energi"),
            ...shared,
          };
      const response = await fetch("/api/project100/nutrition/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await failureFrom(response, "Måltiden kunde inte sparas.");
      const saved = (await response.json()) as { meal: Project100Meal };
      if (saved.meal.eatenOn === view.day) {
        setView((current) => ({
          ...current,
          meals: sortMeals([...current.meals, saved.meal]),
          batches: current.batches.map((item) =>
            saved.meal.batchId === item.id
              ? { ...item, portionsLeft: Math.max(0, item.portionsLeft - (saved.meal.portions ?? 0)) }
              : item,
          ),
        }));
      }
      finishComposer(saved.meal.eatenOn);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMeal(item: Project100Meal) {
    if (!window.confirm(`Ta bort måltiden ”${item.title}”?`)) return;
    const response = await fetch(`/api/project100/nutrition/meals/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Måltiden kunde inte tas bort.")).message);
      return;
    }
    setView((current) => ({
      ...current,
      meals: current.meals.filter((mealItem) => mealItem.id !== item.id),
      batches: current.batches.map((batchItem) =>
        item.batchId === batchItem.id
          ? { ...batchItem, portionsLeft: Math.min(batchItem.portionsTotal, batchItem.portionsLeft + (item.portions ?? 0)) }
          : batchItem,
      ),
    }));
    router.refresh();
  }

  async function submitFood(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/nutrition/foods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: food.name,
          proteinPer100g: optionalNumber(food.proteinPer100g, "Protein") ?? 0,
          carbsPer100g: optionalNumber(food.carbsPer100g, "Kolhydrater") ?? 0,
          fatPer100g: optionalNumber(food.fatPer100g, "Fett") ?? 0,
          kcalPer100g: optionalNumber(food.kcalPer100g, "Energi"),
          isStaple: food.isStaple,
          stapleTargetGrams: food.isStaple ? optionalNumber(food.stapleTargetGrams, "Lagernivå") : null,
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Råvaran kunde inte sparas.");
      const saved = (await response.json()) as { food: Project100Food };
      setView((current) => {
        const foods = [saved.food, ...current.foods.filter((item) => item.id !== saved.food.id)];
        return { ...current, foods, staples: foods.filter((item) => item.isStaple) };
      });
      setBatch((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.foodId ? item : { ...item, foodId: saved.food.id },
        ),
      }));
      setFood({ name: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "", kcalPer100g: "", isStaple: false, stapleTargetGrams: "" });
      finishComposer();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function submitBatch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/nutrition/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: batch.name,
          cookedOn: batch.cookedOn,
          portionsTotal: requiredNumber(batch.portionsTotal, "Antal portioner"),
          note: batch.note.trim() || null,
          items: batch.items.map((item) => ({
            foodId: item.foodId,
            grams: requiredNumber(item.grams, "Mängd"),
          })),
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Satsen kunde inte sparas.");
      const saved = (await response.json()) as { batch: Project100MealBatch };
      setView((current) => ({ ...current, batches: [saved.batch, ...current.batches] }));
      setBatch({ name: "", cookedOn: view.today, portionsTotal: "6", note: "", items: [{ id: crypto.randomUUID(), foodId: view.foods[0]?.id ?? "", grams: "" }] });
      finishComposer();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSupplement(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/nutrition/supplements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: supplement.name,
          kind: supplement.kind,
          doseAmount: optionalNumber(supplement.doseAmount, "Dos"),
          doseUnit: supplement.doseAmount.trim() ? supplement.doseUnit : null,
          purpose: supplement.purpose.trim() || null,
          timingMatters: supplement.timingMatters,
          timingNote: supplement.timingMatters && supplement.timingNote.trim() ? supplement.timingNote.trim() : null,
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Tillskottet kunde inte sparas.");
      const saved = (await response.json()) as { supplement: Project100NutritionView["supplements"][number] };
      setView((current) => ({ ...current, supplements: [...current.supplements, saved.supplement] }));
      finishComposer();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSupplement(id: string) {
    const response = await fetch(`/api/project100/nutrition/supplements/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Tillskottet kunde inte tas bort.")).message);
      return;
    }
    setView((current) => ({ ...current, supplements: current.supplements.filter((item) => item.id !== id) }));
    router.refresh();
  }

  async function submitTarget(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/nutrition/target", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proteinTargetG: optionalNumber(targetDraft, "Proteinmål") }),
      });
      if (!response.ok) throw await failureFrom(response, "Proteinmålet kunde inte sparas.");
      const saved = (await response.json()) as { proteinTargetG: number | null };
      setView((current) => ({ ...current, target: { ...current.target, overrideGrams: saved.proteinTargetG } }));
      finishComposer();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  const nextWorkLabel = view.nextWorkEvent
    ? new Intl.DateTimeFormat("sv-SE", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: view.timeZone,
      }).format(new Date(view.nextWorkEvent.startsAt))
    : null;

  return (
    <div className="p100-nutrition-workspace">
      <header className="p100-page-head p100-nutrition-head">
        <div><span>Ät · förbered · bygg</span><h1>Kost</h1><p>Logga snabbt, se vad dagen faktiskt täcker och välj nästa måltid utifrån kroppen, frysen och jobbet.</p></div>
        <div className="p100-head-actions">
          <label className="p100-button p100-camera-action"><Camera /> Fotografera måltid<input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => void chooseImage(event.target.files?.[0])} /></label>
          <button type="button" className="p100-button-secondary" onClick={() => openMeal()}><Plus /> Logga utan bild</button>
        </div>
      </header>

      <nav className="p100-nutrition-day-nav" aria-label="Välj dag">
        <Link href={`/projekt-100/kost?dag=${addCalendarDateDays(view.day, -1)}`} aria-label="Föregående dag"><ChevronLeft /></Link>
        <div><small>{view.day === view.today ? "Idag" : "Vald dag"}</small><strong>{dateLabel(view.day)}</strong></div>
        <Link className={view.day >= view.today ? "disabled" : ""} href={view.day >= view.today ? `/projekt-100/kost?dag=${view.day}` : `/projekt-100/kost?dag=${addCalendarDateDays(view.day, 1)}`} aria-disabled={view.day >= view.today} aria-label="Nästa dag"><ChevronRight /></Link>
      </nav>

      <section className="p100-nutrition-summary" aria-label="Dagens näring">
        <article className="p100-protein-card">
          <header><div><span><Beef /></span><div><small>Protein täckt idag</small><strong>{formatGrams(eaten.proteinG)}</strong></div></div><button type="button" onClick={() => { setTargetDraft(view.target.overrideGrams?.toString() ?? ""); setComposer("target"); }}><Pencil /> Anpassa</button></header>
          {view.target.missing === "weight" ? (
            <div className="p100-protein-missing"><Info /><p><strong>Ingen säker beräkning ännu</strong>Logga en verklig vikt i kroppsvyn så får intervallet ett underlag.</p><Link href="/projekt-100/kropp">Logga vikt</Link></div>
          ) : (
            <>
              <div className="p100-protein-range"><span style={{ width: `${coverage ?? 0}%` }} /><i>{coverage ?? 0}%</i></div>
              <div className="p100-protein-goal"><b>{view.target.overrideGrams !== null ? `${formatGrams(view.target.overrideGrams)} eget mål` : `${formatGrams(view.target.lowGrams)}–${formatGrams(view.target.highGrams)} intervall`}</b><span>{effectiveGoal !== null && eaten.proteinG < effectiveGoal ? `${Math.max(0, Math.round(effectiveGoal - eaten.proteinG))} g kvar till dagens riktmärke` : "Dagens riktmärke är täckt"}</span></div>
              <dl className="p100-protein-basis">
                <div><dt>Vikt</dt><dd>{view.target.weightKg?.toLocaleString("sv-SE")} kg <small>{view.target.weightMeasuredOn ? dateLabel(view.target.weightMeasuredOn) : ""}</small></dd></div>
                <div><dt>Träningsfönster</dt><dd>{view.target.trainingFrom && view.target.trainingThrough ? `${dateLabel(view.target.trainingFrom)}–${dateLabel(view.target.trainingThrough)}` : "Senaste 7 dagarna"}</dd></div>
                <div><dt>Belastning</dt><dd>{PROJECT100_LOAD_LABELS[view.target.load]} <small>{view.target.sessionsLast7} pass · {view.target.minutesLast7} min</small></dd></div>
                <div><dt>Formel</dt><dd>{view.target.lowPerKg.toLocaleString("sv-SE")}–{view.target.highPerKg.toLocaleString("sv-SE")} g/kg</dd></div>
              </dl>
            </>
          )}
        </article>
        <div className="p100-nutrition-stat-stack">
          <article><span><Gauge /></span><div><small>Loggad energi</small><strong>{eaten.kcal.toLocaleString("sv-SE")} <i>kcal</i></strong><p>Visas som dagens täckning, aldrig som skuld.</p></div></article>
          <article><span><PackageOpen /></span><div><small>Frysen just nu</small><strong>{portionsLeft} <i>portioner</i></strong><p>{openBatches.length} aktiva satser går att logga direkt.</p></div></article>
          <article><span><BriefcaseBusiness /></span><div><small>Nästa arbetspass</small><strong>{nextWorkLabel ?? "Inget kommande"}</strong><p>{view.nextWorkInMinutes !== null ? `Om ungefär ${view.nextWorkInMinutes < 60 ? `${view.nextWorkInMinutes} minuter` : `${Math.round(view.nextWorkInMinutes / 60)} timmar`}.` : "Ingen måltid behöver planeras mot ett pass i horisonten."}</p></div></article>
        </div>
      </section>

      <div className="p100-nutrition-main-grid">
        <section className="p100-nutrition-panel p100-meals-panel">
          <header><div><span>Dagens faktiska logg</span><h2>Måltider</h2></div><small>{view.meals.length} loggade</small></header>
          {view.meals.length === 0 ? (
            <button type="button" className="p100-nutrition-empty" onClick={() => cameraRef.current?.click()}><Camera /><strong>Börja med bilden</strong><span>Ta bilden nu. Protein, mängd och känsla kan fyllas i direkt eller lämnas tomma.</span></button>
          ) : (
            <ol className="p100-meal-list">
              {view.meals.map((item) => (
                <li key={item.id}>
                  <span className="p100-meal-time">{item.eatenAtMinute === null ? "—" : timeValue(item.eatenAtMinute)}</span>
                  <span className="p100-meal-image">{item.previewUrl ? <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt="" />
                  </> : <Utensils />}</span>
                  <div><small>{PROJECT100_MEAL_TYPE_LABELS[item.mealType]} · {item.source === "batch" ? `${item.portions} portion ur sats` : item.source === "estimate" ? "AI-uppskattning" : "Manuella värden"}</small><strong>{item.title}</strong><p>{item.proteinG !== null ? `${formatGrams(item.proteinG)} protein` : "Protein ej angivet"}{item.kcal !== null ? ` · ${Math.round(item.kcal)} kcal` : ""}</p>{item.note ? <i>{item.note}</i> : null}</div>
                  <button type="button" onClick={() => void removeMeal(item)} aria-label={`Ta bort ${item.title}`}><Trash2 /></button>
                </li>
              ))}
            </ol>
          )}
          <footer><span><Wheat /> Kolhydrater {formatGrams(eaten.carbsG)}</span><span>Fett {formatGrams(eaten.fatG)}</span></footer>
        </section>

        <section className="p100-nutrition-panel p100-suggestions-panel">
          <header><div><span>Grundat i din data</span><h2>Nästa rimliga val</h2></div><Sparkles /></header>
          {suggestions.length === 0 ? (
            <div className="p100-suggestion-empty"><Check /><strong>Inget påhittat förslag</strong><p>När protein, frysläge eller ett kommande arbetspass ger ett verkligt skäl visas det här.</p></div>
          ) : (
            <div className="p100-suggestion-list">{suggestions.map((item) => <article key={item.id}><span>{item.kind === "cook" ? <CookingPot /> : item.kind === "batch" ? <Utensils /> : <Beef />}</span><div><small>{item.kind === "cook" ? "Förbered" : "Förslag"}</small><strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}<ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>{item.kind === "batch" ? <button type="button" onClick={() => openMeal(item.id.replace(/^batch-/, ""))}>Logga</button> : null}</article>)}</div>
          )}
        </section>
      </div>

      <section className="p100-nutrition-panel p100-batches-panel">
        <header><div><span>Frysen är läsbar</span><h2>Satser och portioner</h2></div><button type="button" onClick={() => setComposer(view.foods.length ? "batch" : "food")}><Plus /> Ny sats</button></header>
        {view.batches.length === 0 ? <div className="p100-batch-empty"><CookingPot /><div><strong>Ingen sats registrerad ännu</strong><p>Lägg först in råvarorna du faktiskt använder, bygg sedan en sats med kända makron per portion.</p></div><button type="button" onClick={() => setComposer("food")}>Lägg till råvara</button></div> : <div className="p100-batch-grid">{view.batches.map((item) => { const macros = batchPortionMacros(item); return <article key={item.id} className={item.portionsLeft <= 0 ? "empty" : ""}><header><span><CookingPot /></span><div><small>Lagades {dateLabel(item.cookedOn)}</small><strong>{item.name}</strong></div><b>{item.portionsLeft}/{item.portionsTotal}</b></header><p>{macros.proteinG} g protein · {macros.carbsG} g kolhydrater · {macros.kcal} kcal per portion</p><div className="p100-batch-meter"><span style={{ width: `${Math.min(100, (item.portionsLeft / item.portionsTotal) * 100)}%` }} /></div><footer><small>{item.items.map((ingredient) => ingredient.name).join(" · ")}</small><button type="button" disabled={item.portionsLeft < 1} onClick={() => openMeal(item.id)}>Logga portion</button></footer></article>; })}</div>}
      </section>

      <div className="p100-nutrition-lower-grid">
        <section className="p100-nutrition-panel p100-pantry-panel">
          <header><div><span>Det du faktiskt använder</span><h2>Råvaror hemma</h2></div><button type="button" onClick={() => setComposer("food")}><Plus /> Råvara</button></header>
          {view.foods.length === 0 ? <p className="p100-panel-empty-copy">Råvarulistan växer ur dina egna satser. Inga generiska inköp läggs till.</p> : <ul>{view.foods.slice(0, 12).map((item) => <li key={item.id}><span>{item.isStaple ? <ShoppingBasket /> : <Wheat />}</span><div><strong>{item.name}</strong><small>{item.proteinPer100g} g protein · {item.kcalPer100g !== null ? `${item.kcalPer100g} kcal` : "energi beräknas ur makron"} per 100 g</small></div>{item.isStaple ? <b>Basvara{item.stapleTargetGrams ? ` · ${item.stapleTargetGrams} g` : ""}</b> : null}</li>)}</ul>}
        </section>
        <section className="p100-nutrition-panel p100-supplement-panel">
          <header><div><span>Bara det du själv valt</span><h2>Tillskott</h2></div><button type="button" onClick={() => setComposer("supplement")}><Plus /> Tillskott</button></header>
          {view.supplements.length === 0 ? <p className="p100-panel-empty-copy">Inga tillskott registrerade. Projekt 100 rekommenderar inte produkter på egen hand.</p> : <ul>{view.supplements.map((item) => <li key={item.id}><span><Beef /></span><div><small>{PROJECT100_SUPPLEMENT_KIND_LABELS[item.kind]}</small><strong>{item.name}{item.doseAmount !== null && item.doseUnit ? ` · ${item.doseAmount} ${item.doseUnit}` : ""}</strong><p>{item.timingNote ?? PROJECT100_TIMING_NOTES[item.kind]}</p></div><button type="button" onClick={() => void removeSupplement(item.id)} aria-label={`Ta bort ${item.name}`}><Trash2 /></button></li>)}</ul>}
        </section>
      </div>

      {composer === "meal" ? <ModalShell eyebrow={pendingImage ? "Bild först" : meal.source === "batch" ? "En portion ur frysen" : "Snabb logg"} title="Logga måltid" description="Det som är känt sparas strukturerat. Resten kan lämnas tomt utan att appen hittar på." onClose={closeComposer}><form onSubmit={submitMeal}>{pendingImage ? <figure className="p100-meal-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pendingImage.localUrl} alt="Måltiden du valt" />
        <figcaption><ImageIcon /> Privat matbild</figcaption></figure> : null}<div className="p100-status-choice"><button type="button" className={meal.source === "manual" ? "active" : ""} onClick={() => setMeal({ ...meal, source: "manual", batchId: "" })}>Manuell måltid</button><button type="button" className={meal.source === "batch" ? "active" : ""} disabled={openBatches.length === 0 || pendingImage !== null} onClick={() => setMeal({ ...meal, source: "batch", batchId: meal.batchId || openBatches[0]?.id || "" })}>Ur en sats</button></div><div className="p100-composer-grid">{meal.source === "batch" ? <><label className="wide"><span>Sats</span><select required value={meal.batchId} onChange={(event) => setMeal({ ...meal, batchId: event.target.value })}>{openBatches.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.portionsLeft} kvar</option>)}</select></label><label><span>Portioner</span><input required inputMode="decimal" value={meal.portions} onChange={(event) => setMeal({ ...meal, portions: event.target.value })} /></label></> : <><label className="wide"><span>Vad åt du?</span><input value={meal.title} maxLength={160} placeholder={PROJECT100_MEAL_TYPE_LABELS[meal.mealType]} onChange={(event) => setMeal({ ...meal, title: event.target.value })} /></label><label><span>Protein · g</span><input inputMode="decimal" value={meal.proteinG} onChange={(event) => setMeal({ ...meal, proteinG: event.target.value })} /></label><label><span>Kolhydrater · g</span><input inputMode="decimal" value={meal.carbsG} onChange={(event) => setMeal({ ...meal, carbsG: event.target.value })} /></label><label><span>Fett · g</span><input inputMode="decimal" value={meal.fatG} onChange={(event) => setMeal({ ...meal, fatG: event.target.value })} /></label><label><span>Energi · kcal</span><input inputMode="decimal" value={meal.kcal} onChange={(event) => setMeal({ ...meal, kcal: event.target.value })} /></label></>}<label><span>Datum</span><input type="date" required max={view.today} value={meal.eatenOn} onChange={(event) => setMeal({ ...meal, eatenOn: event.target.value })} /></label><label><span>Tid</span><input type="time" value={meal.eatenAt} onChange={(event) => setMeal({ ...meal, eatenAt: event.target.value })} /></label><label><span>Måltidstyp</span><select value={meal.mealType} onChange={(event) => setMeal({ ...meal, mealType: event.target.value as Project100MealType })}>{PROJECT100_MEAL_TYPES.map((type) => <option key={type} value={type}>{PROJECT100_MEAL_TYPE_LABELS[type]}</option>)}</select></label><label><span>Hunger före · 1–5</span><input type="number" min="1" max="5" value={meal.hungerBefore} onChange={(event) => setMeal({ ...meal, hungerBefore: event.target.value })} /></label><label><span>Mättnad efter · 1–5</span><input type="number" min="1" max="5" value={meal.fullnessAfter} onChange={(event) => setMeal({ ...meal, fullnessAfter: event.target.value })} /></label><label className="wide"><span>Hur kändes måltiden?</span><textarea maxLength={1000} value={meal.note} onChange={(event) => setMeal({ ...meal, note: event.target.value })} /></label></div>{error ? <p className="p100-form-error">{error}</p> : null}<div className="p100-composer-actions"><button type="button" onClick={closeComposer}>Avbryt</button><button type="submit" disabled={busy}>{busy ? "Sparar…" : "Spara måltid"}</button></div></form></ModalShell> : null}

      {composer === "food" ? <ModalShell eyebrow="Eget råvarubibliotek" title="Lägg till råvara" description="Värdena används i dina satser. Lägg bara in sådant du faktiskt lagar med." onClose={closeComposer}><form onSubmit={submitFood}><div className="p100-composer-grid"><label className="wide"><span>Namn</span><input required maxLength={120} value={food.name} onChange={(event) => setFood({ ...food, name: event.target.value })} /></label><label><span>Protein / 100 g</span><input inputMode="decimal" value={food.proteinPer100g} onChange={(event) => setFood({ ...food, proteinPer100g: event.target.value })} /></label><label><span>Kolhydrater / 100 g</span><input inputMode="decimal" value={food.carbsPer100g} onChange={(event) => setFood({ ...food, carbsPer100g: event.target.value })} /></label><label><span>Fett / 100 g</span><input inputMode="decimal" value={food.fatPer100g} onChange={(event) => setFood({ ...food, fatPer100g: event.target.value })} /></label><label><span>kcal / 100 g</span><input inputMode="decimal" value={food.kcalPer100g} onChange={(event) => setFood({ ...food, kcalPer100g: event.target.value })} /></label><label className="p100-check-label"><input type="checkbox" checked={food.isStaple} onChange={(event) => setFood({ ...food, isStaple: event.target.checked })} /><span>Det här är en basvara hemma</span></label>{food.isStaple ? <label><span>Önskad mängd hemma · g</span><input inputMode="numeric" value={food.stapleTargetGrams} onChange={(event) => setFood({ ...food, stapleTargetGrams: event.target.value })} /></label> : null}</div>{error ? <p className="p100-form-error">{error}</p> : null}<div className="p100-composer-actions"><button type="button" onClick={closeComposer}>Avbryt</button><button type="submit" disabled={busy}>Spara råvara</button></div></form></ModalShell> : null}

      {composer === "batch" ? <ModalShell eyebrow="Matförberedelse" title="Bygg en sats" description="Råvarornas makron delas över portionerna och frysen räknas ned när du äter." onClose={closeComposer}><form onSubmit={submitBatch}><div className="p100-composer-grid"><label className="wide"><span>Namn</span><input required maxLength={120} value={batch.name} onChange={(event) => setBatch({ ...batch, name: event.target.value })} /></label><label><span>Lagades</span><input type="date" required max={view.today} value={batch.cookedOn} onChange={(event) => setBatch({ ...batch, cookedOn: event.target.value })} /></label><label><span>Antal portioner</span><input required inputMode="decimal" value={batch.portionsTotal} onChange={(event) => setBatch({ ...batch, portionsTotal: event.target.value })} /></label><label className="wide"><span>Anteckning</span><input maxLength={1000} value={batch.note} onChange={(event) => setBatch({ ...batch, note: event.target.value })} /></label></div><div className="p100-batch-builder"><header><div><strong>Råvaror</strong><small>Total mängd före tillagning</small></div><button type="button" onClick={() => setBatch({ ...batch, items: [...batch.items, { id: crypto.randomUUID(), foodId: view.foods[0]?.id ?? "", grams: "" }] })}><Plus /> Lägg till</button></header>{batch.items.map((item, index) => <div key={item.id}><b>{index + 1}</b><label><span>Råvara</span><select required value={item.foodId} onChange={(event) => setBatch({ ...batch, items: batch.items.map((candidate) => candidate.id === item.id ? { ...candidate, foodId: event.target.value } : candidate) })}>{view.foods.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label><label><span>Gram</span><input required inputMode="decimal" value={item.grams} onChange={(event) => setBatch({ ...batch, items: batch.items.map((candidate) => candidate.id === item.id ? { ...candidate, grams: event.target.value } : candidate) })} /></label><button type="button" disabled={batch.items.length === 1} onClick={() => setBatch({ ...batch, items: batch.items.filter((candidate) => candidate.id !== item.id) })} aria-label="Ta bort råvara"><X /></button></div>)}</div>{error ? <p className="p100-form-error">{error}</p> : null}<div className="p100-composer-actions"><button type="button" onClick={closeComposer}>Avbryt</button><button type="submit" disabled={busy || view.foods.length === 0}>Spara sats</button></div></form></ModalShell> : null}

      {composer === "supplement" ? <ModalShell eyebrow="Ditt eget val" title="Lägg till tillskott" description="Projekt 100 lagrar dos och syfte men hittar inte på medicinska råd eller ett godtyckligt klockslag." onClose={closeComposer}><form onSubmit={submitSupplement}><div className="p100-composer-grid"><label className="wide"><span>Namn</span><input required maxLength={80} value={supplement.name} onChange={(event) => setSupplement({ ...supplement, name: event.target.value })} /></label><label><span>Typ</span><select value={supplement.kind} onChange={(event) => { const kind = event.target.value as Project100SupplementKind; setSupplement({ ...supplement, kind, timingMatters: PROJECT100_TIMING_MATTERS[kind], timingNote: "" }); }}>{PROJECT100_SUPPLEMENT_KINDS.map((kind) => <option key={kind} value={kind}>{PROJECT100_SUPPLEMENT_KIND_LABELS[kind]}</option>)}</select></label><label><span>Dos</span><input inputMode="decimal" value={supplement.doseAmount} onChange={(event) => setSupplement({ ...supplement, doseAmount: event.target.value })} /></label><label><span>Enhet</span><select value={supplement.doseUnit} onChange={(event) => setSupplement({ ...supplement, doseUnit: event.target.value })}><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="st">st</option></select></label><label className="wide"><span>Syfte</span><input maxLength={300} value={supplement.purpose} onChange={(event) => setSupplement({ ...supplement, purpose: event.target.value })} /></label>{supplement.timingMatters ? <label className="wide"><span>När spelar tidpunkten roll?</span><input maxLength={300} value={supplement.timingNote} onChange={(event) => setSupplement({ ...supplement, timingNote: event.target.value })} /></label> : <p className="p100-timing-note"><Info /> {PROJECT100_TIMING_NOTES[supplement.kind]}</p>}</div>{error ? <p className="p100-form-error">{error}</p> : null}<div className="p100-composer-actions"><button type="button" onClick={closeComposer}>Avbryt</button><button type="submit" disabled={busy}>Spara tillskott</button></div></form></ModalShell> : null}

      {composer === "target" ? <ModalShell eyebrow="Förslag, inte facit" title="Anpassa proteinriktmärket" description="Lämna tomt för att återgå till intervallet som räknas ur verklig vikt och träningsvecka." onClose={closeComposer}><form onSubmit={submitTarget}><label className="p100-target-input"><span>Eget riktmärke · gram per dag</span><input inputMode="decimal" placeholder={view.target.lowGrams?.toString() ?? ""} value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} /><small>Det beräknade intervallet försvinner inte; ditt värde visas som aktivt riktmärke ovanpå det.</small></label>{error ? <p className="p100-form-error">{error}</p> : null}<div className="p100-composer-actions"><button type="button" onClick={closeComposer}>Avbryt</button><button type="submit" disabled={busy}>{targetDraft.trim() ? "Spara eget mål" : "Använd beräknat intervall"}</button></div></form></ModalShell> : null}
    </div>
  );
}
