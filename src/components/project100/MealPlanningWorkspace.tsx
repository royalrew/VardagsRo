"use client";

import {
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { addCalendarDateDays } from "@/lib/dates";
import {
  PROJECT100_MEAL_TYPES,
  PROJECT100_MEAL_TYPE_LABELS,
  type Project100MealType,
  type Project100ShoppingItem,
  type Project100WeeklyMealPlanView,
} from "@/lib/project100-nutrition";

const shortDate = new Intl.DateTimeFormat("sv-SE", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function dateLabel(value: string): string {
  return shortDate.format(new Date(`${value}T12:00:00Z`));
}

function timeRange(startsAt: string, endsAt: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
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
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="p100-modal-head">
          <div>
            <span className="p100-kicker">{eyebrow}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng">
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function MealPlanningWorkspace({
  initialWeek,
}: {
  initialWeek: Project100WeeklyMealPlanView;
}) {
  const router = useRouter();
  const week = initialWeek;
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [pantryItemToEdit, setPantryItemToEdit] = useState<{ foodId: string; name: string; grams: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planDraft, setPlanDraft] = useState<{
    source: "recipe" | "batch" | "custom";
    recipeId: string;
    batchId: string;
    title: string;
    mealType: Project100MealType;
    portions: string;
    note: string;
  }>({
    source: initialWeek.recipes.length > 0 ? "recipe" : "custom",
    recipeId: initialWeek.recipes[0]?.id ?? "",
    batchId: initialWeek.batches[0]?.id ?? "",
    title: "",
    mealType: "lunch",
    portions: "1",
    note: "",
  });

  function openPlanModal(date: string) {
    setError(null);
    setComposerDate(date);
    const hasRecipes = week.recipes.length > 0;
    const hasBatches = week.batches.some((b) => b.portionsLeft > 0);
    const defaultSource = hasRecipes ? "recipe" : hasBatches ? "batch" : "custom";
    setPlanDraft({
      source: defaultSource,
      recipeId: week.recipes[0]?.id ?? "",
      batchId: week.batches[0]?.id ?? "",
      title: "",
      mealType: "lunch",
      portions: "1",
      note: "",
    });
  }

  async function submitPlan(event: React.FormEvent) {
    event.preventDefault();
    if (!composerDate) return;
    setBusy(true);
    setError(null);
    try {
      let finalTitle = planDraft.title.trim();
      let recipeId: string | null = null;
      let batchId: string | null = null;

      if (planDraft.source === "recipe") {
        const recipe = week.recipes.find((r) => r.id === planDraft.recipeId);
        if (!recipe) throw new Error("Välj ett giltigt recept.");
        recipeId = recipe.id;
        finalTitle = recipe.name;
      } else if (planDraft.source === "batch") {
        const batch = week.batches.find((b) => b.id === planDraft.batchId);
        if (!batch) throw new Error("Välj en giltig sats.");
        batchId = batch.id;
        finalTitle = batch.name;
      } else {
        if (!finalTitle) throw new Error("Ange vad måltiden heter.");
      }

      const payload = {
        plannedDate: composerDate,
        plannedMinute: null,
        mealType: planDraft.mealType,
        source: planDraft.source,
        recipeId,
        batchId,
        title: finalTitle,
        portions: requiredNumber(planDraft.portions, "Antal portioner"),
        isCooked: false,
        note: planDraft.note.trim() || null,
      };

      const response = await fetch("/api/project100/nutrition/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await failureFrom(response, "Kunde inte spara planerad måltid.");
      setComposerDate(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(id: string) {
    const response = await fetch(`/api/project100/nutrition/plan/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Kunde inte ta bort planerad måltid.")).message);
      return;
    }
    router.refresh();
  }

  async function markShoppingBought(item: Project100ShoppingItem) {
    const newStock = (item.inStockGrams || 0) + item.buyGrams;
    const response = await fetch("/api/project100/nutrition/pantry", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        foodId: item.foodId,
        inStockGrams: newStock,
      }),
    });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Kunde inte uppdatera skafferisaldo.")).message);
      return;
    }
    router.refresh();
  }

  async function submitPantryUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!pantryItemToEdit) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/nutrition/pantry", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          foodId: pantryItemToEdit.foodId,
          inStockGrams: optionalNumber(pantryItemToEdit.grams, "Skafferisaldo"),
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Kunde inte uppdatera skafferi.");
      setPantryItemToEdit(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }

  const prevWeek = addCalendarDateDays(week.weekStart, -7);
  const nextWeek = addCalendarDateDays(week.weekStart, 7);

  return (
    <div className="p100-nutrition-workspace">
      <header className="p100-page-head p100-nutrition-head">
        <div>
          <span>Schemasmart måltidslogistik</span>
          <h1>Veckoplanering & Inköp</h1>
          <p>
            Planera maten runt dina verkliga arbetspass. Inköpslistan härleds deterministiskt från
            veckans planerade recept minus vad som redan finns i skafferiet.
          </p>
        </div>
      </header>

      {/* Sub-nav mellan kostsidorna */}
      <nav className="p100-tab-nav" aria-label="Kostsektioner">
        <Link href="/projekt-100/kost">Idag & Logg</Link>
        <Link href="/projekt-100/kost/favoriter">Favoriter & Recept</Link>
        <Link href="/projekt-100/kost/planering" className="active">
          Veckoplanering & Inköp
        </Link>
      </nav>

      {/* Veckonavigator */}
      <nav className="p100-nutrition-day-nav" aria-label="Välj vecka">
        <Link href={`/projekt-100/kost/planering?vecka=${prevWeek}`} aria-label="Föregående vecka">
          <ChevronLeft />
        </Link>
        <div>
          <small>Vecka</small>
          <strong>
            {dateLabel(week.weekStart)} – {dateLabel(week.weekEnd)}
          </strong>
        </div>
        <Link href={`/projekt-100/kost/planering?vecka=${nextWeek}`} aria-label="Nästa vecka">
          <ChevronRight />
        </Link>
      </nav>

      <div className="p100-nutrition-main-grid">
        {/* Veckans 7 dagar */}
        <section className="p100-nutrition-panel">
          <header>
            <div>
              <span>7-dagars översikt</span>
              <h2>Måltidsplan & Jobbschema</h2>
            </div>
          </header>

          <div className="p100-weekly-plan-list">
            {week.days.map((day) => (
              <article key={day.date} className={`p100-day-plan-card ${day.isToday ? "today" : ""}`}>
                <header className="p100-day-plan-head">
                  <div>
                    <strong>{dateLabel(day.date)}</strong>
                    {day.isToday ? <span className="p100-today-pill">Idag</span> : null}
                  </div>
                  {day.workEvents.length > 0 ? (
                    <div className="p100-work-badge">
                      <BriefcaseBusiness />
                      <span>
                        {day.workEvents
                          .map((ev) => timeRange(ev.startsAt, ev.endsAt, week.timeZone))
                          .join(", ")}
                      </span>
                    </div>
                  ) : (
                    <span className="p100-off-badge">Ledig dag</span>
                  )}
                </header>

                {/* Planerade måltider */}
                {day.plans.length === 0 ? (
                  <p className="p100-day-empty">Inga måltider planerade ännu.</p>
                ) : (
                  <ul className="p100-day-meal-items">
                    {day.plans.map((plan) => (
                      <li key={plan.id}>
                        <div>
                          <small>{PROJECT100_MEAL_TYPE_LABELS[plan.mealType]}</small>
                          <strong>{plan.title}</strong>
                          <span>
                            {plan.portions} port ·{" "}
                            {plan.source === "recipe"
                              ? "Recept"
                              : plan.source === "batch"
                              ? "Matlåda"
                              : "Anpassad"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removePlan(plan.id)}
                          aria-label={`Ta bort ${plan.title}`}
                        >
                          <Trash2 />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <footer>
                  <button
                    type="button"
                    className="p100-button-secondary p100-btn-sm"
                    onClick={() => openPlanModal(day.date)}
                  >
                    <Plus /> Planera måltid
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        {/* Härledd inköpslista & Skafferi */}
        <section className="p100-nutrition-panel p100-shopping-panel">
          <header>
            <div>
              <span>Deterministisk kalkyl</span>
              <h2>Inköpslista ({week.shoppingList.items.length})</h2>
            </div>
            <ShoppingBag />
          </header>

          {week.shoppingList.items.length === 0 ? (
            <div className="p100-suggestion-empty">
              <Check />
              <strong>Skafferiet täcker hela veckan</strong>
              <p>
                Inga råvaror saknas inför veckans planerade måltider eller basvarubuffertar.
              </p>
            </div>
          ) : (
            <div className="p100-shopping-list">
              <div className="p100-shopping-total">
                <small>Totalt inköpsbehov</small>
                <strong>{(week.shoppingList.totalGramsToBuy / 1000).toLocaleString("sv-SE")} kg</strong>
              </div>
              <ul>
                {week.shoppingList.items.map((item) => (
                  <li key={item.foodId} className="p100-shopping-item">
                    <div className="p100-shopping-item-main">
                      <div className="p100-shopping-item-title">
                        <strong>{item.name}</strong>
                        <b>Köp {item.buyGrams} g</b>
                      </div>
                      <div className="p100-shopping-item-meta">
                        <span>Behov: {item.neededGrams} g</span>
                        <span>I skafferi: {item.inStockGrams} g</span>
                        {item.stapleTargetGrams ? (
                          <span>Basvara mål: {item.stapleTargetGrams} g</span>
                        ) : null}
                      </div>
                      <ul className="p100-shopping-reasons">
                        {item.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <button
                      type="button"
                      className="p100-shopping-bought-btn"
                      onClick={() => void markShoppingBought(item)}
                      title="Markera som handlad (lägger till i skafferi)"
                    >
                      <PackageCheck /> Köpt
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skafferisaldo snabböversikt */}
          <div className="p100-pantry-section">
            <header>
              <div>
                <span>Inventering hemma</span>
                <h3>Skafferisalden</h3>
              </div>
            </header>
            <ul className="p100-pantry-list">
              {week.foods.slice(0, 10).map((food) => (
                <li key={food.id}>
                  <div>
                    <strong>{food.name}</strong>
                    <small>
                      {food.inStockGrams !== null ? `${food.inStockGrams} g hemma` : "Ej inventerad"}
                      {food.isStaple && food.stapleTargetGrams
                        ? ` (mål: ${food.stapleTargetGrams} g)`
                        : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPantryItemToEdit({
                        foodId: food.id,
                        name: food.name,
                        grams: String(food.inStockGrams ?? ""),
                      })
                    }
                  >
                    <Pencil /> Ändra
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Planera måltid modal */}
      {composerDate ? (
        <ModalShell
          eyebrow={`Planera ${dateLabel(composerDate)}`}
          title="Lägg till i veckoplanen"
          description="Välj ur dina favoritrecept, en infryst sats eller skriv in en anpassad måltid."
          onClose={() => setComposerDate(null)}
        >
          <form onSubmit={submitPlan}>
            <div className="p100-status-choice">
              <button
                type="button"
                className={planDraft.source === "recipe" ? "active" : ""}
                disabled={week.recipes.length === 0}
                onClick={() => setPlanDraft({ ...planDraft, source: "recipe" })}
              >
                Recept ({week.recipes.length})
              </button>
              <button
                type="button"
                className={planDraft.source === "batch" ? "active" : ""}
                disabled={week.batches.length === 0}
                onClick={() => setPlanDraft({ ...planDraft, source: "batch" })}
              >
                Sats i frysen
              </button>
              <button
                type="button"
                className={planDraft.source === "custom" ? "active" : ""}
                onClick={() => setPlanDraft({ ...planDraft, source: "custom" })}
              >
                Anpassad
              </button>
            </div>

            <div className="p100-composer-grid">
              {planDraft.source === "recipe" ? (
                <label className="wide">
                  <span>Välj recept</span>
                  <select
                    required
                    value={planDraft.recipeId}
                    onChange={(e) => setPlanDraft({ ...planDraft, recipeId: e.target.value })}
                  >
                    {week.recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.servingsDefault} port bas)
                      </option>
                    ))}
                  </select>
                </label>
              ) : planDraft.source === "batch" ? (
                <label className="wide">
                  <span>Välj sats</span>
                  <select
                    required
                    value={planDraft.batchId}
                    onChange={(e) => setPlanDraft({ ...planDraft, batchId: e.target.value })}
                  >
                    {week.batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {b.portionsLeft} kvar i frysen
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="wide">
                  <span>Vad planerar du att äta?</span>
                  <input
                    required
                    maxLength={160}
                    placeholder="t.ex. Kyckling med sötpotatis"
                    value={planDraft.title}
                    onChange={(e) => setPlanDraft({ ...planDraft, title: e.target.value })}
                  />
                </label>
              )}

              <label>
                <span>Måltidstyp</span>
                <select
                  value={planDraft.mealType}
                  onChange={(e) =>
                    setPlanDraft({ ...planDraft, mealType: e.target.value as Project100MealType })
                  }
                >
                  {PROJECT100_MEAL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PROJECT100_MEAL_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Portioner</span>
                <input
                  required
                  inputMode="decimal"
                  value={planDraft.portions}
                  onChange={(e) => setPlanDraft({ ...planDraft, portions: e.target.value })}
                />
              </label>

              <label className="wide">
                <span>Anteckning / timing</span>
                <input
                  maxLength={1000}
                  placeholder="t.ex. Äts på rasten 12:30"
                  value={planDraft.note}
                  onChange={(e) => setPlanDraft({ ...planDraft, note: e.target.value })}
                />
              </label>
            </div>

            {error ? <p className="p100-form-error">{error}</p> : null}
            <div className="p100-composer-actions">
              <button type="button" onClick={() => setComposerDate(null)}>
                Avbryt
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Sparar plan…" : "Lägg till plan"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {/* Uppdatera skafferi modal */}
      {pantryItemToEdit ? (
        <ModalShell
          eyebrow="Skafferisaldo"
          title={`Uppdatera ${pantryItemToEdit.name}`}
          description="Hur mycket har du hemma i skafferiet eller kylen just nu?"
          onClose={() => setPantryItemToEdit(null)}
        >
          <form onSubmit={submitPantryUpdate}>
            <div className="p100-composer-grid">
              <label className="wide">
                <span>Mängd hemma · gram</span>
                <input
                  required
                  inputMode="decimal"
                  placeholder="t.ex. 500"
                  value={pantryItemToEdit.grams}
                  onChange={(e) =>
                    setPantryItemToEdit({ ...pantryItemToEdit, grams: e.target.value })
                  }
                />
              </label>
            </div>
            {error ? <p className="p100-form-error">{error}</p> : null}
            <div className="p100-composer-actions">
              <button type="button" onClick={() => setPantryItemToEdit(null)}>
                Avbryt
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Sparar…" : "Uppdatera saldo"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}
