import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductionQueueOrder = {
  id: string;
  order_number: string;
  customer_id: string;
  meal_id: string | null;
  meal_count: number | null;
  order_status: string;
  notes: string | null;
  delivery_method: string | null;
  fulfillment_date: string | null;
  production_status: "Waiting" | "Cooking" | "Paused" | "Stopped" | "Awaiting Packaging" | "Packaging" | "Ready For Pickup" | "Ready For Delivery" | "Completed";
  production_started_at: string | null;
  production_paused_at: string | null;
  production_resumed_at: string | null;
  production_completed_at: string | null;
  production_stopped_at: string | null;
  production_elapsed_seconds: number;
  production_stop_reason: string | null;
};

export type ProductionQueueSummary = {
  waitingOrders: number;
  mealsWaiting: number;
  overdueOrders: number;
  cookingOrders: number;
  pausedOrders: number;
  packagingOrders: number;
  readyOrders: number;
  mealsRemaining: number;
  progress: number;
};

export async function queryProductionQueue(client: SupabaseClient, businessId: string, includeCompleted = false) {
  const columns = "id, order_number, customer_id, meal_id, meal_count, order_status, notes, delivery_method, fulfillment_date, production_status, production_started_at, production_paused_at, production_resumed_at, production_completed_at, production_stopped_at, production_elapsed_seconds, production_stop_reason";
  let query = client
    .from("gbgs_orders")
    .select(columns)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (!includeCompleted) query = query.not("order_status", "in", '("Completed","Cancelled")');
  return query;
}

export function summarizeProductionQueue(
  orders: ProductionQueueOrder[],
  today = new Date().toLocaleDateString("en-CA"),
): ProductionQueueSummary {
  const meals = (order: ProductionQueueOrder) => Number(order.meal_count) || 0;
  const waiting = orders.filter((order) => ["Waiting", "Stopped"].includes(order.production_status));
  const totalMeals = orders.reduce((sum, order) => sum + meals(order), 0);
  const progressMeals = orders.reduce((sum, order) => {
    const weight = ["Ready For Pickup", "Completed"].includes(order.production_status) ? 1 : order.production_status === "Packaging" ? 0.8 : ["Cooking", "Paused"].includes(order.production_status) ? 0.5 : 0;
    return sum + meals(order) * weight;
  }, 0);
  return {
    waitingOrders: waiting.length,
    mealsWaiting: waiting.reduce((sum, order) => sum + meals(order), 0),
    overdueOrders: orders.filter(
      (order) => !["Completed", "Ready For Pickup"].includes(order.production_status) && Boolean(order.fulfillment_date) && order.fulfillment_date!.slice(0, 10) < today,
    ).length,
    cookingOrders: orders.filter((order) => order.production_status === "Cooking").length,
    pausedOrders: orders.filter((order) => order.production_status === "Paused").length,
    packagingOrders: orders.filter((order) => order.production_status === "Packaging").length,
    readyOrders: orders.filter((order) => order.production_status === "Ready For Pickup").length,
    mealsRemaining: orders.filter((order) => !["Ready For Pickup", "Completed"].includes(order.production_status)).reduce((sum, order) => sum + meals(order), 0),
    progress: totalMeals ? Math.round(progressMeals / totalMeals * 100) : 0,
  };
}
