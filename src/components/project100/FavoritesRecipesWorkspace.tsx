"use client";

import {
  Beef,
  Bookmark,
  ChefHat,
  CookingPot,
  Flame,
  Pencil,
  Plus,
  Trash2,
  Wheat,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  recipePortionMacros,
  type Project100Food,
  type Project100Recipe,
} from "@/lib/project100-nutrition";

interface RecipeItemDraft {
  id: string;
  foodId: string;
  grams: string;
}

interface RecipeDraft {
  name: string;
  description: string;
  servingsDefault: string;
  isFavorite: boolean;
  instructions: string;
  items: RecipeItemDraft[];
}

interface CookBatchDraft {
  recipeId: string;
  recipeName: string;
  name: string;
  cookedOn: string;
  portionsTotal: string;
  note: string;
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

export function FavoritesRecipesWorkspace({
  initialRecipes,
  foods,
  today,
}: {
  initialRecipes: Project100Recipe[];
  foods: Project100Food[];
  today: string;
}) {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Project100Recipe[]>(initialRecipes);
  const [filterFavorite, setFilterFavorite] = useState(false);
  const [composer, setComposer] = useState<"recipe" | "cook" | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>({
    name: "",
    description: "",
    servingsDefault: "4",
    isFavorite: true,
    instructions: "",
    items: [{ id: crypto.randomUUID(), foodId: foods[0]?.id ?? "", grams: "400" }],
  });

  const [cookDraft, setCookDraft] = useState<CookBatchDraft | null>(null);

  const displayedRecipes = filterFavorite
    ? recipes.filter((r) => r.isFavorite)
    : recipes;

  function openCreateRecipe() {
    setError(null);
    setEditingRecipeId(null);
    setRecipeDraft({
      name: "",
      description: "",
      servingsDefault: "4",
      isFavorite: true,
      instructions: "",
      items: [{ id: crypto.randomUUID(), foodId: foods[0]?.id ?? "", grams: "400" }],
    });
    setComposer("recipe");
  }

  function openEditRecipe(recipe: Project100Recipe) {
    setError(null);
    setEditingRecipeId(recipe.id);
    setRecipeDraft({
      name: recipe.name,
      description: recipe.description ?? "",
      servingsDefault: String(recipe.servingsDefault),
      isFavorite: recipe.isFavorite,
      instructions: recipe.instructions ?? "",
      items: recipe.items.map((item) => ({
        id: crypto.randomUUID(),
        foodId: item.foodId,
        grams: String(item.grams),
      })),
    });
    setComposer("recipe");
  }

  function openCookBatch(recipe: Project100Recipe) {
    setError(null);
    setCookDraft({
      recipeId: recipe.id,
      recipeName: recipe.name,
      name: recipe.name,
      cookedOn: today,
      portionsTotal: String(recipe.servingsDefault),
      note: recipe.instructions ?? "",
    });
    setComposer("cook");
  }

  async function submitRecipe(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (recipeDraft.items.length === 0) {
        throw new Error("Ett recept måste innehålla minst en råvara.");
      }
      const payload = {
        name: recipeDraft.name.trim(),
        description: recipeDraft.description.trim() || null,
        servingsDefault: requiredNumber(recipeDraft.servingsDefault, "Standardportioner"),
        isFavorite: recipeDraft.isFavorite,
        instructions: recipeDraft.instructions.trim() || null,
        items: recipeDraft.items.map((item) => ({
          foodId: item.foodId,
          grams: requiredNumber(item.grams, "Mängd"),
        })),
      };

      const response = await fetch(
        editingRecipeId
          ? `/api/project100/nutrition/recipes/${encodeURIComponent(editingRecipeId)}`
          : "/api/project100/nutrition/recipes",
        {
          method: editingRecipeId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw await failureFrom(response, "Receptet kunde inte sparas.");
      const saved = (await response.json()) as { recipe: Project100Recipe };
      setRecipes((current) => [saved.recipe, ...current.filter((r) => r.id !== saved.recipe.id)]);
      setEditingRecipeId(null);
      setComposer(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte spara recept.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCookBatch(event: React.FormEvent) {
    event.preventDefault();
    if (!cookDraft) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: cookDraft.name.trim() || cookDraft.recipeName,
        cookedOn: cookDraft.cookedOn,
        portionsTotal: requiredNumber(cookDraft.portionsTotal, "Antal portioner"),
        note: cookDraft.note.trim() || null,
      };

      const response = await fetch(
        `/api/project100/nutrition/recipes/${encodeURIComponent(cookDraft.recipeId)}/cook-batch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw await failureFrom(response, "Kunde inte tillaga sats ur recept.");
      setComposer(null);
      router.push("/projekt-100/kost");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte tillaga sats.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRecipe(id: string) {
    if (!window.confirm("Vill du ta bort det här receptet?")) return;
    const response = await fetch(`/api/project100/nutrition/recipes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Receptet kunde inte tas bort.")).message);
      return;
    }
    setRecipes((current) => current.filter((r) => r.id !== id));
    router.refresh();
  }

  return (
    <div className="p100-nutrition-workspace">
      <header className="p100-page-head p100-nutrition-head">
        <div>
          <span>Kostens receptbank</span>
          <h1>Favoriter & Recept</h1>
          <p>
            Bygg recept och favoritmåltider ur dina egna råvaror. Skala portioner matematiskt
            och omvandla till matlådor i frysen med ett tryck.
          </p>
        </div>
        <div className="p100-head-actions">
          <button type="button" className="p100-button" onClick={openCreateRecipe}>
            <Plus /> Skapa nytt recept
          </button>
        </div>
      </header>

      {/* Sub-nav mellan kostsidorna */}
      <nav className="p100-tab-nav" aria-label="Kostsektioner">
        <Link href="/projekt-100/kost">Idag & Logg</Link>
        <Link href="/projekt-100/kost/favoriter" className="active">
          Favoriter & Recept
        </Link>
        <Link href="/projekt-100/kost/planering">Veckoplanering & Inköp</Link>
      </nav>

      <section className="p100-nutrition-panel">
        <header>
          <div>
            <span>Dina sparade rätter</span>
            <h2>Recept ({displayedRecipes.length})</h2>
          </div>
          <div className="p100-filter-toggle">
            <button
              type="button"
              className={!filterFavorite ? "active" : ""}
              onClick={() => setFilterFavorite(false)}
            >
              Alla ({recipes.length})
            </button>
            <button
              type="button"
              className={filterFavorite ? "active" : ""}
              onClick={() => setFilterFavorite(true)}
            >
              <Bookmark /> Bara favoriter ({recipes.filter((r) => r.isFavorite).length})
            </button>
          </div>
        </header>

        {displayedRecipes.length === 0 ? (
          <div className="p100-nutrition-empty">
            <ChefHat />
            <strong>Inga recept sparade ännu</strong>
            <span>
              Lägg till dina favoritgrytor, proteinmåltider och matlåderecept så kan du snabbt
              planera veckan och laga satser till frysen.
            </span>
            <button type="button" className="p100-button" onClick={openCreateRecipe}>
              <Plus /> Skapa första receptet
            </button>
          </div>
        ) : (
          <div className="p100-batch-grid">
            {displayedRecipes.map((recipe) => {
              const portionMacros = recipePortionMacros(recipe);
              return (
                <article key={recipe.id}>
                  <header>
                    <span>
                      <CookingPot />
                    </span>
                    <div>
                      <small>
                        {recipe.servingsDefault} portioner bas ·{" "}
                        {recipe.isFavorite ? "Favorit" : "Recept"}
                      </small>
                      <strong>{recipe.name}</strong>
                    </div>
                  </header>
                  {recipe.description ? <p>{recipe.description}</p> : null}
                  <div className="p100-recipe-macro-badge">
                    <span>
                      <Beef /> {portionMacros.proteinG} g protein
                    </span>
                    <span>
                      <Wheat /> {portionMacros.carbsG} g kolhydrater
                    </span>
                    <span>
                      <Flame /> {portionMacros.kcal} kcal
                    </span>
                    <small>per portion</small>
                  </div>
                  <div className="p100-recipe-ingredient-list">
                    <strong>Råvaror ({recipe.items.length})</strong>
                    <ul>
                      {recipe.items.map((item) => (
                        <li key={item.id}>
                          <span>{item.name}</span>
                          <b>{item.grams} g</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {recipe.instructions ? (
                    <details className="p100-recipe-instructions">
                      <summary>Tillagning / instruktion</summary>
                      <p>{recipe.instructions}</p>
                    </details>
                  ) : null}
                  <footer>
                    <button
                      type="button"
                      className="p100-button-secondary"
                      onClick={() => openCookBatch(recipe)}
                    >
                      <ChefHat /> Laga som sats i frysen
                    </button>
                    <button
                      type="button"
                      className="p100-button-secondary"
                      onClick={() => openEditRecipe(recipe)}
                    >
                      <Pencil /> Redigera
                    </button>
                    <button
                      type="button"
                      className="p100-icon-button-danger"
                      onClick={() => void removeRecipe(recipe.id)}
                      aria-label={`Ta bort ${recipe.name}`}
                    >
                      <Trash2 />
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Skapa recept modal */}
      {composer === "recipe" ? (
        <ModalShell
          eyebrow="Eget recept"
          title={editingRecipeId ? "Redigera recept" : "Skapa nytt recept"}
          description="Råvarornas näringsvärden räknas ut automatiskt per portion."
          onClose={() => {
            setEditingRecipeId(null);
            setComposer(null);
          }}
        >
          <form onSubmit={submitRecipe}>
            <div className="p100-composer-grid">
              <label className="wide">
                <span>Receptnamn</span>
                <input
                  required
                  maxLength={120}
                  placeholder="t.ex. Kycklinggryta med ris"
                  value={recipeDraft.name}
                  onChange={(e) => setRecipeDraft({ ...recipeDraft, name: e.target.value })}
                />
              </label>
              <label className="wide">
                <span>Kort beskrivning (valfritt)</span>
                <input
                  maxLength={1000}
                  placeholder="t.ex. Perfekt för söndags-prep och 4 matlådor"
                  value={recipeDraft.description}
                  onChange={(e) => setRecipeDraft({ ...recipeDraft, description: e.target.value })}
                />
              </label>
              <label>
                <span>Antal basportioner</span>
                <input
                  required
                  inputMode="decimal"
                  value={recipeDraft.servingsDefault}
                  onChange={(e) => setRecipeDraft({ ...recipeDraft, servingsDefault: e.target.value })}
                />
              </label>
              <label className="p100-check-label">
                <input
                  type="checkbox"
                  checked={recipeDraft.isFavorite}
                  onChange={(e) => setRecipeDraft({ ...recipeDraft, isFavorite: e.target.checked })}
                />
                <span>Markera som favorit</span>
              </label>
              <label className="wide">
                <span>Tillagning & receptinstruktion (valfritt)</span>
                <textarea
                  maxLength={4000}
                  placeholder="Steg för steg instruktioner..."
                  value={recipeDraft.instructions}
                  onChange={(e) => setRecipeDraft({ ...recipeDraft, instructions: e.target.value })}
                />
              </label>
            </div>

            <div className="p100-batch-builder">
              <header>
                <div>
                  <strong>Ingredienser / Råvaror</strong>
                  <small>Mängd för basantalet portioner</small>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRecipeDraft({
                      ...recipeDraft,
                      items: [
                        ...recipeDraft.items,
                        { id: crypto.randomUUID(), foodId: foods[0]?.id ?? "", grams: "200" },
                      ],
                    })
                  }
                >
                  <Plus /> Lägg till råvara
                </button>
              </header>

              {recipeDraft.items.map((item, index) => (
                <div key={item.id}>
                  <b>{index + 1}</b>
                  <label>
                    <span>Råvara</span>
                    <select
                      required
                      value={item.foodId}
                      onChange={(e) =>
                        setRecipeDraft({
                          ...recipeDraft,
                          items: recipeDraft.items.map((c) =>
                            c.id === item.id ? { ...c, foodId: e.target.value } : c,
                          ),
                        })
                      }
                    >
                      {foods.map((food) => (
                        <option key={food.id} value={food.id}>
                          {food.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Gram</span>
                    <input
                      required
                      inputMode="decimal"
                      value={item.grams}
                      onChange={(e) =>
                        setRecipeDraft({
                          ...recipeDraft,
                          items: recipeDraft.items.map((c) =>
                            c.id === item.id ? { ...c, grams: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={recipeDraft.items.length === 1}
                    onClick={() =>
                      setRecipeDraft({
                        ...recipeDraft,
                        items: recipeDraft.items.filter((c) => c.id !== item.id),
                      })
                    }
                    aria-label="Ta bort råvara"
                  >
                    <X />
                  </button>
                </div>
              ))}
            </div>

            {error ? <p className="p100-form-error">{error}</p> : null}
            <div className="p100-composer-actions">
              <button
                type="button"
                onClick={() => {
                  setEditingRecipeId(null);
                  setComposer(null);
                }}
              >
                Avbryt
              </button>
              <button type="submit" disabled={busy || foods.length === 0}>
                {busy ? "Sparar…" : editingRecipeId ? "Uppdatera recept" : "Spara recept"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {/* Tillaga sats ur recept modal */}
      {composer === "cook" && cookDraft ? (
        <ModalShell
          eyebrow="Skapa matlådor"
          title={`Laga sats av ${cookDraft.recipeName}`}
          description="Ingredienserna skalas automatiskt för det antal portioner du väljer att tillaga och sparas i frysen."
          onClose={() => setComposer(null)}
        >
          <form onSubmit={submitCookBatch}>
            <div className="p100-composer-grid">
              <label className="wide">
                <span>Namn på satsen</span>
                <input
                  required
                  maxLength={120}
                  value={cookDraft.name}
                  onChange={(e) => setCookDraft({ ...cookDraft, name: e.target.value })}
                />
              </label>
              <label>
                <span>Tillagningsdatum</span>
                <input
                  type="date"
                  required
                  max={today}
                  value={cookDraft.cookedOn}
                  onChange={(e) => setCookDraft({ ...cookDraft, cookedOn: e.target.value })}
                />
              </label>
              <label>
                <span>Antal portioner att tillaga</span>
                <input
                  required
                  inputMode="decimal"
                  value={cookDraft.portionsTotal}
                  onChange={(e) => setCookDraft({ ...cookDraft, portionsTotal: e.target.value })}
                />
              </label>
              <label className="wide">
                <span>Anteckning / infrysning</span>
                <input
                  maxLength={1000}
                  placeholder="t.ex. 6 matlådor frysta, 1 portion äts ikväll"
                  value={cookDraft.note}
                  onChange={(e) => setCookDraft({ ...cookDraft, note: e.target.value })}
                />
              </label>
            </div>

            {error ? <p className="p100-form-error">{error}</p> : null}
            <div className="p100-composer-actions">
              <button type="button" onClick={() => setComposer(null)}>
                Avbryt
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Skapar sats…" : "Spara sats i frysen"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}
