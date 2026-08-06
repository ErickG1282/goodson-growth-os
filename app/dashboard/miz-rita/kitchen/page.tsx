"use client";

import { useEffect, useState } from "react";

import {
  ChefHat,
  ClipboardList,
  Package,
  Truck,
  Printer,
  Play,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Scale,
  Layers3,
  Timer,
  X,
  Save,
  FolderOpen,
  Pause,
  CircleCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { convertUnit } from "@/lib/unit-conversion";
import { queryProductionQueue, summarizeProductionQueue, type ProductionQueueOrder } from "@/lib/production-queue";

type ProductionStatus =
  | "Waiting"
  | "Prep"
  | "Cooking"
  | "Packaging"
  | "Complete";

type WeightUnit = "oz" | "g";

type ProductionItem = {
  id: number;
  inventoryItemId: string;
  inventoryUnit?: string;
  inventoryQuantityPerMeal?: number;
  name: string;
  category: "Protein" | "Vegetable" | "Side";
  meals: number;
  portionSize: number;
  unit: WeightUnit;
  yieldLoss: number;
  batchCapacity: number;
  assignedCook: string;
  minutesPerBatch: number;
  status: ProductionStatus;
  costPerPound: number;
  costPerUnit: number;
  expectedWaste: number;
  actualWaste: number;
  elapsedSeconds: number;
  timerRunning: boolean;
};

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  par_level: number;
  cost_per_unit: number;
};

const statusStyles: Record<ProductionStatus, string> = {
  Waiting: "bg-slate-100 text-slate-700 ring-slate-200",
  Prep: "bg-blue-50 text-blue-700 ring-blue-200",
  Cooking: "bg-orange-50 text-orange-700 ring-orange-200",
  Packaging: "bg-purple-50 text-purple-700 ring-purple-200",
  Complete: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const productionStatuses: ProductionStatus[] = [
  "Waiting",
  "Prep",
  "Cooking",
  "Packaging",
  "Complete",
];

const roundTo = (value: number, places = 1) =>
  Number.isFinite(value) ? value.toFixed(places) : "0.0";

const weightInPounds = (weight: number, unit: WeightUnit) =>
  unit === "oz" ? weight / 16 : weight / 453.592;

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!hours) return `${remainingMinutes} min`;
  if (!remainingMinutes) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
};

const formatElapsedTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const getProductionMetrics = (item: ProductionItem) => {
  const cookedWeight = item.meals * item.portionSize;
  const usableYield = Math.max(1 - item.yieldLoss / 100, 0.01);
  const rawWeight = cookedWeight / usableYield;
  const poundsRequired = weightInPounds(rawWeight, item.unit);
  const batches = Math.ceil(item.meals / Math.max(item.batchCapacity, 1));
  const estimatedMinutes = batches * item.minutesPerBatch;
  const ingredientCost = poundsRequired * item.costPerPound;
  const extendedCost = ingredientCost + item.meals * item.costPerUnit;
  const costPerMeal = item.meals > 0 ? extendedCost / item.meals : 0;
  const poundsLost = poundsRequired * (item.actualWaste / 100);
  const dollarLoss = poundsLost * item.costPerPound;
  const remainingSeconds = item.status === "Complete"
    ? 0
    : Math.max(estimatedMinutes * 60 - item.elapsedSeconds, 0);

  return {
    cookedWeight,
    rawWeight,
    poundsRequired,
    batches,
    estimatedMinutes,
    ingredientCost,
    extendedCost,
    costPerMeal,
    poundsLost,
    dollarLoss,
    remainingSeconds,
  };
};

export default function KitchenPage() {
  const [businessId, setBusinessId] = useState("");
  const [deliveriesToday, setDeliveriesToday] = useState(0);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [kitchenNotes, setKitchenNotes] = useState<string[]>([]);
  const [newKitchenNote, setNewKitchenNote] = useState("");
  const [completedPackingTasks, setCompletedPackingTasks] = useState<string[]>([]);


  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [showMealModal, setShowMealModal] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [liveKitchenOrders, setLiveKitchenOrders] = useState<string[][]>([]);
  const [productionQueueOrders, setProductionQueueOrders] = useState<ProductionQueueOrder[]>([]);
  const [showCookingList, setShowCookingList] = useState(false);
  const [productionCalculator, setProductionCalculator] = useState<ProductionItem[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [productionActionMessage, setProductionActionMessage] = useState("");
  const [productionActionError, setProductionActionError] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const [selectedProductionOrders, setSelectedProductionOrders] = useState<Set<string>>(new Set());
  const [, setQueueClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setQueueClock(Date.now());
      setProductionCalculator((items) => {
        if (!items.some((item) => item.timerRunning)) return items;

        return items.map((item) =>
          item.timerRunning
            ? { ...item, elapsedSeconds: item.elapsedSeconds + 1 }
            : item,
        );
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadKitchenOrders = async () => {
      const { data: business } = await supabase
        .from("gbgs_businesses")
        .select("id")
        .eq("slug", "miz-ritas-kitchen")
        .maybeSingle();
      if (!business || !active) return;
      setBusinessId(business.id);

      const [ordersResult, customersResult, mealsResult, ingredientsResult, inventoryResult, planResult, notesResult] = await Promise.all([
        queryProductionQueue(supabase, business.id),
        supabase
          .from("gbgs_customers")
          .select("id, first_name, last_name")
          .eq("business_id", business.id),
        supabase.from("gbgs_menu_meals").select("id, name, serving_size, cooking_instructions").eq("business_id", business.id).eq("status", "Active"),
        supabase.from("gbgs_menu_ingredients").select("*"),
        supabase.from("gbgs_inventory_items").select("id, name, category, quantity, unit, par_level, cost_per_unit").eq("business_id", business.id),
        supabase.from("gbgs_production_plans").select("plan_data, summary").eq("business_id", business.id).maybeSingle(),
        supabase.from("gbgs_kitchen_notes").select("note").eq("business_id", business.id).order("created_at", { ascending: false }).limit(20),
      ]);
      if (ordersResult.error || customersResult.error || mealsResult.error || ingredientsResult.error || inventoryResult.error || planResult.error || notesResult.error || !active) return;

      const names = new Map(
        (customersResult.data ?? []).map((customer) => [
          customer.id,
          `${customer.first_name} ${customer.last_name ?? ""}`.trim(),
        ]),
      );
      const mealNames = new Map((mealsResult.data ?? []).map((meal) => [meal.id, meal.name]));
      const queueOrders = (ordersResult.data ?? []) as ProductionQueueOrder[];
      setProductionQueueOrders(queueOrders);
      const nextOrders = queueOrders.map((order) => {
        const notes = order.notes ?? "";
        const meals = String(order.meal_count);
        const mealPlan = mealNames.get(order.meal_id) ?? "Not specified";
        const pickup = notes.match(/^Pickup\/Delivery Time:\s*(.+)$/im)?.[1]?.trim() ?? "Not scheduled";
        const normalized = order.order_status.toLowerCase();
        const legacyKitchenStatus =
          ["cooking", "preparing", "kitchen", "paid"].includes(normalized)
            ? "Cooking"
            : normalized === "packaging"
              ? "Packaging"
              : ["ready", "ready for pickup", "out for delivery", "delivered", "completed"].includes(normalized)
                ? "Complete"
                : normalized === "prep"
                  ? "Prep"
                  : "Waiting";
        const kitchenStatus = order.production_status || legacyKitchenStatus;
        return [
          order.order_number.replace(/^MR-/, ""),
          names.get(order.customer_id) ?? "Unknown customer",
          `${meals} Meals`,
          mealPlan,
          pickup,
          kitchenStatus,
          order.id,
          String(Number(order.meal_count) || 0),
          order.production_started_at ?? "",
          order.production_resumed_at ?? "",
          String(Number(order.production_elapsed_seconds) || 0),
          order.production_stop_reason ?? "",
        ];
      });
      setLiveKitchenOrders(nextOrders);
      const orderNotes = (ordersResult.data ?? []).flatMap((order) => {
        const notes = String(order.notes ?? "").split("\n").filter((line: string) => !/^(Meal Plan|Number of Meals|Pickup\/Delivery Date|Pickup\/Delivery Time|Delivery Address|Assigned Driver):/i.test(line.trim())).filter(Boolean);
        const customer = names.get(order.customer_id) ?? "Unknown customer";
        return notes.map((note: string) => `${customer} - ${note}`);
      });
      setKitchenNotes([...(notesResult.data ?? []).map((item) => item.note), ...orderNotes]);
      setInventoryItems((inventoryResult.data ?? []).map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        par_level: Number(item.par_level),
        cost_per_unit: Number(item.cost_per_unit),
      })));
      const todayKey = new Date().toLocaleDateString("en-CA");
      setDeliveriesToday((ordersResult.data ?? []).filter((order) => order.delivery_method === "Delivery" && order.fulfillment_date?.slice(0, 10) === todayKey).length);

      const savedPlan = planResult.data?.plan_data;
      const savedSummary = planResult.data?.summary as { packagingTasks?: string[] } | null;
      setCompletedPackingTasks(Array.isArray(savedSummary?.packagingTasks) ? savedSummary.packagingTasks : []);
      {
        const mealCounts = new Map<string, number>();
        (ordersResult.data ?? []).forEach((order) => {
          const count = Number(order.meal_count);
          if (order.meal_id) mealCounts.set(order.meal_id, (mealCounts.get(order.meal_id) ?? 0) + count);
        });
        const menuById = new Map((mealsResult.data ?? []).map((meal) => [meal.id, meal]));
        const inventoryById = new Map((inventoryResult.data ?? []).map((item) => [item.id, item]));
        const aggregate = new Map<string, { meals: number; totalQuantity: number; unit: string }>();
        (ingredientsResult.data ?? []).forEach((ingredient) => {
          const meals = mealCounts.get(ingredient.meal_id) ?? 0;
          if (!meals || !ingredient.inventory_item_id) return;
          const stock = inventoryById.get(ingredient.inventory_item_id);
          if (!stock) return;
          const current = aggregate.get(ingredient.inventory_item_id) ?? { meals: 0, totalQuantity: 0, unit: stock.unit };
          current.meals += meals;
          const recipeUnit = typeof ingredient.recipe_unit === "string" ? ingredient.recipe_unit : stock.unit;
          const inventoryQuantity = convertUnit(Number(ingredient.quantity_required), recipeUnit, stock.unit);
          if (inventoryQuantity === null) return;
          current.totalQuantity += meals * inventoryQuantity;
          aggregate.set(ingredient.inventory_item_id, current);
        });
        const generated = [...aggregate.entries()].map(([inventoryItemId, usage], index): ProductionItem => {
          const stock = inventoryById.get(inventoryItemId);
          const name = stock?.name ?? "Unavailable inventory item";
          const unit: WeightUnit = usage.unit === "g" || usage.unit === "kg" ? "g" : "oz";
          const quantity = convertUnit(usage.totalQuantity, usage.unit, unit) ?? usage.totalQuantity;
          const category = stock?.category === "Protein" ? "Protein" : stock?.category === "Vegetable" ? "Vegetable" : "Side";
          const relatedMeals = [...menuById.values()].filter((candidate) =>
            (ingredientsResult.data ?? []).some((ingredient) => ingredient.meal_id === candidate.id && ingredient.inventory_item_id === inventoryItemId),
          );
          const servingCapacity = Math.max(0, ...relatedMeals.map((candidate) => Number(candidate.serving_size?.match(/\d+(?:\.\d+)?/)?.[0] ?? 0)));
          const cookingMinutes = Math.max(0, ...relatedMeals.map((candidate) => Number(candidate.cooking_instructions?.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)/i)?.[1] ?? 0)));
          const previous = Array.isArray(savedPlan) ? (savedPlan as ProductionItem[]).find((item) => item.inventoryItemId === inventoryItemId) : undefined;
          return { id: index + 1, inventoryItemId, inventoryUnit: stock?.unit, inventoryQuantityPerMeal: usage.meals ? usage.totalQuantity / usage.meals : 0, name, category, meals: usage.meals, portionSize: usage.meals ? quantity / usage.meals : 0, unit, yieldLoss: previous?.yieldLoss ?? 0, batchCapacity: previous?.batchCapacity || servingCapacity || usage.meals, assignedCook: previous?.assignedCook ?? "", minutesPerBatch: previous?.minutesPerBatch || cookingMinutes, status: previous?.status ?? "Waiting", costPerPound: Number(stock?.cost_per_unit ?? 0), costPerUnit: previous?.costPerUnit ?? 0, expectedWaste: previous?.expectedWaste ?? 0, actualWaste: previous?.actualWaste ?? 0, elapsedSeconds: previous?.elapsedSeconds ?? 0, timerRunning: Boolean(previous?.timerRunning) };
        });
        setProductionCalculator(generated);
      }

      if (!channel) {
        channel = supabase
          .channel(`miz-rita-kitchen-orders-${business.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "gbgs_orders",
              filter: `business_id=eq.${business.id}`,
            },
            () => void loadKitchenOrders(),
          )
          .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_menu_meals", filter: `business_id=eq.${business.id}` }, () => void loadKitchenOrders())
          .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_menu_ingredients" }, () => void loadKitchenOrders())
          .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_inventory_items", filter: `business_id=eq.${business.id}` }, () => void loadKitchenOrders())
          .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_production_plans", filter: `business_id=eq.${business.id}` }, () => void loadKitchenOrders())
          .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_kitchen_notes", filter: `business_id=eq.${business.id}` }, () => void loadKitchenOrders())
          .subscribe();
      }
    };

    void loadKitchenOrders();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refreshVersion]);

  const persistProductionPlan = async (
    items: ProductionItem[],
    message?: string,
  ) => {
    if (!businessId) {
      const error = "Business connection is not ready.";
      setSaveMessage(error);
      return { ok: false, error };
    }
    const summary = items.reduce(
      (totals, item) => {
        const metrics = getProductionMetrics(item);
        totals.foodCost += metrics.extendedCost;
        totals.productionMinutes += metrics.estimatedMinutes;
        totals.meals = Math.max(totals.meals, item.meals);
        if (item.status === "Complete") totals.completedItems += 1;
        return totals;
      },
      { foodCost: 0, productionMinutes: 0, meals: 0, completedItems: 0 },
    );
    const { error } = await supabase.from("gbgs_production_plans").upsert({
      business_id: businessId,
      plan_data: items,
      summary: { ...summary, itemCount: items.length, packagingTasks: completedPackingTasks },
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    if (error) {
      setSaveMessage(error.message);
      return { ok: false, error: error.message };
    }
    if (message) setSaveMessage(message);
    return { ok: true, error: "" };
  };

  const updateProductionItem = async <K extends keyof ProductionItem>(
    id: number,
    field: K,
    value: ProductionItem[K],
  ) => {
    const nextItems = productionCalculator.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    );
    setProductionCalculator(nextItems);
    await persistProductionPlan(nextItems);
  };

  const setProductionTimer = async (
    id: number,
    action: "start" | "pause" | "complete",
  ) => {
    const nextItems = productionCalculator.map((item) => {
      if (item.id !== id) return item;
      if (action === "start") {
        return {
          ...item,
          timerRunning: true,
          status: item.status === "Waiting" ? "Cooking" as const : item.status,
        };
      }
      if (action === "pause") return { ...item, timerRunning: false };
      return { ...item, timerRunning: false, status: "Complete" as const };
    });
    setProductionCalculator(nextItems);
    await persistProductionPlan(nextItems, action === "complete" ? "Production item completed." : undefined);
  };

  const saveProduction = async (itemsOverride?: ProductionItem[]) => {
    const sourceItems = Array.isArray(itemsOverride) ? itemsOverride : productionCalculator;
    const productionToSave = sourceItems.map((item) => ({
      ...item,
      timerRunning: false,
    }));
    if (!businessId) { setSaveMessage("Business connection is not ready."); return; }
    const [planResult, inventoryResult] = await Promise.all([
      supabase.from("gbgs_production_plans").select("applied_plan_data").eq("business_id", businessId).maybeSingle(),
      supabase.from("gbgs_inventory_items").select("id, name, quantity, unit").eq("business_id", businessId),
    ]);
    if (planResult.error || inventoryResult.error) { setSaveMessage(planResult.error?.message ?? inventoryResult.error?.message ?? "Production could not be saved."); return; }
    const previousPlan = Array.isArray(planResult.data?.applied_plan_data) ? planResult.data.applied_plan_data as ProductionItem[] : [];

    const previousWeights = new Map(
      previousPlan.map((item) => [item.inventoryItemId, item.inventoryQuantityPerMeal == null ? getProductionMetrics(item).poundsRequired : item.meals * item.inventoryQuantityPerMeal]),
    );
    const nextWeights = new Map(
      productionToSave.map((item) => [item.inventoryItemId, item.inventoryQuantityPerMeal == null ? getProductionMetrics(item).poundsRequired : item.meals * item.inventoryQuantityPerMeal]),
    );
    const previousMeals = Math.max(0, ...previousPlan.map((item) => item.meals));
    const nextMeals = Math.max(0, ...productionToSave.map((item) => item.meals));

    const inventoryChanges: Array<{ id: string; ingredient: string; quantityChange: number; unit: string; nextQuantity: number }> = [];
    const inventoryUpdatedAt = new Date().toISOString();

    (inventoryResult.data ?? []).forEach((stock) => {
      const productionItem = productionToSave.find((item) => item.inventoryItemId === stock.id) ?? previousPlan.find((item) => item.inventoryItemId === stock.id);
      let change = (nextWeights.get(stock.id) ?? 0) - (previousWeights.get(stock.id) ?? 0);
      if (productionItem?.inventoryQuantityPerMeal == null) change = convertUnit(change, "lb", stock.unit) ?? change;
      if (stock.name === "Meal Containers" || stock.name === "Meal Labels") {
        change = nextMeals - previousMeals;
      }
      const nextQuantity = Math.max(0, stock.quantity - change);
      const actualChange = nextQuantity - stock.quantity;
      if (Math.abs(actualChange) > 0.0001) {
        inventoryChanges.push({
          id: stock.id,
          ingredient: stock.name,
          quantityChange: actualChange,
          unit: stock.unit,
          nextQuantity,
        });
      }
    });

    const summary = productionToSave.reduce(
      (totals, item) => {
        const metrics = getProductionMetrics(item);
        totals.foodCost += metrics.extendedCost;
        totals.productionMinutes += metrics.estimatedMinutes;
        totals.meals = Math.max(totals.meals, item.meals);
        if (item.status === "Complete") totals.completedItems += 1;
        return totals;
      },
      { foodCost: 0, productionMinutes: 0, meals: 0, completedItems: 0 },
    );
    const nextOrderStatus = productionToSave.length && productionToSave.every((item) => item.status === "Complete")
      ? "Packaging"
      : productionToSave.some((item) => ["Cooking", "Packaging", "Complete"].includes(item.status))
        ? "Preparing"
        : null;
    let eligibleOrderIds: string[] = [];
    if (nextOrderStatus) {
      const { data: activeOrders } = await supabase.from("gbgs_orders").select("id, order_status").eq("business_id", businessId).not("order_status", "in", '("Completed","Cancelled")');
      const eligible = (activeOrders ?? []).filter((order) => {
        const current = order.order_status.toLowerCase();
        return nextOrderStatus === "Packaging" ? !["packaging", "ready", "ready for pickup", "out for delivery"].includes(current) : ["new order", "paid", "kitchen", "cooking", "preparing"].includes(current);
      });
      eligibleOrderIds = eligible.map((order) => order.id);
    }
    const { error: transactionError } = await supabase.rpc("gbgs_apply_production_plan", {
      p_business_id: businessId,
      p_plan_data: productionToSave,
      p_summary: { ...summary, itemCount: productionToSave.length, packagingTasks: completedPackingTasks },
      p_inventory_changes: inventoryChanges.map((change) => ({ id: change.id, quantity_change: change.quantityChange })),
      p_order_ids: eligibleOrderIds,
      p_order_status: nextOrderStatus,
    });
    if (transactionError) { setSaveMessage(transactionError.message); return; }
    setSaveMessage("Production plan saved.");
  };

  const loadPreviousProduction = async () => {
    if (!businessId) return;
    const { data, error: loadError } = await supabase.from("gbgs_production_plans").select("plan_data").eq("business_id", businessId).maybeSingle();
    if (loadError) { setSaveMessage(loadError.message); return; }
    if (!data || !Array.isArray(data.plan_data)) {
      setSaveMessage("No saved production plan is available yet.");
      return;
    }
    setProductionCalculator((data.plan_data as ProductionItem[]).map((item) => ({ ...item, timerRunning: false })));
    setSaveMessage("Previous production plan loaded.");
  };

  const kitchenTotals = productionCalculator.reduce(
    (totals, item) => {
      const metrics = getProductionMetrics(item);
      totals.productionMinutes += metrics.estimatedMinutes;
      totals.foodWeight += metrics.poundsRequired;
      totals.foodCost += metrics.extendedCost;
      totals.dollarLoss += metrics.dollarLoss;

      if (item.category === "Protein") totals.proteins += metrics.poundsRequired;
      if (item.category === "Vegetable") totals.vegetables += metrics.poundsRequired;
      if (item.category === "Side") totals.carbohydrates += metrics.poundsRequired;
      totals.statuses[item.status] += 1;

      return totals;
    },
    {
      proteins: 0,
      vegetables: 0,
      carbohydrates: 0,
      productionMinutes: 0,
      foodWeight: 0,
      foodCost: 0,
      dollarLoss: 0,
      statuses: {
        Waiting: 0,
        Prep: 0,
        Cooking: 0,
        Packaging: 0,
        Complete: 0,
      } as Record<ProductionStatus, number>,
    },
  );

  const totalMeals = Math.max(0, ...productionCalculator.map((item) => item.meals));
  const totalContainers = totalMeals;
  const totalLabels = totalContainers;
  const queueSummary = summarizeProductionQueue(productionQueueOrders);
  const queueTotalMeals = queueSummary.mealsRemaining;
  const mealsForStatus = (status: string) => productionQueueOrders.filter((order) => order.production_status === status).reduce((sum, order) => sum + (Number(order.meal_count) || 0), 0);
  const mealsWaiting = mealsForStatus("Waiting");
  const mealsCooking = mealsForStatus("Cooking");
  const mealsPaused = mealsForStatus("Paused");
  const mealsPackaging = mealsForStatus("Packaging");
  const queueCompletedMeals = mealsForStatus("Completed");
  const queueProgress = queueSummary.progress;
  const completedItems = kitchenTotals.statuses.Complete;
  const overallProgress = productionCalculator.length
    ? Math.round((completedItems / productionCalculator.length) * 100)
    : 0;
  const productionDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const estimatedCompletionTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + kitchenTotals.productionMinutes * 60_000));
  const productionNumber = `MR-${new Date().toLocaleDateString("en-CA").replaceAll("-", "")}-${liveKitchenOrders.length}`;
  const assignedKitchenTeam = Array.from(new Set(productionCalculator.map((item) => item.assignedCook.trim()).filter(Boolean))).join(", ");
  const productionQueue = productionCalculator.map((item) => ({
    meal: item.name,
    meals: item.meals,
    progress: item.status === "Complete" ? 100 : item.status === "Packaging" ? 80 : item.status === "Cooking" ? 60 : item.status === "Prep" ? 30 : 0,
    status: item.status,
  }));
  const quickStats = [
    { title: "Meals To Cook", value: String(queueTotalMeals), icon: ChefHat, color: "bg-blue-100 text-blue-700" },
    { title: "Meals Cooking", value: String(mealsCooking), icon: Play, color: "bg-blue-100 text-blue-700" },
    { title: "Meals Paused", value: String(mealsPaused), icon: Pause, color: "bg-amber-100 text-amber-700" },
    { title: "Meals Waiting", value: String(mealsWaiting), icon: ClipboardList, color: "bg-green-100 text-green-700" },
    { title: "Meals Packaging", value: String(mealsPackaging), icon: Package, color: "bg-purple-100 text-purple-700" },
    { title: "Meals Completed", value: String(queueCompletedMeals), icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700" },
    { title: "Containers Needed", value: String(totalContainers), icon: Package, color: "bg-orange-100 text-orange-700" },
    { title: "Deliveries Today", value: String(deliveriesToday), icon: Truck, color: "bg-purple-100 text-purple-700" },
  ];
  const ingredientRequirements = productionCalculator.map((item) => ({
    name: item.name,
    value: `${roundTo(getProductionMetrics(item).poundsRequired, 2)} lb`,
  }));
  const kitchenAlerts = [
    ...inventoryItems
      .filter((item) => item.quantity <= item.par_level)
      .map((item) => `${item.name} is ${item.quantity <= 0 ? "out of stock" : "running low"}.`),
    ...(deliveriesToday ? [`${deliveriesToday} deliveries scheduled today.`] : []),
    ...(productionQueueOrders.filter((order) => order.production_status === "Paused").map((order) => `Order ${order.order_number} production is paused.`)),
    ...(productionQueueOrders.filter((order) => order.production_status === "Stopped").map((order) => `Order ${order.order_number} production stopped: ${order.production_stop_reason || "No reason recorded"}.`)),
  ];

  function openMeal(meal: any) {
    const production = productionCalculator.find((item) => item.name === meal.meal);
    setSelectedMeal({ ...meal, originalName: meal.meal, assignedCook: production?.assignedCook ?? "", notes: "" });
    setShowMealModal(true);
  }

  function closeMeal() {
    setShowMealModal(false);
  }

  function openOrder(order: any) {
    setSelectedOrder(order);
    setShowOrderModal(true);
  }

  function closeOrder() {
    setShowOrderModal(false);
  }

  async function saveKitchenNote() {
    const note = newKitchenNote.trim();
    if (!note || !businessId) return;
    const { error: noteError } = await supabase.from("gbgs_kitchen_notes").insert({ business_id: businessId, note });
    if (noteError) setSaveMessage(noteError.message);
    else {
      setKitchenNotes((current) => [note, ...current]);
      setNewKitchenNote("");
      setSaveMessage("Kitchen note saved.");
    }
  }

  async function updateOrderStatus(order: string[], status: string) {
    const orderId = order[6];
    if (!orderId || !businessId) return;
    const { error } = await supabase.rpc("gbgs_transition_order", {
      p_business_id: businessId,
      p_order_id: orderId,
      p_order_status: status,
      p_label: status === "Ready" ? "Kitchen marked order ready" : `Order moved to ${status}`,
    });
    if (error) {
      setSaveMessage(error.message);
      return;
    }
    setSaveMessage(`Order moved to ${status}.`);
    closeOrder();
  }

  async function completeKitchenProduction() {
    const nextItems = productionCalculator.map((item) => ({
      ...item,
      status: "Complete" as const,
      timerRunning: false,
    }));
    setProductionCalculator(nextItems);
    await saveProduction(nextItems);
    setSaveMessage("Kitchen production completed.");
  }

  async function runProductionAction(orderId: string, action: "start" | "pause" | "resume" | "stop" | "complete", reason?: string) {
    if (!businessId) throw new Error("Business connection is not ready.");
    const { error } = await supabase.rpc("gbgs_transition_production_order", {
      p_business_id: businessId,
      p_order_id: orderId,
      p_action: action,
      p_reason: reason ?? null,
    });
    if (error) throw error;
  }

  async function startSelectedProduction() {
    setStartingProduction(true);
    setProductionActionError(false);
    setProductionActionMessage("Starting selected production...");
    try {
      if (!businessId) throw new Error("Business connection is not ready. Refresh the Kitchen page and try again.");
      const selectedOrders = productionQueueOrders.filter((order) => selectedProductionOrders.has(order.id));
      if (!selectedOrders.length) throw new Error("Select at least one waiting order to start production.");
      const invalidOrder = selectedOrders.find((order) => order.production_status !== "Waiting");
      if (invalidOrder) throw new Error(`Order ${invalidOrder.order_number} is not waiting and cannot be started.`);

      const planResult = await persistProductionPlan(productionCalculator);
      if (!planResult.ok) throw new Error(planResult.error);
      await Promise.all(selectedOrders.map((order) => runProductionAction(order.id, "start")));

      setSaveMessage("Kitchen production started.");
      setProductionActionMessage(`${selectedOrders.length} production order${selectedOrders.length === 1 ? "" : "s"} started successfully.`);
      setSelectedProductionOrders(new Set());
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Kitchen production could not be started.";
      setSaveMessage(message);
      setProductionActionError(true);
      setProductionActionMessage(message);
    } finally {
      setStartingProduction(false);
    }
  }

  async function handleProductionAction(order: string[], action: "start" | "pause" | "resume" | "stop" | "complete") {
    try {
      let reason: string | undefined;
      if (action === "stop") {
        if (!window.confirm("Stop production?")) return;
        const choices = "Ingredient shortage, Equipment issue, Customer cancelled, Kitchen emergency, Quality issue, Other";
        const selectedReason = window.prompt(`Reason required. Choose one:\n${choices}`)?.trim();
        if (!selectedReason) throw new Error("A stop reason is required.");
        const allowed = choices.split(", ");
        if (!allowed.includes(selectedReason)) throw new Error("Choose one of the listed stop reasons.");
        reason = selectedReason === "Other" ? window.prompt("Enter the stop reason:")?.trim() : selectedReason;
        if (!reason) throw new Error("A stop reason is required.");
      }
      setProductionActionError(false);
      setProductionActionMessage(`${action[0].toUpperCase()}${action.slice(1)} in progress...`);
      await runProductionAction(order[6], action, reason);
      const completedLabels = { start: "started", pause: "paused", resume: "resumed", stop: "stopped", complete: "completed" } as const;
      setProductionActionMessage(`Production ${completedLabels[action]} successfully.`);
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      setProductionActionError(true);
      setProductionActionMessage(caught instanceof Error ? caught.message : "Production action failed.");
    }
  }

  function elapsedProductionTime(order: string[]) {
    const stored = Number(order[10]) || 0;
    if (order[5] !== "Cooking") return stored;
    const anchor = order[9] || order[8];
    return stored + (anchor ? Math.max(0, Math.floor((Date.now() - new Date(anchor).getTime()) / 1000)) : 0);
  }

  async function saveSelectedMeal() {
    const nextItems = productionCalculator.map((item) => item.name === selectedMeal.originalName
      ? { ...item, name: selectedMeal.meal, meals: Number(selectedMeal.meals), assignedCook: selectedMeal.assignedCook, status: selectedMeal.status }
      : item);
    setProductionCalculator(nextItems);
    if ((await persistProductionPlan(nextItems, "Production item updated.")).ok) closeMeal();
  }

  async function completeSelectedMeal() {
    const nextItems = productionCalculator.map((item) => item.name === selectedMeal.originalName
      ? { ...item, status: "Complete" as const, timerRunning: false }
      : item);
    setProductionCalculator(nextItems);
    if ((await persistProductionPlan(nextItems, "Production item completed.")).ok) closeMeal();
  }

  async function deleteSelectedMeal() {
    const nextItems = productionCalculator.filter((item) => item.name !== selectedMeal.originalName);
    setProductionCalculator(nextItems);
    if ((await persistProductionPlan(nextItems, "Production item deleted.")).ok) closeMeal();
  }

  async function duplicateSelectedMeal() {
    const source = productionCalculator.find((item) => item.name === selectedMeal.originalName);
    if (!source) return;
    const nextId = Math.max(0, ...productionCalculator.map((item) => item.id)) + 1;
    const nextItems = [...productionCalculator, {
      ...source,
      id: nextId,
      name: `${source.name} Batch ${nextId}`,
      status: "Waiting" as const,
      elapsedSeconds: 0,
      timerRunning: false,
    }];
    setProductionCalculator(nextItems);
    if ((await persistProductionPlan(nextItems, "Production batch duplicated.")).ok) closeMeal();
  }

  async function togglePackingTask(task: string, checked: boolean) {
    const nextTasks = checked
      ? Array.from(new Set([...completedPackingTasks, task]))
      : completedPackingTasks.filter((item) => item !== task);
    setCompletedPackingTasks(nextTasks);
    if (!businessId) return;
    const summary = productionCalculator.reduce(
      (totals, item) => {
        const metrics = getProductionMetrics(item);
        totals.foodCost += metrics.extendedCost;
        totals.productionMinutes += metrics.estimatedMinutes;
        totals.meals = Math.max(totals.meals, item.meals);
        if (item.status === "Complete") totals.completedItems += 1;
        return totals;
      },
      { foodCost: 0, productionMinutes: 0, meals: 0, completedItems: 0 },
    );
    const { error } = await supabase.from("gbgs_production_plans").upsert({
      business_id: businessId,
      plan_data: productionCalculator,
      summary: { ...summary, itemCount: productionCalculator.length, packagingTasks: nextTasks },
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    setSaveMessage(error ? error.message : "Packaging checklist updated.");
  }

  return (
    <>
      <div className="min-h-screen bg-[#f4f6fb] p-8 print:hidden">


        {/* =======================================================
          HEADER
      ======================================================== */}

        <section className="rounded-3xl bg-[#081c35] p-8 text-white shadow-xl">

          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">

            <div>

              <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#d6a817]">
                Miz Rita HQ
              </p>

              <h1 className="mt-3 text-4xl font-bold">
                Kitchen Operations
              </h1>

              <p className="mt-3 max-w-2xl text-slate-300">
                Monitor meal production, cooking progress,
                packaging, inventory and deliveries from one place.
              </p>

            </div>

            <div className="flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() => void startSelectedProduction()}
                disabled={startingProduction}
                className="flex items-center gap-2 rounded-xl bg-[#d6a817] px-5 py-3 font-semibold text-[#081c35] transition hover:opacity-90"
              >

                <Play size={18} />

                {startingProduction ? "Starting Production..." : "Start Selected Production"}

              </button>

              <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 font-semibold transition hover:bg-white/10">

                <Printer size={18} />

                Print Cooking List

              </button>

            </div>

          </div>

        </section>

        {productionActionMessage && (
          <div role="status" className={`mt-4 rounded-2xl border p-4 font-semibold ${productionActionError ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
            {productionActionMessage}
          </div>
        )}

        {/* =======================================================
          KPI CARDS
      ======================================================== */}

        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">

          {quickStats.map((card) => {

            const Icon = card.icon;

            return (

              <div
                key={card.title}
                className="rounded-3xl bg-white p-6 shadow"
              >

                <div className="flex items-start justify-between">

                  <div>

                    <p className="text-sm text-slate-500">
                      {card.title}
                    </p>

                    <h2 className="mt-3 text-5xl font-bold text-slate-900">
                      {card.value}
                    </h2>

                  </div>

                  <div
                    className={`rounded-2xl p-4 ${card.color}`}
                  >

                    <Icon size={24} />

                  </div>

                </div>

              </div>

            );

          })}

        </section>

        {/* =======================================================
          PRODUCTION SECTION
      ======================================================== */}

        <section className="mt-8 grid gap-6 xl:grid-cols-3">

          <div className="xl:col-span-2 rounded-3xl bg-white p-7 shadow">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#d6a817]">
                  Production Queue
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Today's Cooking Schedule
                </h2>

              </div>

              <div className="rounded-full bg-green-100 px-5 py-2 text-sm font-semibold text-green-700">

                {overallProgress}% Complete

              </div>

            </div>

            <div className="mt-8 space-y-7">

              {productionQueue.map((item) => (

                <div
                  key={item.meal}
                  onClick={() => openMeal(item)}
                  className="cursor-pointer rounded-2xl p-3 transition hover:bg-slate-50"
                >

                  <div className="mb-2 flex items-center justify-between">

                    <div>

                      <h3 className="font-semibold text-slate-900">
                        {item.meal}
                      </h3>

                      <p className="text-sm text-slate-500">
                        {item.meals} Meals
                      </p>

                    </div>

                    <div className="text-right">

                      <p className="font-bold">
                        {item.progress}%
                      </p>

                      <p className="text-xs text-slate-500">
                        {item.status}
                      </p>

                    </div>

                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">

                    <div
                      className="h-full rounded-full bg-[#081c35]"
                      style={{
                        width: `${item.progress}%`,
                      }}
                    />

                  </div>

                </div>

              ))}

            </div>

          </div>

          <div className="space-y-6">

            <div className="rounded-3xl bg-white p-6 shadow">

              <div className="flex items-center gap-3">

                <Clock3 className="text-[#081c35]" />

                <h2 className="text-xl font-bold">
                  Today's Progress
                </h2>

              </div>

              <div className="mt-6">

                <div className="mb-2 flex justify-between">

                  <span className="text-sm text-slate-500">
                    Completed Meals
                  </span>

                  <span className="font-bold">
                    {queueCompletedMeals} / {queueTotalMeals}
                  </span>

                </div>

                <div className="h-4 overflow-hidden rounded-full bg-slate-200">

                  <div
                    className="h-full rounded-full bg-green-600"
                    style={{
                      width: `${queueProgress}%`,
                    }}
                  />

                </div>

              </div>

            </div>
            {/* QUICK ACTIONS */}

            <div className="rounded-3xl bg-white p-6 shadow">

              <h2 className="text-xl font-bold text-slate-900">
                Quick Actions
              </h2>

              <div className="mt-6 grid gap-3">

                <button onClick={() => setShowCookingList(true)} className="rounded-xl bg-[#081c35] py-3 font-semibold text-white hover:opacity-90">
                  Production Calculator
                </button>

                <button onClick={() => window.print()} className="rounded-xl border py-3 font-semibold hover:bg-slate-50">
                  Print Cooking List
                </button>

                <button onClick={() => window.print()} className="rounded-xl border py-3 font-semibold hover:bg-slate-50">
                  Print Labels
                </button>

                <button onClick={() => window.print()} className="rounded-xl border py-3 font-semibold hover:bg-slate-50">
                  Generate Packing List
                </button>

                <button onClick={completeKitchenProduction} className="rounded-xl border py-3 font-semibold hover:bg-slate-50">
                  Close Today&apos;s Operations
                </button>

              </div>

            </div>

            {/* ALERTS */}

            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">

              <div className="flex items-center gap-3">

                <AlertTriangle className="text-amber-600" />

                <h2 className="text-xl font-bold">
                  Kitchen Alerts
                </h2>

              </div>

              <div className="mt-5 space-y-3">

                {kitchenAlerts.length ? kitchenAlerts.map((alert) => (
                  <div key={alert} className="rounded-xl bg-white p-4">{alert}</div>
                )) : <div className="rounded-xl bg-white p-4">No kitchen alerts.</div>}

              </div>

            </div>

          </div>

        </section>
        {/* =======================================================
          PRODUCTION ORDERS
      ======================================================== */}

        <section className="mt-8 rounded-3xl bg-white p-8 shadow">

          <div className="flex items-center justify-between">
            <div className="mb-8 rounded-2xl border bg-white p-6 shadow-sm">

              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-600">
                    Today's Kitchen Production
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    Cooking Summary
                  </h2>

                  <p className="mt-1 text-slate-500">
                    Total food required for today's customer orders.
                  </p>
                </div>

                <div className="rounded-xl bg-green-100 px-4 py-3 text-center">
                  <p className="text-xs uppercase text-green-700">
                    Orders Today
                  </p>

                  <p className="text-3xl font-bold text-green-700">
                    {liveKitchenOrders.length}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {productionCalculator.map((item) => (
                  <div key={item.id} className="rounded-xl border p-4">
                    <p className="text-slate-500 text-sm">{item.name}</p>
                    <p className="text-3xl font-bold">{roundTo(getProductionMetrics(item).poundsRequired, 2)}</p>
                    <p className="text-sm text-slate-500">Pounds</p>
                  </div>
                ))}
              </div>

            </div>
            <div>

              <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#d6a817]">
                Production Board
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                Today's Production Orders
              </h2>

            </div>

            <button onClick={() => window.print()} className="rounded-xl bg-[#081c35] px-5 py-3 font-semibold text-white hover:opacity-90">

              Print Production Sheet

            </button>

          </div>

          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setSelectedProductionOrders(new Set(productionQueueOrders.filter((order) => order.production_status === "Waiting").map((order) => order.id)))} className="rounded-lg bg-[#081c35] px-4 py-2 text-sm font-bold text-white">Select All</button>
            <button type="button" onClick={() => setSelectedProductionOrders(new Set())} className="rounded-lg border px-4 py-2 text-sm font-bold">Clear Selection</button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border">

            <table className="min-w-full">

              <thead className="bg-slate-100">

                <tr>

                  <th className="px-3 py-4 text-left">Select</th>

                  <th className="px-5 py-4 text-left">
                    Order
                  </th>

                  <th className="px-5 py-4 text-left">
                    Customer
                  </th>

                  <th className="px-5 py-4 text-left">
                    Meal
                  </th>

                  <th className="px-5 py-4 text-left">
                    Meal Count
                  </th>

                  <th className="px-5 py-4 text-left">
                    Production Status
                  </th>

                  <th className="px-5 py-4 text-left">
                    Elapsed Time
                  </th>

                  <th className="px-5 py-4 text-left">Current Stage</th>
                  <th className="px-5 py-4 text-left">Assigned Cook</th>
                  <th className="px-5 py-4 text-left">Actions</th>

                </tr>

              </thead>

              <tbody>

                {liveKitchenOrders.map((order) => (
                  <tr
                    key={order[0]}
                    onClick={() => openOrder(order)}
                    className="border-t cursor-pointer hover:bg-slate-100 transition"
                  >

                    <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select order ${order[0]}`} disabled={order[5] !== "Waiting"} checked={selectedProductionOrders.has(order[6])} onChange={(event) => setSelectedProductionOrders((current) => { const next = new Set(current); if (event.target.checked) next.add(order[6]); else next.delete(order[6]); return next; })} />
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      #{order[0]}
                    </td>

                    <td className="px-5 py-4">
                      {order[1]}
                    </td>

                    <td className="px-5 py-4">
                      {order[3]}
                    </td>

                    <td className="px-5 py-4">
                      {order[2]}
                    </td>

                    <td className="px-5 py-4">

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold

                      ${order[5] === "Complete"
                            ? "bg-green-100 text-green-700"
                            : order[5] === "Cooking"
                              ? "bg-blue-100 text-blue-700"
                              : order[5] === "Packaging"
                                ? "bg-purple-100 text-purple-700"
                                : order[5] === "Prep"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-slate-100 text-slate-700"
                          }`}
                      >

                        {order[5]}

                      </span>

                    </td>

                    <td className="px-5 py-4 font-mono">{formatElapsedTime(elapsedProductionTime(order))}</td>
                    <td className="px-5 py-4">{order[5]}</td>
                    <td className="px-5 py-4 text-slate-500">Unassigned</td>
                    <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap gap-2">
                        {order[5] === "Waiting" && <button onClick={() => void handleProductionAction(order, "start")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Start</button>}
                        {order[5] === "Cooking" && <button onClick={() => void handleProductionAction(order, "pause")} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">Pause</button>}
                        {order[5] === "Paused" && <button onClick={() => void handleProductionAction(order, "resume")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Resume</button>}
                        {["Cooking", "Paused"].includes(order[5]) && <button onClick={() => void handleProductionAction(order, "stop")} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">Stop</button>}
                        {["Cooking", "Paused"].includes(order[5]) && <button onClick={() => void handleProductionAction(order, "complete")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Complete</button>}
                      </div>
                    </td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>

        </section>
        {/* =======================================================
          INGREDIENTS + PACKING
      ======================================================== */}

        <section className="mt-8 grid gap-6 xl:grid-cols-2">

          {/* INGREDIENTS */}

          <div className="rounded-3xl bg-white p-8 shadow">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#d6a817]">
                  Inventory
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Ingredients Needed
                </h2>

              </div>

              <Package className="text-[#081c35]" size={28} />

            </div>

            <div className="mt-8 space-y-5">

              {[...ingredientRequirements, { name: "Meal Containers", value: String(totalContainers) }, { name: "Labels", value: String(totalLabels) }].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between border-b pb-4"
                >

                  <span className="font-medium text-slate-700">
                    {item.name}
                  </span>

                  <span className="font-bold text-slate-900">
                    {item.value}
                  </span>

                </div>
              ))}

            </div>

          </div>

          {/* PACKING STATION */}

          <div className="rounded-3xl bg-white p-8 shadow">

            <div>

              <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#d6a817]">
                Packing Station
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                Packaging Checklist
              </h2>

            </div>

            <div className="mt-8 space-y-5">

              {[
                "Print Meal Labels",
                "Prepare Containers",
                "Seal Meal Containers",
                "Place Meals Into Bags",
                "Verify Customer Orders",
                "Move Orders To Pickup Shelf",
                "Load Delivery Orders",
              ].map((task) => (
                <label
                  key={task}
                  className="flex items-center gap-4 rounded-xl border p-4 hover:bg-slate-50"
                >

                  <input
                    type="checkbox"
                    checked={completedPackingTasks.includes(task)}
                    onChange={(event) => togglePackingTask(task, event.target.checked)}
                    className="h-5 w-5"
                  />

                  <span className="font-medium">
                    {task}
                  </span>

                </label>
              ))}

            </div>

            <div className="mt-8 grid gap-3">

              <button onClick={() => window.print()} className="rounded-xl bg-[#081c35] py-3 font-semibold text-white hover:opacity-90">
                Print Labels
              </button>

              <button onClick={() => window.print()} className="rounded-xl border py-3 font-semibold hover:bg-slate-50">
                Generate Packing Slips
              </button>

            </div>

          </div>

        </section>

        {/* =======================================================
          DELIVERY SCHEDULE + KITCHEN NOTES
      ======================================================== */}

        <section className="mt-8 grid gap-6 xl:grid-cols-2">

          {/* DELIVERY SCHEDULE */}

          <div className="rounded-3xl bg-white p-8 shadow">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#d6a817]">
                  Deliveries
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Today's Delivery Schedule
                </h2>

              </div>

              <Truck className="text-[#081c35]" size={28} />

            </div>

            <div className="mt-8 space-y-4">

              {liveKitchenOrders.map((delivery) => (
                <div
                  key={delivery[0]}
                  className="rounded-2xl border p-5 hover:bg-slate-50"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <h3 className="font-semibold">
                        {delivery[1]}
                      </h3>

                      <p className="text-sm text-slate-500">
                        {delivery[2]}
                      </p>

                    </div>

                    <div className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
                      {delivery[4]}
                    </div>

                  </div>

                </div>
              ))}

            </div>

          </div>

          {/* KITCHEN NOTES */}

          <div className="rounded-3xl bg-white p-8 shadow">

            <div className="flex items-center gap-3">

              <CheckCircle2
                className="text-green-600"
                size={28}
              />

              <h2 className="text-2xl font-bold">
                Kitchen Notes
              </h2>

            </div>

            <div className="mt-8 space-y-4">

              {kitchenNotes.map((note) => (
                <div
                  key={note}
                  className="rounded-2xl border p-4"
                >
                  {note}
                </div>
              ))}

            </div>

            <textarea
              placeholder="Kitchen notes..."
              value={newKitchenNote}
              onChange={(event) => setNewKitchenNote(event.target.value)}
              className="mt-8 h-40 w-full rounded-2xl border p-4 outline-none focus:border-[#081c35]"
            />

            <button onClick={() => void saveKitchenNote()} className="mt-6 w-full rounded-xl bg-[#081c35] py-3 font-semibold text-white hover:opacity-90">
              Save Kitchen Notes
            </button>

          </div>

        </section>
        {/* =======================================================
    EDIT MEAL MODAL
======================================================= */}

        {showMealModal && selectedMeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">

            <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-2xl">

              <div className="flex items-center justify-between">

                <div>
                  <h2 className="text-3xl font-bold text-slate-900">
                    Edit Meal Production
                  </h2>

                  <p className="mt-1 text-slate-500">
                    Update today's production information.
                  </p>
                </div>

                <button
                  onClick={closeMeal}
                  className="rounded-xl border px-5 py-2 hover:bg-slate-100"
                >
                  Close
                </button>

              </div>

              <div className="mt-8 grid gap-6 md:grid-cols-2">

                <div>

                  <label className="mb-2 block text-sm font-semibold">
                    Meal Name
                  </label>

                  <input
                    value={selectedMeal.meal}
                    onChange={(event) => setSelectedMeal({ ...selectedMeal, meal: event.target.value })}
                    className="w-full rounded-xl border p-3"
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-semibold">
                    Meals To Prepare
                  </label>

                  <input
                    type="number"
                    value={selectedMeal.meals}
                    onChange={(event) => setSelectedMeal({ ...selectedMeal, meals: Number(event.target.value) })}
                    className="w-full rounded-xl border p-3"
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-semibold">
                    Assigned Cook
                  </label>

                  <input
                    type="text"
                    value={selectedMeal.assignedCook}
                    onChange={(event) => setSelectedMeal({ ...selectedMeal, assignedCook: event.target.value })}
                    placeholder="Assign cook"
                    className="w-full rounded-xl border p-3"
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-semibold">
                    Status
                  </label>

                  <select
                    value={selectedMeal.status}
                    onChange={(event) => setSelectedMeal({ ...selectedMeal, status: event.target.value })}
                    className="w-full rounded-xl border p-3"
                  >

                    <option>Prep</option>
                    <option>Cooking</option>
                    <option>Packaging</option>
                    <option>Complete</option>

                  </select>

                </div>

              </div>

              <div className="mt-8">

                <label className="mb-2 block text-sm font-semibold">
                  Kitchen Notes
                </label>

                <textarea
                  rows={5}
                  value={selectedMeal.notes}
                  onChange={(event) => setSelectedMeal({ ...selectedMeal, notes: event.target.value })}
                  className="w-full rounded-xl border p-4"
                />

              </div>

              <div className="mt-8 flex flex-wrap justify-between gap-3">

                <div className="flex gap-3">

                  <button onClick={saveSelectedMeal} className="rounded-xl bg-[#081c35] px-6 py-3 font-semibold text-white">
                    Save Changes
                  </button>

                  <button onClick={completeSelectedMeal} className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white">
                    Mark Complete
                  </button>

                  <button onClick={deleteSelectedMeal} className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white">
                    Delete Meal
                  </button>

                </div>

                <div className="flex gap-3">

                  <button onClick={() => window.print()} className="rounded-xl border px-6 py-3 font-semibold">
                    Print Labels
                  </button>

                  <button onClick={() => window.print()} className="rounded-xl border px-6 py-3 font-semibold">
                    Print Recipe
                  </button>

                  <button onClick={duplicateSelectedMeal} className="rounded-xl border px-6 py-3 font-semibold">
                    Duplicate Batch
                  </button>

                </div>

              </div>

            </div>

          </div>
        )}

        {showOrderModal && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">

            <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-2xl">

              <div className="flex items-center justify-between">

                <div>
                  <h2 className="text-3xl font-bold">
                    Order #{selectedOrder[0]}
                  </h2>

                  <p className="text-slate-500">
                    Customer Order Details
                  </p>
                </div>

                <button
                  onClick={closeOrder}
                  className="rounded-xl border px-5 py-2"
                >
                  Close
                </button>

              </div>

              <div className="mt-8 grid grid-cols-2 gap-6">

                <div>

                  <p className="text-sm text-slate-500">
                    Customer
                  </p>

                  <h3 className="text-xl font-bold">
                    {selectedOrder[1]}
                  </h3>

                </div>

                <div>

                  <p className="text-sm text-slate-500">
                    Meals
                  </p>

                  <h3 className="text-xl font-bold">
                    {selectedOrder[2]}
                  </h3>

                </div>

                <div>

                  <p className="text-sm text-slate-500">
                    Pickup Time
                  </p>

                  <h3 className="text-xl font-bold">
                    {selectedOrder[4]}
                  </h3>

                </div>

                <div>

                  <p className="text-sm text-slate-500">
                    Status
                  </p>

                  <h3 className="text-xl font-bold">
                    {selectedOrder[5]}
                  </h3>

                </div>

              </div>

              <div className="mt-8 flex gap-3">

                <button onClick={() => { window.location.href = "/dashboard/miz-rita/orders"; }} className="rounded-xl bg-[#081c35] px-6 py-3 text-white font-semibold">
                  Edit Order
                </button>

                <button onClick={() => updateOrderStatus(selectedOrder, "Ready")} className="rounded-xl bg-green-600 px-6 py-3 text-white font-semibold">
                  Mark Ready
                </button>

                <button onClick={() => window.print()} className="rounded-xl border px-6 py-3 font-semibold">
                  Print Ticket
                </button>

              </div>

            </div>

          </div>
        )}

      </div>

      {showCookingList && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#020b16]/80 p-4 backdrop-blur-sm print:hidden md:p-8">
          <div className="mx-auto min-h-full max-w-7xl">
            <div className="overflow-hidden rounded-3xl bg-[#f4f6fb] shadow-2xl ring-1 ring-white/10">
              <div className="bg-[#081c35] px-6 py-6 text-white md:px-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-[#d6a817] p-3 text-[#081c35]">
                      <Calculator size={26} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d6a817]">
                        Miz Rita HQ · Live Production
                      </p>
                      <h2 className="mt-2 text-2xl font-bold md:text-3xl">
                        Smart Production Calculator
                      </h2>
                      <p className="mt-1 text-sm text-slate-300">
                        Adjust demand, portions, yield, and capacity. Production requirements update automatically.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={loadPreviousProduction}
                      className="rounded-xl border border-white/15 px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      <FolderOpen size={16} className="mr-2 inline" />
                      Load Previous
                    </button>
                    <button
                      onClick={() => void saveProduction()}
                      className="rounded-xl bg-[#d6a817] px-3.5 py-2.5 text-sm font-bold text-[#081c35] transition hover:brightness-105"
                    >
                      <Save size={16} className="mr-2 inline" />
                      Save Production
                    </button>
                    <button
                      onClick={() => setShowCookingList(false)}
                      aria-label="Close production calculator"
                      className="rounded-xl border border-white/15 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
                {saveMessage && (
                  <p className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-200">
                    {saveMessage}
                  </p>
                )}
              </div>

              <div className="p-5 md:p-8">
                <section>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#b58b0c]">
                        Kitchen Totals
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-slate-900">
                        Today&apos;s Production Snapshot
                      </h3>
                    </div>
                    <span className="hidden rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 md:inline">
                      Auto-calculated
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: "Total Orders", value: "26", icon: ClipboardList },
                      { label: "Total Meals", value: totalMeals, icon: ChefHat },
                      { label: "Total Proteins", value: `${roundTo(kitchenTotals.proteins, 2)} lb`, icon: Scale },
                      { label: "Total Vegetables", value: `${roundTo(kitchenTotals.vegetables, 2)} lb`, icon: Layers3 },
                      { label: "Total Carbohydrates", value: `${roundTo(kitchenTotals.carbohydrates, 2)} lb`, icon: Scale },
                      { label: "Total Containers", value: totalContainers, icon: Package },
                      { label: "Total Labels", value: totalLabels, icon: ClipboardList },
                      { label: "Est. Production Time", value: formatDuration(kitchenTotals.productionMinutes), icon: Timer },
                    ].map((total) => {
                      const Icon = total.icon;

                      return (
                        <div key={total.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {total.label}
                            </p>
                            <Icon size={17} className="text-[#d6a817]" />
                          </div>
                          <p className="mt-3 text-2xl font-bold text-[#081c35]">
                            {total.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_2fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Production Status
                        </p>
                        <span className="text-sm font-bold text-[#081c35]">
                          {completedItems}/{productionCalculator.length} complete
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {productionStatuses.map((status) => (
                          <span
                            key={status}
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyles[status]}`}
                          >
                            {status} {kitchenTotals.statuses[status]}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Overall Production Progress
                        </p>
                        <p className="text-lg font-bold text-[#081c35]">{overallProgress}%</p>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                          style={{ width: `${overallProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">Production Requirements</h3>
                      <p className="text-sm text-slate-500">
                        Configure the white fields; calculated quantities refresh instantly.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Live calculator
                    </div>
                  </div>

                  <div className="max-w-full overflow-x-auto overscroll-x-contain">
                    <table className="w-full min-w-[2100px] table-fixed text-sm">
                      <thead className="bg-[#081c35] text-left text-xs uppercase tracking-wide text-slate-300">
                        <tr>
                          <th className="sticky left-0 z-20 w-44 bg-[#081c35] px-4 py-3 font-semibold shadow-[4px_0_8px_rgba(2,11,22,0.18)]">Ingredient</th>
                          <th className="px-3 py-3 font-semibold">Total Meals</th>
                          <th className="px-3 py-3 font-semibold">Portion Size</th>
                          <th className="px-3 py-3 font-semibold">Cooked Weight</th>
                          <th className="px-3 py-3 font-semibold">Yield Loss</th>
                          <th className="px-3 py-3 font-semibold">Raw Weight</th>
                          <th className="px-3 py-3 font-semibold">Pounds Req.</th>
                          <th className="px-3 py-3 font-semibold">Batches</th>
                          <th className="px-3 py-3 font-semibold">Containers</th>
                          <th className="px-3 py-3 font-semibold">Labels</th>
                          <th className="px-3 py-3 font-semibold">Assigned Cook</th>
                          <th className="px-3 py-3 font-semibold">Est. Time</th>
                          <th className="px-3 py-3 font-semibold">Cost / Pound</th>
                          <th className="px-3 py-3 font-semibold">Cost / Unit</th>
                          <th className="px-3 py-3 font-semibold">Ingredient Cost</th>
                          <th className="px-3 py-3 font-semibold">Cost / Meal</th>
                          <th className="px-3 py-3 font-semibold">Extended Cost</th>
                          <th className="px-3 py-3 font-semibold">Expected Waste</th>
                          <th className="px-3 py-3 font-semibold">Actual Waste</th>
                          <th className="px-3 py-3 font-semibold">Pounds Lost</th>
                          <th className="px-3 py-3 font-semibold">Dollar Loss</th>
                          <th className="px-3 py-3 font-semibold">Status</th>
                          <th className="px-3 py-3 font-semibold">Production Timer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productionCalculator.map((item) => {
                          const metrics = getProductionMetrics(item);

                          return (
                            <tr key={item.id} className="align-top transition hover:bg-slate-50/80">
                              <td className="sticky left-0 z-10 bg-white px-4 py-4 shadow-[4px_0_8px_rgba(15,23,42,0.08)]">
                                <p className="font-bold text-slate-900">{item.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{item.category}</p>
                              </td>
                              <td className="px-3 py-4">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.meals}
                                  onChange={(event) => updateProductionItem(item.id, "meals", Math.max(0, Number(event.target.value)))}
                                  className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-semibold text-slate-900 outline-none focus:border-[#d6a817] focus:ring-2 focus:ring-[#d6a817]/20"
                                />
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={item.portionSize}
                                    onChange={(event) => updateProductionItem(item.id, "portionSize", Math.max(0, Number(event.target.value)))}
                                    className="w-20 rounded-l-lg border border-r-0 border-slate-300 bg-white px-2.5 py-2 font-semibold outline-none focus:z-10 focus:border-[#d6a817] focus:ring-2 focus:ring-[#d6a817]/20"
                                  />
                                  <select
                                    value={item.unit}
                                    onChange={(event) => updateProductionItem(item.id, "unit", event.target.value as WeightUnit)}
                                    className="rounded-r-lg border border-slate-300 bg-slate-50 px-2 py-2 font-semibold outline-none"
                                  >
                                    <option value="oz">oz</option>
                                    <option value="g">g</option>
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-4 font-bold text-slate-800">
                                {roundTo(metrics.cookedWeight)} {item.unit}
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex items-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="95"
                                    step="1"
                                    value={item.yieldLoss}
                                    onChange={(event) => updateProductionItem(item.id, "yieldLoss", Math.min(95, Math.max(0, Number(event.target.value))))}
                                    className="w-16 rounded-l-lg border border-r-0 border-slate-300 bg-white px-2.5 py-2 font-semibold outline-none focus:z-10 focus:border-[#d6a817] focus:ring-2 focus:ring-[#d6a817]/20"
                                  />
                                  <span className="rounded-r-lg border border-slate-300 bg-slate-50 px-2.5 py-2 font-semibold text-slate-500">%</span>
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <p className="font-bold text-slate-800">{roundTo(metrics.rawWeight)} {item.unit}</p>
                                <p className="mt-1 text-xs text-slate-500">includes loss</p>
                              </td>
                              <td className="px-3 py-4">
                                <span className="rounded-lg bg-[#d6a817]/15 px-2.5 py-1.5 font-bold text-[#7a5c00]">
                                  {roundTo(metrics.poundsRequired, 2)} lb
                                </span>
                              </td>
                              <td className="px-3 py-4">
                                <p className="font-bold text-slate-900">{metrics.batches}</p>
                                <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  capacity
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.batchCapacity}
                                    onChange={(event) => updateProductionItem(item.id, "batchCapacity", Math.max(1, Number(event.target.value)))}
                                    className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-slate-700 outline-none focus:border-[#d6a817]"
                                  />
                                </label>
                              </td>
                              <td className="px-3 py-4 font-bold text-slate-800">{item.meals}</td>
                              <td className="px-3 py-4 font-bold text-slate-800">{item.meals}</td>
                              <td className="px-3 py-4">
                                <input
                                  type="text"
                                  value={item.assignedCook}
                                  onChange={(event) => updateProductionItem(item.id, "assignedCook", event.target.value)}
                                  placeholder="Assign cook"
                                  className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-2 font-semibold outline-none focus:border-[#d6a817]"
                                />
                              </td>
                              <td className="px-3 py-4">
                                <p className="font-bold text-slate-900">{formatDuration(metrics.estimatedMinutes)}</p>
                                <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.minutesPerBatch}
                                    onChange={(event) => updateProductionItem(item.id, "minutesPerBatch", Math.max(1, Number(event.target.value)))}
                                    className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-slate-700 outline-none focus:border-[#d6a817]"
                                  />
                                  min/batch
                                </label>
                              </td>
                              <td className="px-3 py-4">
                                <label className="flex items-center">
                                  <span className="rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-2 py-2 font-semibold text-slate-500">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.costPerPound}
                                    onChange={(event) => updateProductionItem(item.id, "costPerPound", Math.max(0, Number(event.target.value)))}
                                    className="w-20 rounded-r-lg border border-slate-300 px-2 py-2 font-semibold outline-none focus:border-[#d6a817]"
                                  />
                                </label>
                              </td>
                              <td className="px-3 py-4">
                                <label className="flex items-center">
                                  <span className="rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-2 py-2 font-semibold text-slate-500">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.costPerUnit}
                                    onChange={(event) => updateProductionItem(item.id, "costPerUnit", Math.max(0, Number(event.target.value)))}
                                    className="w-20 rounded-r-lg border border-slate-300 px-2 py-2 font-semibold outline-none focus:border-[#d6a817]"
                                  />
                                </label>
                              </td>
                              <td className="px-3 py-4 font-bold text-slate-900">
                                ${roundTo(metrics.ingredientCost, 2)}
                              </td>
                              <td className="px-3 py-4 font-bold text-slate-900">
                                ${roundTo(metrics.costPerMeal, 2)}
                              </td>
                              <td className="px-3 py-4">
                                <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-700">
                                  ${roundTo(metrics.extendedCost, 2)}
                                </span>
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex items-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={item.expectedWaste}
                                    onChange={(event) => updateProductionItem(item.id, "expectedWaste", Math.min(100, Math.max(0, Number(event.target.value))))}
                                    className="w-16 rounded-l-lg border border-r-0 border-slate-300 px-2 py-2 font-semibold outline-none focus:border-[#d6a817]"
                                  />
                                  <span className="rounded-r-lg border border-slate-300 bg-slate-50 px-2 py-2 text-slate-500">%</span>
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className={`flex rounded-lg ${item.actualWaste > 10 ? "ring-2 ring-red-400" : ""}`}>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={item.actualWaste}
                                    onChange={(event) => updateProductionItem(item.id, "actualWaste", Math.min(100, Math.max(0, Number(event.target.value))))}
                                    className={`w-16 rounded-l-lg border border-r-0 px-2 py-2 font-bold outline-none focus:border-[#d6a817] ${item.actualWaste > 10 ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300"}`}
                                  />
                                  <span className={`rounded-r-lg border px-2 py-2 font-bold ${item.actualWaste > 10 ? "border-red-300 bg-red-100 text-red-700" : "border-slate-300 bg-slate-50 text-slate-500"}`}>%</span>
                                </div>
                              </td>
                              <td className={`px-3 py-4 font-bold ${item.actualWaste > 10 ? "text-red-700" : "text-slate-900"}`}>
                                {roundTo(metrics.poundsLost, 2)} lb
                              </td>
                              <td className={`px-3 py-4 font-bold ${item.actualWaste > 10 ? "text-red-700" : "text-slate-900"}`}>
                                ${roundTo(metrics.dollarLoss, 2)}
                              </td>
                              <td className="px-3 py-4">
                                <select
                                  value={item.status}
                                  onChange={(event) => updateProductionItem(item.id, "status", event.target.value as ProductionStatus)}
                                  className={`w-28 rounded-full px-3 py-2 text-xs font-bold outline-none ring-1 ${statusStyles[item.status]}`}
                                >
                                  {productionStatuses.map((status) => <option key={status}>{status}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-4">
                                <div className="min-w-56">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-xs text-slate-500">Elapsed</p>
                                      <p className="font-mono font-bold text-slate-900">{formatElapsedTime(item.elapsedSeconds)}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xs text-slate-500">Remaining</p>
                                      <p className="font-bold text-slate-900">{formatDuration(Math.ceil(metrics.remainingSeconds / 60))}</p>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex gap-1.5">
                                    <button
                                      onClick={() => setProductionTimer(item.id, "start")}
                                      disabled={item.timerRunning || item.status === "Complete"}
                                      className="rounded-lg bg-[#081c35] px-2.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      <Play size={12} className="mr-1 inline" />Start
                                    </button>
                                    <button
                                      onClick={() => setProductionTimer(item.id, "pause")}
                                      disabled={!item.timerRunning}
                                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      <Pause size={12} className="mr-1 inline" />Pause
                                    </button>
                                    <button
                                      onClick={() => setProductionTimer(item.id, "complete")}
                                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white"
                                    >
                                      <CircleCheck size={12} className="mr-1 inline" />Complete
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                          Today&apos;s Total Food Cost
                        </p>
                        <p className="mt-1 text-3xl font-bold text-emerald-800">
                          ${roundTo(kitchenTotals.foodCost, 2)}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-semibold uppercase text-red-600">Tracked Dollar Loss</p>
                        <p className="text-xl font-bold text-red-700">${roundTo(kitchenTotals.dollarLoss, 2)}</p>
                      </div>
                    </div>

                    <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                      {[
                        ["Total Proteins", `${roundTo(kitchenTotals.proteins, 2)} lb`],
                        ["Total Vegetables", `${roundTo(kitchenTotals.vegetables, 2)} lb`],
                        ["Total Carbohydrates", `${roundTo(kitchenTotals.carbohydrates, 2)} lb`],
                        ["Total Containers", totalContainers],
                        ["Total Labels", totalLabels],
                        ["Total Est. Cook Time", formatDuration(kitchenTotals.productionMinutes)],
                        ["Grand Food Weight", `${roundTo(kitchenTotals.foodWeight, 2)} lb`],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-[#081c35] px-4 py-4 text-white">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                          <p className="mt-1 text-lg font-bold">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-[#081c35] p-4 text-white lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-bold">Production plan ready</p>
                    <p className="text-sm text-slate-300">
                      {productionCalculator.reduce((sum, item) => sum + getProductionMetrics(item).batches, 0)} batches · {totalContainers} containers · {totalLabels} labels
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => window.print()}
                      className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
                    >
                      <Printer size={16} className="mr-2 inline" />
                      Print Production Sheet
                    </button>
                    <button
                      onClick={loadPreviousProduction}
                      className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
                    >
                      <FolderOpen size={16} className="mr-2 inline" />
                      Load Previous Production
                    </button>
                    <button
                      onClick={() => void saveProduction()}
                      className="rounded-xl bg-[#d6a817] px-5 py-2.5 text-sm font-bold text-[#081c35] transition hover:brightness-105"
                    >
                      <Save size={16} className="mr-2 inline" />
                      Save Production
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="production-print-sheet hidden bg-white p-8 text-black print:block">
        <style>{`
          @media print {
            @page { size: landscape; margin: 0.45in; }
            body * { visibility: hidden !important; }
            .production-print-sheet,
            .production-print-sheet * { visibility: visible !important; }
            .production-print-sheet {
              display: block !important;
              position: absolute;
              inset: 0;
              width: 100%;
              padding: 0;
              font-family: Arial, sans-serif;
            }
          }
        `}</style>

        <header className="border-b-4 border-[#081c35] pb-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#9a7710]">Official Production Sheet</p>
              <h1 className="mt-2 text-4xl font-bold text-[#081c35]">Miz Rita&apos;s Kitchen</h1>
            </div>
            <div className="rounded-lg bg-[#081c35] px-5 py-3 text-right text-white">
              <p className="text-xs uppercase tracking-wide text-slate-300">Production Number</p>
              <p className="text-xl font-bold">{productionNumber}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-6 text-sm">
            <div><span className="font-bold">Production Date:</span> {productionDate}</div>
            <div><span className="font-bold">Assigned Kitchen Team:</span> {assignedKitchenTeam || "—"}</div>
            <div><span className="font-bold">Estimated Completion:</span> {estimatedCompletionTime}</div>
          </div>
        </header>

        <table className="mt-7 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#081c35] text-white">
              {["Ingredient", "Meals", "Portion", "Raw Weight", "Batch #", "Assigned Cook", "Status"].map((heading) => (
                <th key={heading} className="border border-[#081c35] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productionCalculator.map((item) => {
              const metrics = getProductionMetrics(item);

              return (
                <tr key={item.id}>
                  <td className="border border-slate-400 px-3 py-3 font-bold">{item.name}</td>
                  <td className="border border-slate-400 px-3 py-3">{item.meals}</td>
                  <td className="border border-slate-400 px-3 py-3">{item.portionSize} {item.unit}</td>
                  <td className="border border-slate-400 px-3 py-3">{roundTo(metrics.poundsRequired, 2)} lb</td>
                  <td className="border border-slate-400 px-3 py-3">{metrics.batches}</td>
                  <td className="border border-slate-400 px-3 py-3">{item.assignedCook}</td>
                  <td className="border border-slate-400 px-3 py-3">{item.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <footer className="mt-7 grid grid-cols-4 gap-4 border-t-2 border-[#081c35] pt-5">
          {[
            ["Total Food Weight", `${roundTo(kitchenTotals.foodWeight, 2)} lb`],
            ["Total Containers", totalContainers],
            ["Total Labels", totalLabels],
            ["Estimated Completion Time", estimatedCompletionTime],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-400 p-3">
              <p className="text-xs font-bold uppercase text-slate-600">{label}</p>
              <p className="mt-1 text-xl font-bold text-[#081c35]">{value}</p>
            </div>
          ))}
        </footer>
      </div>

    </>
  );
}
