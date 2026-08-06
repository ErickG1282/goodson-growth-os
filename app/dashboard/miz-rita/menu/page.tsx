"use client";

import {
  CheckCircle2,
  Copy,
  ImageIcon,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type Meal = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  category: string;
  serving_size: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  selling_price: number;
  food_cost: number;
  cooking_instructions: string | null;
  packaging_instructions: string | null;
  heating_instructions: string | null;
  customer_notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type MealIngredient = {
  id: string;
  meal_id: string;
  inventory_item_id: string;
  ingredient_name: string;
  inventory_unit: string;
  quantity_required: number;
  recipe_unit: string;
  preparation_notes: string | null;
};

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  parLevel: number;
  costPerUnit: number;
};

type MealForm = {
  name: string;
  description: string;
  photoUrl: string;
  category: string;
  servingSize: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  sodium: string;
  sellingPrice: string;
  foodCost: string;
  cookingInstructions: string;
  packagingInstructions: string;
  heatingInstructions: string;
  customerNotes: string;
  status: string;
  ingredients: Array<{ id?: string; inventoryItemId: string; ingredientName: string; inventoryUnit: string; quantity: string; recipeUnit: string; preparationNotes: string }>;
};

type MealTextField = Exclude<keyof MealForm, "ingredients">;

type OrderSale = { meal_id: string | null };

const emptyMealForm: MealForm = {
  name: "",
  description: "",
  photoUrl: "",
  category: "Lunch",
  servingSize: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sugar: "",
  sodium: "",
  sellingPrice: "",
  foodCost: "",
  cookingInstructions: "",
  packagingInstructions: "",
  heatingInstructions: "",
  customerNotes: "",
  status: "Active",
  ingredients: [{ inventoryItemId: "", ingredientName: "", inventoryUnit: "", quantity: "", recipeUnit: "oz", preparationNotes: "" }],
};

const recipeUnits = ["g", "kg", "oz", "lb", "tsp", "tbsp", "cup", "ml", "L", "each", "slice", "piece", "package"];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const number = (value: string | number) => Number(value) || 0;

export default function MenuPage() {
  const [businessId, setBusinessId] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [ingredients, setIngredients] = useState<MealIngredient[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orderSales, setOrderSales] = useState<OrderSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All Meals");
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null | "new">(null);
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const loadMenu = useCallback(async () => {
    setError("");
    async function runLoggedQuery<T extends { data: unknown; error: unknown }>(label: string, request: PromiseLike<T>) {
      console.info(`[Menu load] request: ${label}`);
      const response = await request;
      const supabaseError = response.error && typeof response.error === "object"
        ? response.error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
        : null;
      console.info(`[Menu load] response.error?.message: ${label}`, supabaseError?.message);
      console.info(`[Menu load] response.error?.details: ${label}`, supabaseError?.details);
      console.info(`[Menu load] response.error?.hint: ${label}`, supabaseError?.hint);
      console.info(`[Menu load] response.error?.code: ${label}`, supabaseError?.code);
      console.info(`[Menu load] full response object: ${label}`, response);
      if (response.error) console.error(`[Menu load] complete Supabase error: ${label}`, {
        message: supabaseError?.message,
        details: supabaseError?.details,
        hint: supabaseError?.hint,
        code: supabaseError?.code,
        error: response.error,
      });
      return response;
    }
    try {
      const { data: business, error: businessError } = await runLoggedQuery(
        "public.gbgs_businesses by Miz Rita slug",
        supabase.schema("public").from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle(),
      );
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);
      console.info("[Menu load] current business_id:", business.id);

      const [mealsResult, ingredientsResult, ordersResult, inventoryResult] = await Promise.all([
        runLoggedQuery("public.gbgs_menu_meals", supabase.schema("public").from("gbgs_menu_meals").select("*").eq("business_id", business.id).order("name")),
        runLoggedQuery("public.gbgs_menu_ingredients", supabase.schema("public").from("gbgs_menu_ingredients").select("*")),
        runLoggedQuery("public.gbgs_orders", supabase.schema("public").from("gbgs_orders").select("meal_id").eq("business_id", business.id)),
        runLoggedQuery("public.gbgs_inventory_items", supabase.schema("public").from("gbgs_inventory_items").select("id, name, quantity, unit, par_level, cost_per_unit").eq("business_id", business.id).order("name")),
      ]);
      console.info("[Menu load] menu meals response:", mealsResult);
      console.info("[Menu load] menu ingredients response:", ingredientsResult);
      console.info("[Menu load] inventory response:", inventoryResult);
      if (!inventoryResult.error && !inventoryResult.data?.length) {
        const unfilteredInventoryResult = await runLoggedQuery(
          "public.gbgs_inventory_items without business_id filter (diagnostic)",
          supabase.schema("public").from("gbgs_inventory_items").select("id, business_id, name, category").order("name"),
        );
        const returnedBusinessIds = [...new Set((unfilteredInventoryResult.data ?? []).map((item) => item.business_id))];
        console.warn("[Menu load] business_id filter returned zero rows", { currentBusinessId: business.id, returnedBusinessIds });
      }
      if (mealsResult.error || ingredientsResult.error || ordersResult.error || inventoryResult.error) {
        throw mealsResult.error ?? ingredientsResult.error ?? ordersResult.error ?? inventoryResult.error;
      }
      setMeals((mealsResult.data ?? []) as Meal[]);
      const loadedMenuIngredients = (ingredientsResult.data ?? []).map((ingredient) => ({
        ...ingredient,
        ingredient_name: typeof ingredient.ingredient_name === "string" ? ingredient.ingredient_name : (inventoryResult.data ?? []).find((item) => item.id === ingredient.inventory_item_id)?.name ?? "",
        inventory_unit: typeof ingredient.inventory_unit === "string" ? ingredient.inventory_unit : typeof ingredient.unit === "string" ? ingredient.unit : (inventoryResult.data ?? []).find((item) => item.id === ingredient.inventory_item_id)?.unit ?? "",
        recipe_unit: typeof ingredient.recipe_unit === "string" ? ingredient.recipe_unit : (inventoryResult.data ?? []).find((item) => item.id === ingredient.inventory_item_id)?.unit ?? "each",
        preparation_notes: typeof ingredient.preparation_notes === "string" ? ingredient.preparation_notes : null,
      })) as MealIngredient[];
      console.info("[Menu load] normalized menu ingredients array:", loadedMenuIngredients);
      setIngredients(loadedMenuIngredients);
      setOrderSales((ordersResult.data ?? []) as OrderSale[]);
      const dropdownIngredients = (inventoryResult.data ?? []).map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), unit: item.unit, parLevel: Number(item.par_level), costPerUnit: Number(item.cost_per_unit) }));
      console.info("[Menu load] final ingredient array passed to dropdown:", dropdownIngredients);
      setInventory(dropdownIngredients);
    } catch (caught) {
      console.error("[Menu load] exact exception:", caught);
      const message = caught instanceof Error
        ? caught.message
        : caught && typeof caught === "object" && "message" in caught
          ? String(caught.message)
          : String(caught || "Menu could not be loaded.");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`menu-hq-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_menu_meals", filter: `business_id=eq.${businessId}` }, () => void loadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_menu_ingredients" }, () => void loadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_inventory_items", filter: `business_id=eq.${businessId}` }, () => void loadMenu())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, loadMenu]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const ingredientsByMeal = useMemo(() => {
    const map = new Map<string, MealIngredient[]>();
    ingredients.forEach((ingredient) =>
      map.set(ingredient.meal_id, [...(map.get(ingredient.meal_id) ?? []), ingredient]),
    );
    return map;
  }, [ingredients]);

  const salesCounts = useMemo(() => {
    const counts = new Map<string, number>();
    orderSales.forEach((order) => {
      if (order.meal_id) counts.set(order.meal_id, (counts.get(order.meal_id) ?? 0) + 1);
    });
    return counts;
  }, [orderSales]);

  const highestSelling =
    [...meals].sort(
      (a, b) =>
        (salesCounts.get(b.id) ?? 0) -
        (salesCounts.get(a.id) ?? 0),
    )[0]?.name ?? "No sales yet";
  const averagePrice = meals.length
    ? meals.reduce((sum, meal) => sum + number(meal.selling_price), 0) / meals.length
    : 0;
  const averageFoodCost = meals.length
    ? meals.reduce((sum, meal) => sum + number(meal.food_cost), 0) / meals.length
    : 0;
  const cards = [
    ["Total Meals", meals.length],
    ["Active Meals", meals.filter((meal) => meal.status.toLowerCase() === "active").length],
    ["Inactive Meals", meals.filter((meal) => meal.status.toLowerCase() !== "active").length],
    ["Average Meal Price", money(averagePrice)],
    ["Average Food Cost", money(averageFoodCost)],
    ["Highest Selling Meal", highestSelling],
  ];

  const visibleMeals = meals.filter((meal) => {
    const term = search.trim().toLowerCase();
    const mealIngredients = ingredientsByMeal.get(meal.id) ?? [];
    const matchesSearch =
      !term ||
      meal.name.toLowerCase().includes(term) ||
      meal.category.toLowerCase().includes(term) ||
      String(meal.protein_g).includes(term) ||
      String(meal.calories).includes(term) ||
      mealIngredients.some((ingredient) => inventory.find((item) => item.id === ingredient.inventory_item_id)?.name.toLowerCase().includes(term));
    if (!matchesSearch) return false;
    if (["Breakfast", "Lunch", "Dinner", "Snacks"].includes(filter)) return meal.category === filter;
    if (filter === "High Protein") return number(meal.protein_g) >= 30;
    if (filter === "Low Carb") return number(meal.carbs_g) <= 25;
    if (filter === "Weight Loss") return number(meal.calories) <= 500;
    if (filter === "Bulking") return number(meal.calories) >= 650;
    if (filter === "Active" || filter === "Inactive") return meal.status.toLowerCase() === filter.toLowerCase();
    return true;
  });

  const openAddMeal = () => {
    setError("");
    setMealForm(emptyMealForm);
    setEditingMeal("new");
  };

  const openEditMeal = (meal: Meal) => {
    setError("");
    setEditingMeal(meal);
    setMealForm({
      name: meal.name,
      description: meal.description ?? "",
      photoUrl: meal.photo_url ?? "",
      category: meal.category,
      servingSize: meal.serving_size ?? "",
      calories: String(meal.calories),
      protein: String(meal.protein_g),
      carbs: String(meal.carbs_g),
      fat: String(meal.fat_g),
      fiber: String(meal.fiber_g),
      sugar: String(meal.sugar_g),
      sodium: String(meal.sodium_mg),
      sellingPrice: String(meal.selling_price),
      foodCost: String(meal.food_cost),
      cookingInstructions: meal.cooking_instructions ?? "",
      packagingInstructions: meal.packaging_instructions ?? "",
      heatingInstructions: meal.heating_instructions ?? "",
      customerNotes: meal.customer_notes ?? "",
      status: meal.status,
      ingredients: (ingredientsByMeal.get(meal.id) ?? []).map((ingredient) => ({
        id: ingredient.id,
        inventoryItemId: ingredient.inventory_item_id,
        ingredientName: ingredient.ingredient_name,
        inventoryUnit: ingredient.inventory_unit,
        quantity: String(ingredient.quantity_required),
        recipeUnit: ingredient.recipe_unit,
        preparationNotes: ingredient.preparation_notes ?? "",
      })),
    });
  };

  const saveMeal = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingMeal) return;
    setSaving(true);
    const values = {
      business_id: businessId,
      name: mealForm.name.trim(),
      description: mealForm.description.trim() || null,
      photo_url: mealForm.photoUrl.trim() || null,
      category: mealForm.category,
      serving_size: mealForm.servingSize.trim() || null,
      calories: number(mealForm.calories),
      protein_g: number(mealForm.protein),
      carbs_g: number(mealForm.carbs),
      fat_g: number(mealForm.fat),
      fiber_g: number(mealForm.fiber),
      sugar_g: number(mealForm.sugar),
      sodium_mg: number(mealForm.sodium),
      selling_price: number(mealForm.sellingPrice),
      food_cost: number(mealForm.foodCost),
      cooking_instructions: mealForm.cookingInstructions.trim() || null,
      packaging_instructions: mealForm.packagingInstructions.trim() || null,
      heating_instructions: mealForm.heatingInstructions.trim() || null,
      customer_notes: mealForm.customerNotes.trim() || null,
      status: mealForm.status,
      updated_at: new Date().toISOString(),
    };
    if (!mealForm.ingredients.length || mealForm.ingredients.some((ingredient) => !ingredient.inventoryItemId)) {
      setError("Please select an inventory ingredient for every recipe row.");
      setSaving(false);
      return;
    }
    const selectedIds = mealForm.ingredients.map((ingredient) => ingredient.inventoryItemId);
    if (new Set(selectedIds).size !== selectedIds.length) {
      setError("Each ingredient can only be added once per recipe.");
      setSaving(false);
      return;
    }
    const ingredientRows = mealForm.ingredients.map((ingredient) => {
      const selectedInventoryItem = inventory.find((item) => item.id === ingredient.inventoryItemId);
      return {
        id: ingredient.id ?? null,
        inventory_item_id: ingredient.inventoryItemId,
        ingredient_name: ingredient.ingredientName || selectedInventoryItem?.name || "",
        quantity_required: number(ingredient.quantity),
        recipe_unit: ingredient.recipeUnit,
        inventory_unit: ingredient.inventoryUnit || selectedInventoryItem?.unit || "",
        unit: ingredient.inventoryUnit || selectedInventoryItem?.unit || "",
        preparation_notes: ingredient.preparationNotes.trim() || null,
      };
    });
    if (ingredientRows.some((ingredient) => !ingredient.ingredient_name || !ingredient.inventory_unit)) {
      setError("The selected inventory ingredient is missing its name or unit.");
      setSaving(false);
      return;
    }
    const { data: savedMealId, error: saveError } = await supabase.rpc("gbgs_save_meal", {
      p_business_id: businessId,
      p_meal_id: editingMeal === "new" ? null : editingMeal.id,
      p_values: values,
      p_ingredients: ingredientRows,
    });
    if (saveError || !savedMealId) {
      setError(saveError?.message || "Meal could not be saved.");
      setSaving(false);
      return;
    }
    const savedMeal = { ...values, id: savedMealId } as Meal;
    setEditingMeal(null);
    setSelectedMeal(savedMeal);
    setToast(editingMeal === "new" ? "Meal added" : "Meal updated");
    await loadMenu();
    setSaving(false);
  };

  const duplicateMeal = async (meal: Meal) => {
    setSaving(true);
    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...values } = meal;
    void _id;
    void _createdAt;
    void _updatedAt;
    const { data, error: duplicateError } = await supabase
      .from("gbgs_menu_meals")
      .insert({ ...values, name: `${meal.name} Copy`, status: "Inactive" })
      .select("*")
      .single();
    if (duplicateError || !data) {
      setError(duplicateError?.message || "Meal could not be duplicated.");
    } else {
      const duplicated = data as Meal;
      const rows = (ingredientsByMeal.get(meal.id) ?? []).map((ingredient) => ({
        meal_id: duplicated.id,
        inventory_item_id: ingredient.inventory_item_id,
        ingredient_name: ingredient.ingredient_name,
        quantity_required: ingredient.quantity_required,
        recipe_unit: ingredient.recipe_unit,
        inventory_unit: ingredient.inventory_unit,
        unit: ingredient.inventory_unit,
        preparation_notes: ingredient.preparation_notes,
      }));
      if (rows.length) await supabase.from("gbgs_menu_ingredients").insert(rows);
      setToast("Meal duplicated");
      setSelectedMeal(duplicated);
      await loadMenu();
    }
    setSaving(false);
  };

  const toggleMeal = async (meal: Meal) => {
    const status = meal.status.toLowerCase() === "active" ? "Inactive" : "Active";
    const { data, error: updateError } = await supabase
      .from("gbgs_menu_meals")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", meal.id)
      .select("*")
      .single();
    if (updateError) setError(updateError.message);
    else {
      setSelectedMeal(data as Meal);
      setToast(status === "Active" ? "Meal activated" : "Meal deactivated");
      await loadMenu();
    }
  };

  const deleteMeal = async (meal: Meal) => {
    if (!window.confirm(`Delete ${meal.name}? This cannot be undone.`)) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from("gbgs_menu_meals").delete().eq("id", meal.id);
    if (deleteError) setError(deleteError.message);
    else {
      setSelectedMeal(null);
      setMeals((current) => current.filter((item) => item.id !== meal.id));
      setToast("Meal deleted");
    }
    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb] p-4 text-slate-900 md:p-8">
      <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#d6a817]">Miz Rita HQ</p>
            <h1 className="mt-2 text-4xl font-bold">Menu HQ</h1>
            <p className="mt-2 text-slate-300">Meals, nutrition, recipes, pricing, and ingredient requirements.</p>
          </div>
          <button onClick={openAddMeal} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35]">
            <Plus className="mr-2 inline h-5 w-5" />Add Meal
          </button>
        </div>
      </section>

      {error ? (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
          <span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-bold text-[#081c35]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-2xl font-bold text-[#081c35]">Meals</h2><p className="mt-1 text-sm text-slate-500">{visibleMeals.length} meal{visibleMeals.length === 1 ? "" : "s"} shown</p></div>
            <label className="flex w-full items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 lg:max-w-md">
              <Search className="h-5 w-5 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Meal, category, protein, or calories" className="min-w-0 flex-1 outline-none" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["All Meals", "Breakfast", "Lunch", "Dinner", "Snacks", "High Protein", "Low Carb", "Weight Loss", "Bulking", "Active", "Inactive"].map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === item ? "bg-[#081c35] text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-[#081c35] text-xs uppercase tracking-wide text-slate-300">
              <tr>{["Meal Photo", "Meal Name", "Category", "Protein", "Calories", "Price", "Food Cost", "Profit", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-4">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={10} className="p-10 text-center text-slate-500">Loading menu...</td></tr> : visibleMeals.length ? visibleMeals.map((meal) => (
                <tr key={meal.id} onClick={() => setSelectedMeal(meal)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-4"><MealPhoto meal={meal} small /></td>
                  <td className="px-4 py-4 font-bold text-[#081c35]">{meal.name}</td>
                  <td className="px-4 py-4">{meal.category}</td>
                  <td className="px-4 py-4 font-bold">{number(meal.protein_g).toFixed(1)}g</td>
                  <td className="px-4 py-4">{Math.round(number(meal.calories))}</td>
                  <td className="px-4 py-4 font-bold">{money(number(meal.selling_price))}</td>
                  <td className="px-4 py-4">{money(number(meal.food_cost))}</td>
                  <td className="px-4 py-4 font-bold text-emerald-700">{money(number(meal.selling_price) - number(meal.food_cost))}</td>
                  <td className="px-4 py-4"><StatusBadge status={meal.status} /></td>
                  <td className="px-4 py-4"><button onClick={(event) => { event.stopPropagation(); openEditMeal(meal); }} className="rounded-xl border px-3 py-2 font-bold">Edit</button></td>
                </tr>
              )) : <tr><td colSpan={10} className="p-10 text-center text-slate-500">No meals match this search or filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedMeal ? (
        <MealProfile
          meal={selectedMeal}
          ingredients={ingredientsByMeal.get(selectedMeal.id) ?? []}
          inventory={inventory}
          saving={saving}
          onClose={() => setSelectedMeal(null)}
          onEdit={() => openEditMeal(selectedMeal)}
          onDuplicate={() => void duplicateMeal(selectedMeal)}
          onToggle={() => void toggleMeal(selectedMeal)}
          onDelete={() => void deleteMeal(selectedMeal)}
        />
      ) : null}

      {editingMeal ? (
        <MealEditor
          title={editingMeal === "new" ? "Add Meal" : "Edit Meal"}
          form={mealForm}
          validationMessage={error}
          saving={saving}
          onChange={setMealForm}
          inventory={inventory}
          onClose={() => setEditingMeal(null)}
          onSave={saveMeal}
        />
      ) : null}

      {toast ? <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl bg-[#081c35] px-5 py-4 font-bold text-white shadow-2xl"><CheckCircle2 className="h-5 w-5 text-[#d6a817]" />{toast}</div> : null}
    </main>
  );
}

function MealProfile({ meal, ingredients, inventory, saving, onClose, onEdit, onDuplicate, onToggle, onDelete }: {
  meal: Meal;
  ingredients: MealIngredient[];
  inventory: InventoryItem[];
  saving: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const nutritionRows: Array<[string, string]> = [
    ["Serving Size", meal.serving_size || "Not set"],
    ["Calories", String(Math.round(number(meal.calories)))],
    ["Protein", `${number(meal.protein_g).toFixed(1)}g`],
    ["Carbohydrates", `${number(meal.carbs_g).toFixed(1)}g`],
    ["Fat", `${number(meal.fat_g).toFixed(1)}g`],
    ["Fiber", `${number(meal.fiber_g).toFixed(1)}g`],
    ["Sugar", `${number(meal.sugar_g).toFixed(1)}g`],
    ["Sodium", `${number(meal.sodium_mg).toFixed(1)}mg`],
  ];
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
    <div className="h-full w-full max-w-4xl overflow-y-auto bg-[#f4f6fb] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Meal Profile</p><h2 className="mt-1 text-2xl font-bold text-[#081c35]">{meal.name}</h2></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X /></button></header>
      <div className="space-y-5 p-5">
        <section className="grid gap-5 rounded-3xl bg-[#081c35] p-6 text-white sm:grid-cols-[180px_1fr]">
          <MealPhoto meal={meal} />
          <div><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[#d6a817]">{meal.category}</p><h3 className="mt-1 text-3xl font-bold">{meal.name}</h3></div><StatusBadge status={meal.status} /></div><p className="mt-3 text-slate-300">{meal.description || "No description provided."}</p><div className="mt-5 flex flex-wrap gap-5"><div><p className="text-xs text-slate-400">Selling Price</p><p className="text-2xl font-bold">{money(number(meal.selling_price))}</p></div><div><p className="text-xs text-slate-400">Food Cost</p><p className="text-2xl font-bold">{money(number(meal.food_cost))}</p></div><div><p className="text-xs text-slate-400">Profit Per Meal</p><p className="text-2xl font-bold text-emerald-400">{money(number(meal.selling_price) - number(meal.food_cost))}</p></div></div></div>
        </section>

        <DetailSection title="Nutrition" rows={nutritionRows} />
        <DetailSection title="Meal Instructions" rows={[["Cooking Instructions", meal.cooking_instructions || "Not provided"], ["Packaging Instructions", meal.packaging_instructions || "Not provided"], ["Heating Instructions", meal.heating_instructions || "Not provided"], ["Customer Notes", meal.customer_notes || "None"]] as Array<[string, string]>} />

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-[#081c35]">Ingredients</h3>
          <p className="mt-1 text-sm text-slate-500">Required amounts are per meal. Production totals multiply these quantities by meals ordered.</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr>{["Ingredient", "Quantity Required", "Unit", "Current Inventory", "Minimum Inventory"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{ingredients.length ? ingredients.map((ingredient) => {
            const stock = inventory.find((item) => item.id === ingredient.inventory_item_id);
            return <tr key={ingredient.id} className="border-b border-slate-100"><td className="px-3 py-4 font-bold">{stock?.name ?? "Unavailable inventory item"}</td><td className="px-3 py-4">{number(ingredient.quantity_required).toFixed(2)}</td><td className="px-3 py-4">{ingredient.recipe_unit}</td><td className={`px-3 py-4 font-bold ${stock && stock.quantity < stock.parLevel ? "text-red-700" : ""}`}>{stock ? `${number(stock.quantity).toFixed(stock.unit === "lb" ? 2 : 0)} ${stock.unit}` : "Not tracked"}</td><td className="px-3 py-4">{stock ? `${number(stock.parLevel).toFixed(stock.unit === "lb" ? 2 : 0)} ${stock.unit}` : "Not tracked"}</td></tr>;
          }) : <tr><td colSpan={5} className="p-8 text-center text-slate-500">No ingredients added.</td></tr>}</tbody></table></div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Quick Actions</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Action icon={<Pencil />} label="Edit Meal" onClick={onEdit} />
          <Action icon={<Copy />} label="Duplicate Meal" onClick={onDuplicate} />
          <Action icon={<CheckCircle2 />} label={meal.status.toLowerCase() === "active" ? "Deactivate Meal" : "Activate Meal"} onClick={onToggle} />
          <Action icon={<Printer />} label="Print Nutrition Label" onClick={() => printNutrition(meal)} />
          <Action icon={<Printer />} label="Print Recipe" onClick={() => printRecipe(meal, ingredients, inventory)} />
          <Action icon={<Trash2 />} label="Delete Meal" onClick={onDelete} danger />
        </div><p className="mt-3 text-xs text-slate-500">{saving ? "Saving changes..." : ""}</p></section>
      </div>
    </div>
  </div>;
}

function MealEditor({ title, form, inventory, validationMessage, saving, onChange, onClose, onSave }: { title: string; form: MealForm; inventory: InventoryItem[]; validationMessage: string; saving: boolean; onChange: (form: MealForm) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  const field = (key: MealTextField, value: string) => onChange({ ...form, [key]: value });
  const ingredient = (index: number, key: "inventoryItemId" | "quantity" | "recipeUnit" | "preparationNotes", value: string) => {
    const selectedInventoryItem = key === "inventoryItemId" ? inventory.find((item) => item.id === value) : null;
    onChange({ ...form, ingredients: form.ingredients.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      [key]: value,
      ...(key === "inventoryItemId" ? { ingredientName: selectedInventoryItem?.name ?? "", inventoryUnit: selectedInventoryItem?.unit ?? "" } : {}),
    } : item) });
  };
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4"><form onSubmit={onSave} className="mx-auto my-8 max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#081c35] p-6 text-white"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Menu HQ</p><h2 className="mt-1 text-2xl font-bold">{title}</h2></div><button type="button" onClick={onClose}><X /></button></header><div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
    <Field label="Meal Name"><input required value={form.name} onChange={(event) => field("name", event.target.value)} className="menu-input" /></Field>
    <Field label="Category"><select value={form.category} onChange={(event) => field("category", event.target.value)} className="menu-input"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snacks</option></select></Field>
    <Field label="Status"><select value={form.status} onChange={(event) => field("status", event.target.value)} className="menu-input"><option>Active</option><option>Inactive</option></select></Field>
    <Field label="Meal Photo URL"><input value={form.photoUrl} onChange={(event) => field("photoUrl", event.target.value)} className="menu-input" /></Field>
    <Field label="Serving Size"><input value={form.servingSize} onChange={(event) => field("servingSize", event.target.value)} className="menu-input" /></Field>
    <Field label="Selling Price"><input required type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(event) => field("sellingPrice", event.target.value)} className="menu-input" /></Field>
    <Field label="Food Cost"><input required type="number" min="0" step="0.01" value={form.foodCost} onChange={(event) => field("foodCost", event.target.value)} className="menu-input" /></Field>
    {([["Calories", "calories"], ["Protein (g)", "protein"], ["Carbohydrates (g)", "carbs"], ["Fat (g)", "fat"], ["Fiber (g)", "fiber"], ["Sugar (g)", "sugar"], ["Sodium (mg)", "sodium"]] as Array<[string, MealTextField]>).map(([label, key]) => <Field key={key} label={label}><input type="number" min="0" step="0.1" value={form[key]} onChange={(event) => field(key, event.target.value)} className="menu-input" /></Field>)}
    <div className="sm:col-span-2 lg:col-span-3"><Field label="Description"><textarea rows={3} value={form.description} onChange={(event) => field("description", event.target.value)} className="menu-input" /></Field></div>
    <Field label="Cooking Instructions"><textarea rows={4} value={form.cookingInstructions} onChange={(event) => field("cookingInstructions", event.target.value)} className="menu-input" /></Field>
    <Field label="Packaging Instructions"><textarea rows={4} value={form.packagingInstructions} onChange={(event) => field("packagingInstructions", event.target.value)} className="menu-input" /></Field>
    <Field label="Heating Instructions"><textarea rows={4} value={form.heatingInstructions} onChange={(event) => field("heatingInstructions", event.target.value)} className="menu-input" /></Field>
    <div className="sm:col-span-2 lg:col-span-3"><Field label="Customer Notes"><textarea rows={3} value={form.customerNotes} onChange={(event) => field("customerNotes", event.target.value)} className="menu-input" /></Field></div>

    <section className="rounded-2xl border border-slate-200 p-4 sm:col-span-2 lg:col-span-3"><div className="flex items-center justify-between"><div><h3 className="font-bold text-[#081c35]">Ingredients</h3><p className="text-sm text-slate-500">Enter the amount required for one meal.</p></div><button type="button" onClick={() => onChange({ ...form, ingredients: [...form.ingredients, { inventoryItemId: "", ingredientName: "", inventoryUnit: "", quantity: "", recipeUnit: "oz", preparationNotes: "" }] })} className="rounded-xl bg-[#081c35] px-4 py-2 font-bold text-white"><Plus className="mr-1 inline h-4 w-4" />Add</button></div><div className="mt-4 space-y-3">{form.ingredients.map((item, index) => {
      const selected = inventory.find((inventoryItem) => inventoryItem.id === item.inventoryItemId);
      return <div key={item.id ?? index} className="grid gap-2 sm:grid-cols-[1fr_140px_120px_44px]">
        <select required aria-label="Ingredient" value={item.inventoryItemId} onChange={(event) => ingredient(index, "inventoryItemId", event.target.value)} className="menu-input">
          <option value="">Select Ingredient</option>
          {inventory.map((inventoryItem) => <option key={inventoryItem.id} value={inventoryItem.id}>{inventoryItem.name}</option>)}
        </select>
        <input required placeholder="Quantity" type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => ingredient(index, "quantity", event.target.value)} className="menu-input" />
        <select required aria-label="Recipe Unit" value={item.recipeUnit} onChange={(event) => ingredient(index, "recipeUnit", event.target.value)} className="menu-input">{recipeUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
        <button type="button" onClick={() => onChange({ ...form, ingredients: form.ingredients.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl border border-red-200 text-red-700"><Trash2 className="mx-auto h-4 w-4" /></button>
        <div className="menu-input bg-slate-50 text-xs text-slate-500 sm:col-span-3"><span className="font-bold text-slate-900">Inventory Unit: {selected?.unit ?? "—"}</span><span className="ml-4">Current Inventory: {selected ? `${number(selected.quantity).toFixed(2)} ${selected.unit}` : "—"}</span><span className="ml-4">Cost: {selected ? `${money(selected.costPerUnit)} / ${selected.unit}` : "—"}</span></div>
        <input placeholder="Optional preparation notes" value={item.preparationNotes} onChange={(event) => ingredient(index, "preparationNotes", event.target.value)} className="menu-input sm:col-span-3" />
      </div>;
    })}</div></section>
    {validationMessage ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2 lg:col-span-3">{validationMessage}</p> : null}
    <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35] disabled:opacity-50">{saving ? "Saving..." : "Save Meal"}</button></div>
  </div></form><style jsx global>{`.menu-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;outline:none;background:white}.menu-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}`}</style></div>;
}

function MealPhoto({ meal, small = false }: { meal: Meal; small?: boolean }) {
  const classes = small ? "h-14 w-16" : "h-44 w-full sm:h-40";
  return meal.photo_url ? <img src={meal.photo_url} alt={meal.name} className={`${classes} rounded-2xl object-cover`} /> : <div className={`${classes} flex items-center justify-center rounded-2xl bg-slate-200 text-slate-500`}><ImageIcon className="h-8 w-8" /></div>;
}

function DetailSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">{title}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap font-bold">{value}</p></div>)}</div></section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>;
}

function Action({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-[#081c35] hover:bg-slate-50"}`}><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</button>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${status.toLowerCase() === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{status}</span>;
}

function printNutrition(meal: Meal) {
  const printWindow = window.open("", "_blank", "width=700,height=700");
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(meal.name)} Nutrition</title><style>body{font-family:Arial;margin:30px;color:#111}.label{border:4px solid #111;padding:14px;max-width:420px}.title{font-size:34px;font-weight:900;border-bottom:10px solid #111}.row{display:flex;justify-content:space-between;border-top:1px solid #111;padding:6px 0}.bold{font-weight:800}</style></head><body><div class="label"><div class="title">Nutrition Facts</div><h2>${escapeHtml(meal.name)}</h2><div class="row"><span>Serving Size</span><b>${escapeHtml(meal.serving_size || "1 meal")}</b></div><div class="row bold"><span>Calories</span><span>${Math.round(number(meal.calories))}</span></div><div class="row"><span>Total Fat</span><b>${number(meal.fat_g).toFixed(1)}g</b></div><div class="row"><span>Sodium</span><b>${number(meal.sodium_mg).toFixed(1)}mg</b></div><div class="row"><span>Total Carbohydrate</span><b>${number(meal.carbs_g).toFixed(1)}g</b></div><div class="row"><span>Dietary Fiber</span><b>${number(meal.fiber_g).toFixed(1)}g</b></div><div class="row"><span>Total Sugars</span><b>${number(meal.sugar_g).toFixed(1)}g</b></div><div class="row"><span>Protein</span><b>${number(meal.protein_g).toFixed(1)}g</b></div></div><script>window.onload=()=>window.print()</script></body></html>`);
  printWindow.document.close();
}

function printRecipe(meal: Meal, ingredients: MealIngredient[], inventory: InventoryItem[]) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(meal.name)} Recipe</title><style>body{font-family:Arial;color:#081c35;margin:40px}.header{border-bottom:4px solid #d6a817;padding-bottom:18px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}section{margin-top:24px;white-space:pre-wrap}</style></head><body><div class="header"><h1>${escapeHtml(meal.name)}</h1><p>${escapeHtml(meal.description || "")}</p></div><h2>Ingredients · Per Meal</h2><table><thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th><th>Preparation Notes</th></tr></thead><tbody>${ingredients.map((item) => { const stock = inventory.find((candidate) => candidate.id === item.inventory_item_id); return `<tr><td>${escapeHtml(stock?.name ?? "Unavailable inventory item")}</td><td>${number(item.quantity_required).toFixed(2)}</td><td>${escapeHtml(item.recipe_unit)}</td><td>${escapeHtml(item.preparation_notes ?? "")}</td></tr>`; }).join("")}</tbody></table><section><h2>Cooking Instructions</h2>${escapeHtml(meal.cooking_instructions || "Not provided")}</section><section><h2>Packaging Instructions</h2>${escapeHtml(meal.packaging_instructions || "Not provided")}</section><section><h2>Heating Instructions</h2>${escapeHtml(meal.heating_instructions || "Not provided")}</section><script>window.onload=()=>window.print()</script></body></html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}
