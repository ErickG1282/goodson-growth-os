"use client";
// Phase 5A Build 1


import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  Container,
  Copy,
  CreditCard,
  DollarSign,
  FileText,
  Heart,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Repeat2,
  Search,
  UtensilsCrossed,
  ShoppingBag,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";

import { SidebarContent } from "@/components/dashboard/sidebar";
import { TodaysAlerts } from "@/components/miz-rita/todays-alerts";
import { supabase } from "@/lib/supabase";
import { queryProductionQueue, type ProductionQueueOrder } from "@/lib/production-queue";

type Customer = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  dietary_notes: string | null;
  customer_status: string;
  created_at: string;
};

type Order = {
  id: string;
  customer_id: string;
  meal_id?: string | null;
  meal_count: number;
  order_number: string;
  order_date: string;
  fulfillment_date: string | null;
  order_status: string;
  payment_status: string;
  payment_method?: string | null;
  delivery_method?: string | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  discount?: number | null;
  amount_paid?: number | null;
  total: number;
  balance_due: number;
  notes?: string | null;
  production_status?: ProductionQueueOrder["production_status"] | null;
  created_at?: string;
};

type DashboardProductionItem = {
  id: number;
  name: string;
  category: "Protein" | "Vegetable" | "Side";
  meals: number;
  portionSize: number;
  unit: "oz" | "g";
  yieldLoss: number;
  costPerPound: number;
  costPerUnit: number;
  status: "Waiting" | "Prep" | "Cooking" | "Packaging" | "Complete";
  minutesPerBatch: number;
  batchCapacity: number;
};

type DashboardInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  parLevel: number;
  vendor?: string;
};

type DashboardDelivery = {
  id: string;
  order_id: string;
  delivery_type: "Pickup" | "Delivery";
  driver_name: string | null;
  status: "New Order" | "Preparing" | "Packaging" | "Ready" | "Out For Delivery" | "Delivered" | "Cancelled";
  scheduled_at: string | null;
  completed_at: string | null;
};

type OrderWorkflowStatus =
  | "New Order"
  | "Paid"
  | "Kitchen"
  | "Cooking"
  | "Packaging"
  | "Ready For Pickup"
  | "Out For Delivery"
  | "Delivered"
  | "Completed";

type OrderWorkflowEvent = {
  id: string;
  status: OrderWorkflowStatus;
  label: string;
  createdAt: string;
};

const ORDER_WORKFLOW: OrderWorkflowStatus[] = [
  "New Order",
  "Paid",
  "Kitchen",
  "Cooking",
  "Packaging",
  "Ready For Pickup",
  "Out For Delivery",
  "Delivered",
  "Completed",
];

type CustomerTag = {
  id: string;
  customer_id: string;
  business_id: string;
  tag: string;
  created_at: string;
};

type CustomerFormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  dietary_notes: string;
  customer_status: string;
};

type OrderFormState = {
  customer_id: string;
  fulfillment_date: string;
  order_status: string;
  payment_status: string;
  delivery_method: string;
  pickup_time: string;
  meal_plan: string;
  number_of_meals: string;
  subtotal: string;
  delivery_fee: string;
  discount: string;
  amount_paid: string;
  notes: string;
};

const CUSTOMER_TAG_OPTIONS = [
  "VIP",
  "Weekly",
  "Bi-Weekly",
  "Monthly",
  "Athlete",
  "Weight Loss",
  "Diabetic",
  "Family Plan",
  "High Protein",
  "Referral",
] as const;

function getCustomerTagClass(tag: string) {
  const normalized = tag.toLowerCase();

  if (normalized.includes("vip")) return "bg-amber-100 text-amber-900 ring-amber-200";
  if (normalized.includes("weekly")) return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (normalized.includes("diabetic")) return "bg-sky-100 text-sky-900 ring-sky-200";
  if (normalized.includes("athlete") || normalized.includes("protein")) return "bg-violet-100 text-violet-900 ring-violet-200";
  if (normalized.includes("weight")) return "bg-rose-100 text-rose-900 ring-rose-200";
  if (normalized.includes("family")) return "bg-orange-100 text-orange-900 ring-orange-200";
  if (normalized.includes("referral")) return "bg-cyan-100 text-cyan-900 ring-cyan-200";

  return "bg-slate-100 text-slate-800 ring-slate-200";
}

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  dietary_notes: "",
  customer_status: "Active",
};

const EMPTY_ORDER_FORM: OrderFormState = {
  customer_id: "",
  fulfillment_date: "",
  order_status: "Pending",
  payment_status: "Unpaid",
  delivery_method: "Pickup",
  pickup_time: "",
  meal_plan: "",
  number_of_meals: "",
  subtotal: "",
  delivery_fee: "",
  discount: "",
  amount_paid: "",
  notes: "",
};

export default function MizRitaPage() {
  const [businessId, setBusinessId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<DashboardDelivery[]>([]);
  const [menuPlans, setMenuPlans] = useState<Array<{ id: string; name: string; meals: number; price: number }>>([]);
  const [dashboardProduction, setDashboardProduction] = useState<DashboardProductionItem[]>([]);
  const [dashboardProductionSummary, setDashboardProductionSummary] = useState({
    foodCost: 0,
    productionMinutes: 0,
    meals: 0,
    completedItems: 0,
    itemCount: 0,
  });
  const [dashboardInventory, setDashboardInventory] = useState<DashboardInventoryItem[]>([]);
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [workflowEvents, setWorkflowEvents] = useState<Record<string, OrderWorkflowEvent[]>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [productionQueueOrders, setProductionQueueOrders] = useState<ProductionQueueOrder[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerForm, setCustomerForm] =
    useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderFormState>(EMPTY_ORDER_FORM);

  const loadData = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message || "You must be signed in.");
      }

      const { data: business, error: businessError } = await supabase
        .from("gbgs_businesses")
        .select("id")
        .eq("slug", "miz-ritas-kitchen")
        .maybeSingle();

      if (businessError || !business) {
        throw new Error(
          businessError?.message ||
            "Miz Rita's Kitchen business record was not found.",
        );
      }

      setBusinessId(business.id);

      const [
        { data: customerData, error: customerError },
        { data: orderData, error: orderError },
        { data: productionData, error: productionError },
        { data: inventoryData, error: inventoryError },
        { data: workflowData, error: workflowError },
        { data: menuData, error: menuError },
        { data: deliveryData, error: deliveryError },
        productionQueueResult,
      ] = await Promise.all([
        supabase
          .from("gbgs_customers")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("gbgs_orders")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false }),
        supabase.from("gbgs_production_plans").select("plan_data, summary").eq("business_id", business.id).maybeSingle(),
        supabase.from("gbgs_inventory_items").select("id, name, quantity, unit, par_level").eq("business_id", business.id),
        supabase.from("gbgs_order_workflow_events").select("id, order_id, status, label, created_at").eq("business_id", business.id).order("created_at"),
        supabase.from("gbgs_menu_meals").select("id, name, selling_price").eq("business_id", business.id).eq("status", "Active").order("name"),
        supabase.from("gbgs_deliveries").select("id, order_id, delivery_type, driver_name, status, scheduled_at, completed_at").eq("business_id", business.id),
        queryProductionQueue(supabase, business.id, true),
      ]);

      if (customerError || orderError || productionError || inventoryError || workflowError || menuError || deliveryError || productionQueueResult.error) {
        throw new Error(
          customerError?.message ||
            orderError?.message ||
            productionError?.message ||
            inventoryError?.message ||
            workflowError?.message ||
            menuError?.message ||
            deliveryError?.message ||
            productionQueueResult.error?.message ||
            "Unable to load Miz Rita data.",
        );
      }

      setCustomers((customerData ?? []) as Customer[]);
      setOrders((orderData ?? []) as Order[]);
      setDeliveries((deliveryData ?? []) as DashboardDelivery[]);
      setDashboardProduction(Array.isArray(productionData?.plan_data) ? productionData.plan_data as DashboardProductionItem[] : []);
      if (productionData?.summary && typeof productionData.summary === "object") setDashboardProductionSummary((current) => ({ ...current, ...productionData.summary }));
      setDashboardInventory((inventoryData ?? []).map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), unit: item.unit, parLevel: Number(item.par_level) })));
      const grouped: Record<string, OrderWorkflowEvent[]> = {};
      (workflowData ?? []).forEach((event) => { grouped[event.order_id] = [...(grouped[event.order_id] ?? []), { id: event.id, status: normalizeWorkflowStatus(event.status), label: event.label, createdAt: event.created_at }]; });
      setWorkflowEvents(grouped);
      setMenuPlans((menuData ?? []).map((meal) => ({ id: meal.id, name: meal.name, meals: 1, price: Number(meal.selling_price) })));
      setProductionQueueOrders((productionQueueResult.data ?? []) as ProductionQueueOrder[]);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`miz-rita-orders-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gbgs_orders",
          filter: `business_id=eq.${businessId}`,
        },
        () => void loadData(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_production_plans", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_inventory_items", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_order_workflow_events", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_deliveries", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, loadData]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return customers;
    }

    return customers.filter((customer) => {
      const fullName =
        `${customer.first_name} ${customer.last_name ?? ""}`.toLowerCase();

      return (
        fullName.includes(term) ||
        customer.phone?.toLowerCase().includes(term) ||
        customer.email?.toLowerCase().includes(term) ||
        customer.dietary_notes?.toLowerCase().includes(term) ||
        customer.customer_status.toLowerCase().includes(term)
      );
    });
  }, [customers, search]);

  const customerNames = useMemo(() => {
    return new Map(
      customers.map((customer) => [
        customer.id,
        `${customer.first_name} ${customer.last_name ?? ""}`.trim(),
      ]),
    );
  }, [customers]);

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }

    return orders.filter((order) => order.customer_id === selectedCustomer.id);
  }, [orders, selectedCustomer]);

  const productionOrders = useMemo(() => {
    return orders
      .filter(
        (order) => !["Completed", "Cancelled"].includes(order.order_status),
      )
      .map((order) => {
        const details = parseOrderDetails(order.notes, order.meal_count);
        const meals = Number(details.numberOfMeals);

        return {
          ...order,
          customer_name:
            customerNames.get(order.customer_id) || "Unknown customer",
          meal_plan: details.mealPlan,
          meals: Number.isFinite(meals) ? meals : 0,
          schedule_status: getProductionStatus(order.fulfillment_date),
        };
      })
      .sort((a, b) => {
        const aDate = a.fulfillment_date || "9999-12-31";
        const bDate = b.fulfillment_date || "9999-12-31";
        return aDate.localeCompare(bDate);
      });
  }, [orders, customerNames]);

  const mealsDueToday = useMemo(
    () =>
      productionOrders
        .filter((order) => order.schedule_status === "Prep Today")
        .reduce((sum, order) => sum + order.meals, 0),
    [productionOrders],
  );

  const upcomingMeals = useMemo(
    () => productionOrders.filter((order) => ["Prep Tomorrow", "Upcoming"].includes(order.schedule_status)).reduce((sum, order) => sum + order.meals, 0),
    [productionOrders],
  );

  const containersNeeded = upcomingMeals;

  const totalRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders],
  );

  const unpaidBalance = useMemo(
    () =>
      orders.reduce((sum, order) => sum + Number(order.balance_due || 0), 0),
    [orders],
  );

  const openOrders = useMemo(
    () =>
      orders.filter(
        (order) => !["Completed", "Cancelled"].includes(order.order_status),
      ).length,
    [orders],
  );

  function updateCustomerForm(field: keyof CustomerFormState, value: string) {
    setCustomerForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateOrderForm(field: keyof OrderFormState, value: string) {
    setOrderForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectMealPlan(planId: string) {
    if (!planId) {
      setOrderForm((current) => ({
        ...current,
        meal_plan: "",
        number_of_meals: "",
        subtotal: "",
      }));
      return;
    }

    const selectedPlan = menuPlans.find((plan) => plan.id === planId);

    if (!selectedPlan) {
      return;
    }

    setOrderForm((current) => ({
      ...current,
      meal_plan: selectedPlan.name,
      number_of_meals: selectedPlan.meals.toString(),
      subtotal: selectedPlan.price.toFixed(2),
    }));
  }

  async function addWorkflowEvent(
    orderId: string,
    status: OrderWorkflowStatus,
    label: string,
  ) {
    setWorkflowEvents((current) => {
      const next = {
        ...current,
        [orderId]: [
          ...(current[orderId] ?? []),
          {
            id: `${orderId}-${Date.now()}`,
            status,
            label,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      return next;
    });
    if (businessId) {
      const { error: eventError } = await supabase.from("gbgs_order_workflow_events").insert({ business_id: businessId, order_id: orderId, status, label });
      if (eventError) setError(eventError.message);
    }
  }

  async function updateOrderWorkflow(
    orderId: string,
    status: OrderWorkflowStatus,
    notification?: string,
  ) {
    const currentOrder = orders.find((order) => order.id === orderId);
    if (!currentOrder || currentOrder.order_status === status) return;

    const previousOrders = orders;
    const optimisticOrder = { ...currentOrder, order_status: status };
    setOrders((current) =>
      current.map((order) => order.id === orderId ? optimisticOrder : order),
    );
    if (selectedOrder?.id === orderId) setSelectedOrder(optimisticOrder);

    const label = notification ?? getWorkflowEventLabel(status);
    const { error: updateError } = await supabase.rpc("gbgs_transition_order", {
      p_business_id: businessId,
      p_order_id: orderId,
      p_order_status: status,
      p_label: label,
    });

    if (updateError) {
      setOrders(previousOrders);
      if (selectedOrder?.id === orderId) setSelectedOrder(currentOrder);
      setError(updateError.message);
      return;
    }

    const updatedOrder = optimisticOrder;
    setOrders((current) =>
      current.map((order) => order.id === orderId ? updatedOrder : order),
    );
    if (selectedOrder?.id === orderId) setSelectedOrder(updatedOrder);
    setToastMessage(label);
  }

  function openCustomerModal() {
    setError("");
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setShowCustomerModal(true);
  }

  function closeCustomerModal() {
    if (savingCustomer) {
      return;
    }

    setShowCustomerModal(false);
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setError("");
  }

  function openOrderModal() {
    setError("");
    setOrderStep(1);
    setReviewConfirmed(false);
    setOrderForm(EMPTY_ORDER_FORM);
    setShowOrderModal(true);
  }

  function closeOrderModal() {
    if (savingOrder) {
      return;
    }

    setShowOrderModal(false);
    setOrderStep(1);
    setReviewConfirmed(false);
    setOrderForm(EMPTY_ORDER_FORM);
    setError("");
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const firstName = customerForm.first_name.trim();

    if (!firstName) {
      setError("First name is required.");
      return;
    }

    if (!businessId) {
      setError("Miz Rita's Kitchen business record is not loaded.");
      return;
    }

    setSavingCustomer(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message || "You must be signed in.");
      }

      const { data, error: insertError } = await supabase
        .from("gbgs_customers")
        .insert({
          business_id: businessId,
          created_by: user.id,
          first_name: firstName,
          last_name: customerForm.last_name.trim() || null,
          phone: customerForm.phone.trim() || null,
          email: customerForm.email.trim() || null,
          dietary_notes: customerForm.dietary_notes.trim() || null,
          customer_status: customerForm.customer_status,
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      setCustomers((current) => [data as Customer, ...current]);
      setCustomerForm(EMPTY_CUSTOMER_FORM);
      setShowCustomerModal(false);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setSavingCustomer(false);
    }
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!businessId) {
      setError("Miz Rita's Kitchen business record is not loaded.");
      return;
    }

    if (!orderForm.customer_id) {
      setError("Select a customer for this order.");
      return;
    }

    const subtotal = parseMoneyInput(orderForm.subtotal);
    const deliveryFee = parseMoneyInput(orderForm.delivery_fee);
    const discount = parseMoneyInput(orderForm.discount);
    const amountPaid = parseMoneyInput(orderForm.amount_paid);

    const total = Math.max(0, subtotal + deliveryFee - discount);
    const balanceDue = Math.max(0, total - amountPaid);

    setSavingOrder(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message || "You must be signed in.");
      }

      const now = new Date();
      const orderNumber = `MR-${now
        .toISOString()
        .replace(/\D/g, "")
        .slice(0, 14)}`;

      const selectedMeal = menuPlans.find((meal) => meal.name === orderForm.meal_plan);
      if (!selectedMeal) throw new Error("Select a valid Menu meal.");
      const { data: createdOrderId, error: insertError } = await supabase.rpc("gbgs_create_order", {
          p_business_id: businessId,
          p_created_by: user.id,
          p_customer_id: orderForm.customer_id,
          p_meal_id: selectedMeal.id,
          p_values: {
          order_number: orderNumber,
          order_date: now.toISOString().slice(0, 10),
          fulfillment_date: orderForm.fulfillment_date || null,
          meal_count: Math.max(1, Math.floor(Number(orderForm.number_of_meals))),
          order_status:
            orderForm.payment_status === "Paid"
              ? "Paid"
              : orderForm.order_status === "Pending"
                ? "New Order"
                : orderForm.order_status,
          payment_status: orderForm.payment_status,
          delivery_method: orderForm.delivery_method,
          subtotal,
          delivery_fee: deliveryFee,
          discount,
          total,
          notes: buildOrderNotes(orderForm),
        },
        p_payment_amount: amountPaid,
      });

      if (insertError) {
        throw insertError;
      }

      const { data: createdOrder, error: reloadError } = await supabase.from("gbgs_orders").select("*").eq("id", createdOrderId).single();
      if (reloadError || !createdOrder) throw reloadError ?? new Error("Order could not be reloaded.");
      setOrders((current) => [createdOrder as Order, ...current]);
      const createdStatus = normalizeWorkflowStatus(createdOrder.order_status);
      if (createdOrder.payment_status.toLowerCase() === "paid") {
        setToastMessage("Payment Received");
      }
      setOrderForm(EMPTY_ORDER_FORM);
      setOrderStep(1);
      setShowOrderModal(false);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setSavingOrder(false);
    }
  }

  async function completeDashboardDelivery(orderId: string) {
    await updateOrderWorkflow(orderId, "Completed", "Order Delivered");
  }

  return (
    <div className="min-h-screen bg-[#f1f4f8]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      <main className="px-5 py-6 lg:ml-64 lg:px-8">
        <DailyCommandCenter
          orders={orders}
          deliveries={deliveries}
          productionOrders={productionOrders}
          menuPlans={menuPlans}
          productionQueueOrders={productionQueueOrders}
          customerNames={customerNames}
          production={dashboardProduction}
          productionSummary={dashboardProductionSummary}
          inventory={dashboardInventory}
          showEndOfDay={showEndOfDay}
          onReady={(orderId) => void updateOrderWorkflow(orderId, "Ready For Pickup")}
          onDeliveryComplete={(orderId) => void completeDashboardDelivery(orderId)}
          onCloseDay={() => setShowEndOfDay(true)}
          onReturn={() => setShowEndOfDay(false)}
        />

        <TodaysAlerts />

        <section id="orders-management" className="mt-8 rounded-3xl bg-[#081c35] p-7 text-white shadow-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d6a817]">
                Miz Rita HQ
              </p>

              <h1 className="mt-2 text-3xl font-bold">Customers & Orders</h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Manage customers, meal-prep orders, balances, fulfillment dates,
                and repeat business.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadData(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={openCustomerModal}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
              >
                <Plus className="h-4 w-4" />
                New Customer
              </button>

              <button
                type="button"
                onClick={openOrderModal}
                disabled={customers.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                New Order
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Customers"
            value={customers.length.toString()}
            detail="Total customer records"
            icon={<Users className="h-5 w-5" />}
          />

          <MetricCard
            label="Open Orders"
            value={openOrders.toString()}
            detail="Orders still in progress"
            icon={<ShoppingBag className="h-5 w-5" />}
          />

          <MetricCard
            label="Total Revenue"
            value={formatMoney(totalRevenue)}
            detail="Value of recorded orders"
            icon={<DollarSign className="h-5 w-5" />}
          />

          <MetricCard
            label="Balance Due"
            value={formatMoney(unpaidBalance)}
            detail="Outstanding balances"
            icon={<Clock3 className="h-5 w-5" />}
          />
        </section>

        {error && !showCustomerModal && !showOrderModal ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section id="reports" className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#081c35]">
                Customer Directory
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Search customers and review contact and dietary information.
              </p>
            </div>

            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers"
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-[#d6a817]"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-14 text-center text-sm text-slate-500">
              Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              title={search ? "No matching customers" : "No customers yet"}
              description={
                search
                  ? "Try a different name, phone number, email, or status."
                  : "Add the first Miz Rita customer to begin tracking orders."
              }
              actionLabel={search ? undefined : "Add First Customer"}
              onAction={search ? undefined : openCustomerModal}
            />
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[800px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Dietary Notes</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedCustomer(customer)}
                      className="cursor-pointer border-b border-slate-100 text-sm transition hover:bg-slate-50"
                    >
                      <td className="px-3 py-4 font-semibold text-[#081c35]">
                        {customer.first_name} {customer.last_name}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customer.phone
                          ? formatPhoneNumber(customer.phone)
                          : "—"}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customer.email || "—"}
                      </td>

                      <td className="max-w-sm px-3 py-4 text-slate-600">
                        <DietaryNotes notes={customer.dietary_notes} />
                      </td>

                      <td className="px-3 py-4">
                        <StatusBadge value={customer.customer_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
                Kitchen Operations
              </p>
              <h2 className="mt-1 text-xl font-bold text-[#081c35]">
                Production Dashboard
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                See what needs to be prepared, how many meals are due, and when
                each order is scheduled.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <ProductionMetric
              label="Meals To Prep Today"
              value={mealsDueToday.toString()}
              detail="Meals due for pickup or delivery today"
              icon={<ChefHat className="h-5 w-5" />}
            />
            <ProductionMetric
              label="Upcoming Meals"
              value={upcomingMeals.toString()}
              detail="Meals across all open orders"
              icon={<UtensilsCrossed className="h-5 w-5" />}
            />
            <ProductionMetric
              label="Containers Needed"
              value={containersNeeded.toString()}
              detail="Estimated one container per meal"
              icon={<Container className="h-5 w-5" />}
            />
          </div>

          {productionOrders.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 py-12 text-center">
              <p className="font-semibold text-[#081c35]">
                No open production orders
              </p>
              <p className="mt-1 text-sm text-slate-500">
                New orders will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Meal Plan</th>
                    <th className="px-3 py-3">Meals</th>
                    <th className="px-3 py-3">Pickup/Delivery</th>
                    <th className="px-3 py-3">Production Status</th>
                    <th className="px-3 py-3">Order Status</th>
                  </tr>
                </thead>
                <tbody>
                  {productionOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="cursor-pointer border-b border-slate-100 text-sm transition hover:bg-slate-50"
                    >
                      <td className="px-3 py-4 font-semibold text-[#081c35]">
                        {order.customer_name}
                      </td>
                      <td className="px-3 py-4 text-slate-600">
                        {order.meal_plan}
                      </td>
                      <td className="px-3 py-4 font-semibold text-[#081c35]">
                        {order.meals || "—"}
                      </td>
                      <td className="px-3 py-4 text-slate-600">
                        {order.fulfillment_date
                          ? formatDate(order.fulfillment_date)
                          : "Not scheduled"}
                      </td>
                      <td className="px-3 py-4">
                        <ProductionStatusBadge
                          value={order.schedule_status}
                        />
                      </td>
                      <td className="px-3 py-4">
                        <StatusBadge value={order.order_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#081c35]">
                Meal Plan Catalog
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                These plans automatically fill the meal count and subtotal when
                creating an order.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {menuPlans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <p className="text-sm font-bold text-[#081c35]">{plan.name}</p>
                <p className="mt-2 text-3xl font-bold text-[#081c35]">
                  {formatMoney(plan.price)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {plan.meals} prepared meals
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <div>
            <h2 className="text-xl font-bold text-[#081c35]">Recent Orders</h2>

            <p className="mt-1 text-sm text-slate-500">
              Review order totals, fulfillment dates, and balances.
            </p>
          </div>

          {loading ? (
            <div className="py-14 text-center text-sm text-slate-500">
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Add an order after creating at least one customer."
              actionLabel={
                customers.length > 0 ? "Create First Order" : undefined
              }
              onAction={customers.length > 0 ? openOrderModal : undefined}
            />
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Order</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Order Date</th>
                    <th className="px-3 py-3">Fulfillment</th>
                    <th className="px-3 py-3">Order Status</th>
                    <th className="px-3 py-3">Payment</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Balance</th>
                  </tr>
                </thead>

                <tbody>
                  {orders.slice(0, 20).map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="cursor-pointer border-b border-slate-100 text-sm transition hover:bg-slate-50"
                    >
                      <td className="px-3 py-4 font-semibold text-[#081c35]">
                        {order.order_number}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customerNames.get(order.customer_id) ||
                          "Unknown customer"}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {formatDate(order.order_date)}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {order.fulfillment_date
                          ? formatDate(order.fulfillment_date)
                          : "Not scheduled"}
                      </td>

                      <td className="px-3 py-4">
                        <StatusBadge value={order.order_status} />
                      </td>

                      <td className="px-3 py-4">
                        <StatusBadge value={order.payment_status} />
                      </td>

                      <td className="px-3 py-4 text-right font-semibold text-[#081c35]">
                        {formatMoney(Number(order.total || 0))}
                      </td>

                      <td className="px-3 py-4 text-right font-semibold text-red-700">
                        {formatMoney(Number(order.balance_due || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {showCustomerModal ? (
        <Modal
          eyebrow="Miz Rita HQ"
          title="New Customer"
          onClose={closeCustomerModal}
          disableClose={savingCustomer}
          maxWidthClass="max-w-2xl"
        >
          <form onSubmit={saveCustomer} className="p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="First Name" required>
                <input
                  required
                  value={customerForm.first_name}
                  onChange={(event) =>
                    updateCustomerForm("first_name", event.target.value)
                  }
                  className="form-input"
                  placeholder="First name"
                />
              </FormField>

              <FormField label="Last Name">
                <input
                  value={customerForm.last_name}
                  onChange={(event) =>
                    updateCustomerForm("last_name", event.target.value)
                  }
                  className="form-input"
                  placeholder="Last name"
                />
              </FormField>

              <FormField label="Phone">
                <input
                  value={customerForm.phone}
                  onChange={(event) =>
                    updateCustomerForm("phone", event.target.value)
                  }
                  className="form-input"
                  placeholder="(470) 555-0123"
                />
              </FormField>

              <FormField label="Email">
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(event) =>
                    updateCustomerForm("email", event.target.value)
                  }
                  className="form-input"
                  placeholder="customer@email.com"
                />
              </FormField>

              <FormField label="Customer Status">
                <select
                  value={customerForm.customer_status}
                  onChange={(event) =>
                    updateCustomerForm("customer_status", event.target.value)
                  }
                  className="form-input"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Lead">Lead</option>
                </select>
              </FormField>

              <div className="md:col-span-2">
                <FormField label="Dietary Notes">
                  <textarea
                    value={customerForm.dietary_notes}
                    onChange={(event) =>
                      updateCustomerForm("dietary_notes", event.target.value)
                    }
                    className="form-input min-h-28 resize-y"
                    placeholder="Allergies, restrictions, preferences, or health-related meal notes"
                  />
                </FormField>
              </div>
            </div>

            {error ? <ErrorBox message={error} /> : null}

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCustomerModal}
                disabled={savingCustomer}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingCustomer}
                className="rounded-xl bg-[#d6a817] px-5 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingCustomer ? "Saving..." : "Save Customer"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showOrderModal ? (
        <Modal
          eyebrow="Miz Rita HQ"
          title="New Order Wizard"
          onClose={closeOrderModal}
          disableClose={savingOrder}
          maxWidthClass="max-w-3xl"
        >
          <form onSubmit={saveOrder} className="p-6">
            <OrderWizardProgress currentStep={orderStep} />

            {orderStep === 1 ? (
              <div className="mt-6 space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-[#081c35]">
                    Step 1: Select Customer
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Choose who this meal-prep order belongs to.
                  </p>
                </div>

                <FormField label="Customer" required>
                  <select
                    required
                    value={orderForm.customer_id}
                    onChange={(event) =>
                      updateOrderForm("customer_id", event.target.value)
                    }
                    className="form-input"
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name ?? ""}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            ) : null}

            {orderStep === 2 ? (
              <div className="mt-6 space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-[#081c35]">
                    Step 2: Select Meal Plan
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    The plan automatically fills the meal count and subtotal.
                  </p>
                </div>

                <FormField label="Meal Plan Purchased" required>
                  <select
                    required
                    value={
                      menuPlans.find(
                        (plan) => plan.name === orderForm.meal_plan,
                      )?.id || ""
                    }
                    onChange={(event) => selectMealPlan(event.target.value)}
                    className="form-input"
                  >
                    <option value="">Select meal plan</option>
                    {menuPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} — {plan.meals} meals —{" "}
                        {formatMoney(plan.price)}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="grid gap-5 md:grid-cols-2">
                  <FormField label="Number of Meals">
                    <input
                      value={orderForm.number_of_meals}
                      readOnly
                      className="form-input bg-slate-50"
                      placeholder="Select a meal plan"
                    />
                  </FormField>

                  <FormField label="Subtotal">
                    <input
                      value={orderForm.subtotal}
                      readOnly
                      className="form-input bg-slate-50"
                      placeholder="Select a meal plan"
                    />
                  </FormField>
                </div>
              </div>
            ) : null}

            {orderStep === 3 ? (
              <div className="mt-6 space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-[#081c35]">
                    Step 3: Pickup or Delivery
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Schedule how and when the customer receives the order.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <FormField label="Delivery Method" required>
                    <select
                      required
                      value={orderForm.delivery_method}
                      onChange={(event) =>
                        updateOrderForm("delivery_method", event.target.value)
                      }
                      className="form-input"
                    >
                      <option value="Pickup">Pickup</option>
                      <option value="Delivery">Delivery</option>
                    </select>
                  </FormField>

                  <FormField label="Pickup/Delivery Date" required>
                    <input
                      required
                      type="date"
                      value={orderForm.fulfillment_date}
                      onChange={(event) =>
                        updateOrderForm("fulfillment_date", event.target.value)
                      }
                      className="form-input"
                    />
                  </FormField>

                  <FormField label="Pickup/Delivery Time">
                    <input
                      type="time"
                      value={orderForm.pickup_time}
                      onChange={(event) =>
                        updateOrderForm("pickup_time", event.target.value)
                      }
                      className="form-input"
                    />
                  </FormField>

                  <FormField label="Order Status">
                    <select
                      value={orderForm.order_status}
                      onChange={(event) =>
                        updateOrderForm("order_status", event.target.value)
                      }
                      className="form-input"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="In Progress">In Progress</option>
                    </select>
                  </FormField>
                </div>
              </div>
            ) : null}

            {orderStep === 4 ? (
              <div className="mt-6 space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-[#081c35]">
                    Step 4: Payment
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Record fees, discounts, payments, and the remaining balance.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <FormField label="Payment Status">
                    <select
                      value={orderForm.payment_status}
                      onChange={(event) =>
                        updateOrderForm("payment_status", event.target.value)
                      }
                      className="form-input"
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partial">Deposit / Partial</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </FormField>

                  <MoneyInput
                    label="Amount Paid"
                    value={orderForm.amount_paid}
                    onChange={(value) => updateOrderForm("amount_paid", value)}
                  />

                  <MoneyInput
                    label="Delivery Fee"
                    value={orderForm.delivery_fee}
                    onChange={(value) => updateOrderForm("delivery_fee", value)}
                  />

                  <MoneyInput
                    label="Discount"
                    value={orderForm.discount}
                    onChange={(value) => updateOrderForm("discount", value)}
                  />
                </div>

                <OrderSummary form={orderForm} />
              </div>
            ) : null}

            {orderStep === 5 ? (
              <div className="mt-6 space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-[#081c35]">
                    Step 5: Review Order
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Confirm the order before saving it.
                  </p>
                </div>

                <OrderReview
                  form={orderForm}
                  customerName={
                    customerNames.get(orderForm.customer_id) ||
                    "No customer selected"
                  }
                />

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    onChange={(event) =>
                      setReviewConfirmed(event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-bold text-[#081c35]">
                      I reviewed this order
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      The order will not save until you check this box and press
                      Finish & Save Order.
                    </span>
                  </span>
                </label>

                <FormField label="Order Notes">
                  <textarea
                    value={orderForm.notes}
                    onChange={(event) =>
                      updateOrderForm("notes", event.target.value)
                    }
                    className="form-input min-h-28 resize-y"
                    placeholder="Meals, special instructions, delivery notes..."
                  />
                </FormField>
              </div>
            ) : null}

            {error ? <ErrorBox message={error} /> : null}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <div>
                {orderStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewConfirmed(false);
                      setOrderStep((step) => step - 1);
                    }}
                    disabled={savingOrder}
                    className="w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 sm:w-auto"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeOrderModal}
                    disabled={savingOrder}
                    className="w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 sm:w-auto"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {orderStep < 5 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const validationError = validateOrderStep(
                        orderStep,
                        orderForm,
                      );

                      if (validationError) {
                        setError(validationError);
                        return;
                      }

                      setError("");
                      setOrderStep((step) => step + 1);
                    }}
                    className="rounded-xl bg-[#d6a817] px-5 py-3 text-sm font-bold text-[#081c35]"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={savingOrder || !reviewConfirmed}
                    className="rounded-xl bg-[#d6a817] px-5 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingOrder ? "Saving..." : "Finish & Save Order"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {selectedCustomer ? (
        <CustomerDetailsModal
          businessId={businessId}
          customer={selectedCustomer}
          orders={selectedCustomerOrders}
          onClose={() => setSelectedCustomer(null)}
          onOrderUpdated={(updatedOrder) => {
            const previousOrder = orders.find((order) => order.id === updatedOrder.id);
            setOrders((current) =>
              current.map((order) =>
                order.id === updatedOrder.id ? updatedOrder : order,
              ),
            );
            if (
              previousOrder?.payment_status.toLowerCase() !== "paid" &&
              updatedOrder.payment_status.toLowerCase() === "paid"
            ) {
              void updateOrderWorkflow(updatedOrder.id, "Paid", "Payment Received");
            }
          }}
          onCreateOrder={(repeatOrder) => {
            setSelectedCustomer(null);

            if (repeatOrder) {
              const details = parseOrderDetails(repeatOrder.notes, repeatOrder.meal_count);
              setOrderForm({
                ...EMPTY_ORDER_FORM,
                customer_id: selectedCustomer.id,
                delivery_method: repeatOrder.delivery_method || "Pickup",
                meal_plan:
                  details.mealPlan === "Not specified" ? "" : details.mealPlan,
                number_of_meals:
                  details.numberOfMeals === "Not specified"
                    ? ""
                    : details.numberOfMeals,
                subtotal: String(
                  repeatOrder.subtotal ?? repeatOrder.total ?? "",
                ),
                delivery_fee: String(repeatOrder.delivery_fee ?? ""),
                discount: String(repeatOrder.discount ?? ""),
                notes: repeatOrder.notes || "",
              });
            } else {
              setOrderForm({
                ...EMPTY_ORDER_FORM,
                customer_id: selectedCustomer.id,
              });
            }

            setError("");
            setOrderStep(2);
            setShowOrderModal(true);
          }}
        />
      ) : null}

      {selectedOrder ? (
        <OrderDetailsModal
          order={selectedOrder}
          customer={customers.find((customer) => customer.id === selectedOrder.customer_id) ?? null}
          customerName={
            customerNames.get(selectedOrder.customer_id) || "Unknown customer"
          }
          updating={updatingOrder}
          workflowEvents={workflowEvents[selectedOrder.id] ?? []}
          onClose={() => setSelectedOrder(null)}
          onAdvance={async () => {
            const currentStatus = normalizeWorkflowStatus(selectedOrder.order_status);
            const nextStatus = getNextWorkflowStatus(currentStatus, selectedOrder.delivery_method);
            if (nextStatus) {
              await updateOrderWorkflow(selectedOrder.id, nextStatus);
            }
          }}
          onMarkCompleted={async () => {
            setUpdatingOrder(true);
            setError("");

            const { error: updateError } = await supabase.rpc("gbgs_transition_order", {
              p_business_id: businessId,
              p_order_id: selectedOrder.id,
              p_order_status: "Completed",
              p_label: "Order Completed",
            });

            if (updateError) {
              setError(updateError.message);
              setUpdatingOrder(false);
              return;
            }

            const updatedOrder = { ...selectedOrder, order_status: "Completed" };

            setOrders((current) =>
              current.map((order) =>
                order.id === updatedOrder.id ? updatedOrder : order,
              ),
            );
            setSelectedOrder(updatedOrder);
            setToastMessage("Order Completed");
            setUpdatingOrder(false);
          }}
          onDuplicate={async () => {
            setUpdatingOrder(true);
            setError("");

            const {
              data: { user },
              error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
              setError(userError?.message || "You must be signed in.");
              setUpdatingOrder(false);
              return;
            }

            const now = new Date();
            const orderNumber = `MR-${now
              .toISOString()
              .replace(/\D/g, "")
              .slice(0, 14)}`;

            if (!selectedOrder.meal_id) {
              setError("This legacy order must be linked to a Menu meal before it can be duplicated.");
              setUpdatingOrder(false);
              return;
            }
            const { data: duplicatedId, error: duplicateError } = await supabase.rpc("gbgs_create_order", {
                p_business_id: businessId,
                p_created_by: user.id,
                p_customer_id: selectedOrder.customer_id,
                p_meal_id: selectedOrder.meal_id,
                p_values: {
                order_number: orderNumber,
                order_date: now.toISOString().slice(0, 10),
                fulfillment_date: selectedOrder.fulfillment_date,
                meal_count: selectedOrder.meal_count,
                order_status: "Pending",
                payment_status: "Unpaid",
                delivery_method: selectedOrder.delivery_method || "Pickup",
                subtotal: Number(selectedOrder.subtotal || 0),
                delivery_fee: Number(selectedOrder.delivery_fee || 0),
                discount: Number(selectedOrder.discount || 0),
                total: Number(selectedOrder.total || 0),
                notes: selectedOrder.notes || null,
              },
              p_payment_amount: 0,
            });

            if (duplicateError) {
              setError(duplicateError.message);
              setUpdatingOrder(false);
              return;
            }

            const { data: duplicatedOrder, error: reloadError } = await supabase.from("gbgs_orders").select("*").eq("id", duplicatedId).single();
            if (reloadError || !duplicatedOrder) {
              setError(reloadError?.message ?? "Duplicated order could not be loaded.");
              setUpdatingOrder(false);
              return;
            }
            setOrders((current) => [duplicatedOrder, ...current]);
            setSelectedOrder(duplicatedOrder);
            setUpdatingOrder(false);
          }}
          onDelete={async () => {
            const confirmed = window.confirm(
              `Delete order ${selectedOrder.order_number}? This cannot be undone.`,
            );

            if (!confirmed) {
              return;
            }

            setUpdatingOrder(true);
            setError("");

            const { error: deleteError } = await supabase
              .from("gbgs_orders")
              .delete()
              .eq("id", selectedOrder.id);

            if (deleteError) {
              setError(deleteError.message);
              setUpdatingOrder(false);
              return;
            }

            setOrders((current) =>
              current.filter((order) => order.id !== selectedOrder.id),
            );
            setSelectedOrder(null);
            setUpdatingOrder(false);
          }}
        />
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl bg-[#081c35] px-5 py-4 font-bold text-white shadow-2xl">
          <CheckCircle2 className="h-5 w-5 text-[#d6a817]" />
          {toastMessage}
        </div>
      ) : null}

      <style jsx global>{`
        .form-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
          color: #081c35;
          outline: none;
          background: white;
        }

        .form-input:focus {
          border-color: #d6a817;
          box-shadow: 0 0 0 3px rgba(214, 168, 23, 0.12);
        }
      `}</style>
    </div>
  );
}

function DailyCommandCenter({
  orders,
  deliveries,
  productionOrders,
  menuPlans,
  productionQueueOrders,
  customerNames,
  production,
  productionSummary,
  inventory,
  showEndOfDay,
  onReady,
  onDeliveryComplete,
  onCloseDay,
  onReturn,
}: {
  orders: Order[];
  deliveries: DashboardDelivery[];
  productionOrders: Array<Order & {
    customer_name: string;
    meal_plan: string;
    meals: number;
    schedule_status: string;
  }>;
  menuPlans: Array<{ id: string; name: string }>;
  productionQueueOrders: ProductionQueueOrder[];
  customerNames: Map<string, string>;
  production: DashboardProductionItem[];
  productionSummary: {
    foodCost: number;
    productionMinutes: number;
    meals: number;
    completedItems: number;
    itemCount: number;
  };
  inventory: DashboardInventoryItem[];
  showEndOfDay: boolean;
  onReady: (orderId: string) => void;
  onDeliveryComplete: (orderId: string) => void;
  onCloseDay: () => void;
  onReturn: () => void;
}) {
  const dateKey = getLocalDateKey();
  const activeToday = orders.filter(
    (order) => order.order_status !== "Cancelled" && order.fulfillment_date?.slice(0, 10) === dateKey,
  );
  const todayProductionOrders = productionQueueOrders.filter(
    (order) => order.order_status !== "Cancelled" && order.fulfillment_date?.slice(0, 10) === dateKey,
  );
  const productionQueueSummary = summarizeDashboardProduction(productionQueueOrders, dateKey);
  const mealNames = new Map(menuPlans.map((meal) => [meal.id, meal.name]));
  const orderDetails = activeToday.map((order) => {
    const details = parseOrderDetails(order.notes, order.meal_count);
    return {
      ...order,
      details: {
        ...details,
        mealPlan: (order.meal_id ? mealNames.get(order.meal_id) : undefined) ?? details.mealPlan,
      },
      customerName:
        "customer_name" in order
          ? String(order.customer_name)
          : customerNames.get(order.customer_id) ?? "Unknown customer",
    };
  });
  const mealsScheduled = productionQueueSummary.totalMeals;
  const productionProgress = productionQueueSummary.progress;
  const mealsCompleted = productionQueueSummary.mealsCompleted;
  const mealsRemaining = productionQueueSummary.mealsRemaining;
  const inventoryAlerts = inventory.filter((item) => item.quantity < item.parLevel);
  const completedOrders = activeToday.filter((order) => order.order_status === "Completed");
  const deliveriesToday = deliveries.filter((delivery) => delivery.delivery_type === "Delivery" && delivery.scheduled_at?.startsWith(dateKey));
  const readyForPickup = deliveries.filter((delivery) => delivery.delivery_type === "Pickup" && delivery.status === "Ready").length;
  const outForDelivery = deliveries.filter((delivery) => delivery.status === "Out For Delivery").length;
  const deliveredToday = deliveries.filter((delivery) => delivery.status === "Delivered" && delivery.completed_at?.startsWith(dateKey)).length;
  const lateDeliveries = deliveries.filter((delivery) => delivery.delivery_type === "Delivery" && delivery.scheduled_at && new Date(delivery.scheduled_at) < new Date() && !["Delivered", "Cancelled"].includes(delivery.status)).length;
  const deliveriesRemaining = deliveriesToday.filter((delivery) => !["Delivered", "Cancelled"].includes(delivery.status)).length;
  const deliveryQueue = deliveriesToday.flatMap((delivery) => {
    const order = orderDetails.find((item) => item.id === delivery.order_id);
    return order ? [{ delivery, order }] : [];
  });
  const revenueToday = activeToday.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const foodCost = productionSummary.foodCost;
  const productionMinutes = productionSummary.productionMinutes;
  const estimatedFinish = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + Math.max(0, productionMinutes * (1 - productionProgress / 100)) * 60_000));
  const pickupTimes = orderDetails
    .map((order) => order.details.pickupDeliveryTime)
    .filter((value) => value && value !== "Not scheduled")
    .sort();
  const firstPickup = pickupTimes[0] || "Not scheduled";
  const stationCounts = [
    { status: "Waiting", statuses: ["Waiting", "Stopped"] },
    { status: "Cooking", statuses: ["Cooking", "Paused"] },
    { status: "Awaiting Packaging", statuses: ["Awaiting Packaging"] },
    { status: "Packaging", statuses: ["Packaging"] },
    { status: "Ready For Pickup", statuses: ["Ready For Pickup", "Ready For Delivery", "Completed"] },
  ].map(({ status, statuses }) => ({
    status,
    meals: todayProductionOrders
      .filter((order) => statuses.includes(order.production_status))
      .reduce((sum, order) => sum + (Number(order.meal_count) || 0), 0),
  }));
  const nextAction =
    inventoryAlerts.some((item) => item.quantity <= 0)
      ? { label: "Receive Inventory", href: "/dashboard/miz-rita/inventory" }
      : productionProgress === 0
        ? { label: "Start Today's Production", href: "/dashboard/miz-rita/kitchen" }
        : todayProductionOrders.some((item) => item.production_status === "Packaging")
          ? { label: "Begin Packaging", href: "/dashboard/miz-rita/kitchen" }
          : productionProgress < 100
            ? { label: "Continue Kitchen Production", href: "/dashboard/miz-rita/kitchen" }
            : deliveriesRemaining
              ? { label: "Print Delivery List", href: "#delivery-queue" }
              : { label: "Close Today's Operations", href: "#close-day" };
  const workflow = [
    { label: "Orders Received", count: todayProductionOrders.filter((order) => order.production_status === "Waiting").length, progress: activeToday.length ? 100 : 0 },
    { label: "Kitchen Production", count: todayProductionOrders.filter((order) => ["Cooking", "Paused", "Stopped"].includes(order.production_status)).length, progress: productionProgress },
    { label: "Packaging", count: todayProductionOrders.filter((order) => ["Awaiting Packaging", "Packaging"].includes(order.production_status)).length, progress: todayProductionOrders.length ? Math.round(todayProductionOrders.filter((item) => ["Awaiting Packaging", "Packaging", "Ready For Pickup", "Ready For Delivery", "Completed"].includes(item.production_status)).length / todayProductionOrders.length * 100) : 0 },
    { label: "Ready For Pickup", count: todayProductionOrders.filter((order) => order.production_status === "Ready For Pickup").length, progress: todayProductionOrders.length ? Math.round(todayProductionOrders.filter((order) => ["Ready For Pickup", "Ready For Delivery", "Completed"].includes(order.production_status)).length / todayProductionOrders.length * 100) : 0 },
    { label: "Deliveries", count: todayProductionOrders.filter((order) => order.production_status === "Ready For Delivery").length, progress: deliveriesToday.length ? Math.round((deliveriesToday.length - deliveriesRemaining) / deliveriesToday.length * 100) : 0 },
    { label: "Completed", count: todayProductionOrders.filter((order) => order.production_status === "Completed").length, progress: activeToday.length ? Math.round(completedOrders.length / activeToday.length * 100) : 0 },
  ];
  const currentWorkflow = workflow.findIndex((stage) => stage.progress < 100);

  return (
    <>
      <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-xl md:p-8">
        <p className="text-center text-sm font-bold uppercase tracking-[0.25em] text-[#d6a817]">
          Daily Operations
        </p>
        <h1 className="mt-3 text-center text-4xl font-bold">Good Morning, Rita</h1>

        <div className="mt-2">
          <p className="text-center text-xl text-slate-300">Today&apos;s Overview</p>
  <div
  style={{
    width: "720px",
    maxWidth: "90%",
    margin: "20px auto 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    textAlign: "left",
  }}
>
  <div style={{ width: "320px" }} className="space-y-2">
    <p>• {activeToday.length} Orders</p>
    <p>• First Pickup: {firstPickup}</p>
    <p>• Estimated Kitchen Finish: {estimatedFinish}</p>
  </div>

  <div style={{ width: "220px" }} className="space-y-2">
    <p>• {mealsScheduled} Meals Scheduled</p>
    <p>• Inventory Alerts: {inventoryAlerts.length}</p>
  </div>
</div>

     </div>

        <div className="mx-auto mt-5 w-[90%] rounded-2xl bg-white p-4 text-[#081c35]">
          <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-[#9a7710]">
            Next Recommended Action
          </p>
          {nextAction.href === "#close-day" ? (
            <button
              onClick={onCloseDay}
              className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl bg-[#d6a817] px-5 py-3 text-center text-lg font-bold"
            >
              <span>▶</span>
              {nextAction.label}
            </button>
          ) : (
            <Link
              href={nextAction.href}
              className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl bg-[#d6a817] px-5 py-3 text-center text-lg font-bold"
            >
              <span>▶</span>
              {nextAction.label}
            </Link>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-bold text-[#081c35]">Today&apos;s Business Snapshot</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[
            ["Orders Today", activeToday.length],
            ["Meals Scheduled", mealsScheduled],
            ["Meals Completed", mealsCompleted],
            ["Meals Remaining", mealsRemaining],
            ["Revenue Today", formatMoney(revenueToday)],
            ["Food Cost", formatMoney(foodCost)],
            ["Deliveries Today", deliveriesToday.length],
            ["Ready for Pickup", readyForPickup],
            ["Out for Delivery", outForDelivery],
            ["Delivered Today", deliveredToday],
            ["Late Deliveries", lateDeliveries],
            ["Inventory Alerts", inventoryAlerts.length],
            ["Kitchen Progress", `${productionProgress}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[#081c35]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <Link
        href="/dashboard/miz-rita/kitchen"
        className={`mt-6 block rounded-3xl border-2 p-6 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl ${
          productionQueueSummary.overdueOrders > 0
            ? "border-red-300 bg-red-50"
            : productionQueueSummary.waitingOrders > 0
              ? "border-amber-300 bg-amber-50"
              : "border-emerald-300 bg-emerald-50"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Kitchen Backlog</p>
            <h2 className="mt-1 text-2xl font-bold text-[#081c35]">Production Queue</h2>
          </div>
          <span className="font-bold text-[#081c35]">View Kitchen →</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Waiting Orders", productionQueueSummary.waitingOrders],
            ["Total Meals Waiting", productionQueueSummary.mealsWaiting],
            ["Overdue Orders", productionQueueSummary.overdueOrders],
            ["Orders Currently Cooking", productionQueueSummary.cookingOrders],
            ["Orders Paused", productionQueueSummary.pausedOrders],
            ["Orders Packaging", productionQueueSummary.packagingOrders],
            ["Orders Ready For Pickup / Delivery", productionQueueSummary.readyOrders],
            ["Kitchen Progress", `${productionQueueSummary.progress}%`],
            ["Meals Remaining", productionQueueSummary.mealsRemaining],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-bold text-[#081c35]">{value}</p>
            </div>
          ))}
        </div>
        <p className={`mt-5 font-bold ${productionQueueSummary.overdueOrders > 0 ? "text-red-800" : productionQueueSummary.waitingOrders > 0 ? "text-amber-800" : "text-emerald-800"}`}>
          {productionQueueSummary.overdueOrders > 0
            ? `⚠️ ${productionQueueSummary.overdueOrders} overdue production order${productionQueueSummary.overdueOrders === 1 ? "" : "s"} require attention.`
            : productionQueueSummary.waitingOrders > 0
              ? `⚠️ ${productionQueueSummary.waitingOrders} production order${productionQueueSummary.waitingOrders === 1 ? "" : "s"} waiting.`
              : "🟢 Production Queue Clear"}
        </p>
        {(productionQueueSummary.pausedOrders > 0 || productionQueueSummary.overdueOrders > 0) && <p className="mt-2 font-semibold text-red-800">Production Alerts: {productionQueueSummary.pausedOrders} paused, {productionQueueSummary.overdueOrders} overdue.</p>}
      </Link>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-[#081c35]">Daily Workflow</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {workflow.map((stage, index) => {
            const complete = stage.progress === 100;
            const current = index === currentWorkflow;
            return (
              <div key={stage.label} className={`rounded-2xl border-2 p-4 ${complete ? "border-emerald-300 bg-emerald-50" : current ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                <p className={`text-sm font-bold ${complete ? "text-emerald-800" : current ? "text-blue-800" : "text-slate-600"}`}>{stage.label}</p>
                <p className="mt-2 text-2xl font-bold">{stage.count}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className={`h-full ${complete ? "bg-emerald-500" : current ? "bg-blue-600" : "bg-slate-300"}`} style={{ width: `${stage.progress}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">{complete ? "Complete" : current ? "In progress" : "Upcoming"} · {stage.progress}%</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-3xl bg-white p-6 shadow-lg xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Kitchen Production</p><h2 className="mt-1 text-2xl font-bold text-[#081c35]">Overall Production Progress</h2></div>
            <p className="text-4xl font-bold text-[#081c35]">{productionProgress}%</p>
          </div>
          <div className="mt-5 h-6 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${productionProgress}%` }} /></div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div><p className="text-sm text-slate-500">Meals Completed</p><p className="text-2xl font-bold">{mealsCompleted}</p></div>
            <div><p className="text-sm text-slate-500">Meals Remaining</p><p className="text-2xl font-bold">{mealsRemaining}</p></div>
            <div><p className="text-sm text-slate-500">Estimated Finish</p><p className="text-2xl font-bold">{estimatedFinish}</p></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {stationCounts.map(({ status, meals }) => (
              <span key={status} className={`rounded-full px-4 py-2 text-sm font-bold ${status === "Complete" ? "bg-emerald-100 text-emerald-800" : status === "Cooking" ? "bg-orange-100 text-orange-800" : status === "Packaging" ? "bg-purple-100 text-purple-800" : status === "Prep" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{status}: {meals}</span>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-bold text-[#081c35]">Inventory Alerts</h2>
          <div className="mt-4 space-y-3">
            {inventoryAlerts.length ? inventoryAlerts.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold">{item.name}</p>
                <div className="mt-2 flex justify-between text-sm"><span>Current: {item.quantity.toFixed(item.unit === "lb" ? 2 : 0)} {item.unit}</span><span>Minimum: {item.parLevel} {item.unit}</span></div>
                <div className="mt-3 flex items-center justify-between"><p className="font-bold text-amber-800">Need {Math.max(item.parLevel - item.quantity, 0).toFixed(item.unit === "lb" ? 2 : 0)} {item.unit}</p><Link href="/dashboard/miz-rita/inventory" className="rounded-lg bg-[#081c35] px-3 py-2 text-sm font-bold text-white">Order Now</Link></div>
              </div>
            )) : <p className="rounded-2xl bg-emerald-50 p-5 font-bold text-emerald-800">✓ All inventory levels are healthy.</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-[#081c35]">Orders Waiting</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500"><tr>{["Customer", "Meal Plan", "Meal Count", "Pickup or Delivery", "Pickup Time", "Status", "Ready"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
            <tbody>{orderDetails.filter((order) => !["Completed", "Cancelled"].includes(order.order_status)).slice(0, 8).map((order) => (
              <tr key={order.id} className="border-b border-slate-100">
                <td className="px-3 py-4 font-bold">{order.customerName}</td><td className="px-3 py-4">{order.details.mealPlan}</td><td className="px-3 py-4">{order.details.numberOfMeals}</td><td className="px-3 py-4">{order.delivery_method || "Pickup"}</td><td className="px-3 py-4">{order.details.pickupDeliveryTime}</td><td className="px-3 py-4"><StatusBadge value={order.order_status} /></td>
                <td className="px-3 py-4"><button disabled={normalizeWorkflowStatus(order.order_status) === "Ready For Pickup"} onClick={() => onReady(order.id)} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40">Ready For Pickup</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section id="delivery-queue" className="rounded-3xl bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-bold text-[#081c35]">Delivery Queue</h2>
          <div className="mt-4 space-y-3">{deliveryQueue.length ? deliveryQueue.map(({ delivery, order }) => (
            <div key={delivery.id} className="grid gap-2 rounded-2xl border p-4 sm:grid-cols-6 sm:items-center">
              <p className="font-bold">{order.customerName}</p><p className="text-sm">Driver: {delivery.driver_name || "Not Assigned"}</p><p className="text-sm">Scheduled: {delivery.scheduled_at ? formatDateTime(delivery.scheduled_at) : "Not scheduled"}</p><p className="text-sm">Delivery: {delivery.status}</p><StatusBadge value={delivery.status} />
              <button disabled={delivery.status === "Delivered"} onClick={() => onDeliveryComplete(order.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Delivered</button>
            </div>
          )) : <p className="rounded-2xl bg-slate-50 p-5 text-slate-500">No deliveries scheduled today.</p>}</div>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-bold text-[#081c35]">Production Alerts</h2>
          <div className="mt-4 space-y-3">
            {production.filter((item) => item.status === "Complete").slice(0, 3).map((item) => <p key={item.id} className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">✓ {item.name} finished cooking</p>)}
            {production.some((item) => item.status === "Packaging") && <p className="rounded-xl bg-purple-50 p-4 font-semibold text-purple-800">Packaging is in progress.</p>}
            {inventoryAlerts.length > 0 && <p className="rounded-xl bg-amber-50 p-4 font-semibold text-amber-800">{inventoryAlerts.length} inventory item{inventoryAlerts.length === 1 ? "" : "s"} need attention.</p>}
            {!production.length && <p className="rounded-xl bg-slate-50 p-4 text-slate-500">Save a Kitchen production plan to see live alerts.</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-[#081c35]">Today&apos;s Timeline</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["7:30 AM", "Kitchen Opened"],
            [productionProgress > 0 ? "8:00 AM" : "Next", productionProgress > 0 ? "Production Started" : "Start Production"],
            [production.some((item) => item.status === "Complete") ? "In progress" : "Upcoming", "Cooking & Packaging"],
            [completedOrders.length ? "Today" : "Upcoming", completedOrders.length ? "Orders Completed" : "Orders Ready"],
          ].map(([time, activity]) => <div key={activity} className="rounded-2xl border border-slate-200 p-4"><p className="text-sm font-bold text-[#d6a817]">{time}</p><p className="mt-1 font-bold">{activity}</p></div>)}
        </div>
      </section>

      <section className="mt-6 rounded-3xl bg-[#081c35] p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold">Quick Actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <Link href="/dashboard/miz-rita/kitchen" className="rounded-xl bg-[#d6a817] px-4 py-4 text-center font-bold text-[#081c35]">Start Production</Link>
          <Link href="/dashboard/miz-rita/kitchen" className="rounded-xl border border-white/20 px-4 py-4 text-center font-bold">Kitchen Calculator</Link>
          <Link href="/dashboard/miz-rita/inventory" className="rounded-xl border border-white/20 px-4 py-4 text-center font-bold">Inventory</Link>
          <a href="#orders-management" className="rounded-xl border border-white/20 px-4 py-4 text-center font-bold">Orders</a>
          <Link href="/dashboard/miz-rita/kitchen" className="rounded-xl border border-white/20 px-4 py-4 text-center font-bold">Print Kitchen Sheet</Link>
          <Link href="/dashboard/miz-rita/inventory" className="rounded-xl border border-white/20 px-4 py-4 text-center font-bold">Generate Purchase List</Link>
          <button onClick={() => window.print()} className="rounded-xl border border-white/20 px-4 py-4 font-bold">Print Delivery List</button>
          <a href="#reports" className="rounded-xl border border-white/20 px-4 py-4 text-center font-bold">Reports</a>
          <button id="close-day" onClick={onCloseDay} className="rounded-xl bg-emerald-600 px-4 py-4 font-bold sm:col-span-2 xl:col-span-1">Close Today&apos;s Operations</button>
        </div>
      </section>

      {showEndOfDay && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#020b16]/80 p-4 backdrop-blur-sm">
          <div className="mx-auto my-8 max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-emerald-600 p-7 text-center text-white"><CheckCircle2 className="mx-auto h-14 w-14" /><h2 className="mt-3 text-4xl font-bold">Excellent Work!</h2><p className="mt-2 text-lg">Today&apos;s kitchen operations are complete.</p></div>
            <div className="p-7"><h3 className="text-2xl font-bold text-[#081c35]">Today&apos;s Results</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
                ["Orders Completed", completedOrders.length], ["Meals Produced", mealsCompleted], ["Meals Delivered", deliveredToday], ["Revenue", formatMoney(revenueToday)], ["Food Cost", formatMoney(foodCost)], ["Food Waste", "Tracked in Inventory"], ["Inventory Alerts", inventoryAlerts.length], ["Labor Hours", "Not tracked yet"],
              ].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}</div>
              <div className="mt-6 flex flex-wrap justify-end gap-2"><button onClick={() => window.print()} className="rounded-xl border px-5 py-3 font-bold"><Printer className="mr-2 inline h-4 w-4" />Print Summary</button><button onClick={onReturn} className="rounded-xl bg-[#081c35] px-5 py-3 font-bold text-white">Return To Dashboard</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OrderDetailsModal({
  order,
  customer,
  customerName,
  updating,
  workflowEvents,
  onClose,
  onAdvance,
  onMarkCompleted,
  onDuplicate,
  onDelete,
}: {
  order: Order;
  customer: Customer | null;
  customerName: string;
  updating: boolean;
  workflowEvents: OrderWorkflowEvent[];
  onClose: () => void;
  onAdvance: () => Promise<void>;
  onMarkCompleted: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const orderDetails = parseOrderDetails(order.notes, order.meal_count);
  const currentWorkflowStatus = normalizeWorkflowStatus(order.order_status);
  const nextWorkflowStatus = getNextWorkflowStatus(
    currentWorkflowStatus,
    order.delivery_method,
  );
  const deliveryAddress =
    order.notes?.match(/^Delivery Address:\s*(.+)$/im)?.[1]?.trim() ||
    "Not provided";
  const assignedDriver =
    order.notes?.match(/^Assigned Driver:\s*(.+)$/im)?.[1]?.trim() ||
    "Not assigned";
  const currentIndex = ORDER_WORKFLOW.indexOf(currentWorkflowStatus);

  const printOrder = (documentType: "invoice" | "packing-slip") => {
    const title =
      documentType === "invoice" ? "Customer Invoice" : "Kitchen Packing Slip";

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      return;
    }

    const notes = escapeHtml(orderDetails.freeformNotes);
    const customer = escapeHtml(customerName);
    const orderNumber = escapeHtml(order.order_number);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${title} - ${orderNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #081c35;
              margin: 40px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 3px solid #d6a817;
              padding-bottom: 18px;
              margin-bottom: 24px;
            }
            .brand {
              font-size: 24px;
              font-weight: 800;
            }
            .muted {
              color: #64748b;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
              margin: 24px 0;
            }
            .card {
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              padding: 16px;
            }
            .label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 6px;
            }
            .value {
              font-size: 16px;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 24px;
            }
            th, td {
              border-bottom: 1px solid #cbd5e1;
              padding: 12px;
              text-align: left;
            }
            th {
              background: #f8fafc;
            }
            .total {
              font-size: 20px;
              font-weight: 800;
            }
            .notes {
              margin-top: 24px;
              white-space: pre-wrap;
            }
            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">Miz Rita's Kitchen</div>
              <div class="muted">${title}</div>
            </div>
            <div>
              <div class="label">Order Number</div>
              <div class="value">${orderNumber}</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="label">Customer</div>
              <div class="value">${customer}</div>
            </div>
            <div class="card">
              <div class="label">Order Date</div>
              <div class="value">${formatDate(order.order_date)}</div>
            </div>
            <div class="card">
              <div class="label">Fulfillment Date</div>
              <div class="value">${
                order.fulfillment_date
                  ? formatDate(order.fulfillment_date)
                  : "Not scheduled"
              }</div>
            </div>
            <div class="card">
              <div class="label">Delivery Method</div>
              <div class="value">${escapeHtml(
                order.delivery_method || "Pickup",
              )}</div>
            </div>
            <div class="card">
              <div class="label">Meal Plan Purchased</div>
              <div class="value">${escapeHtml(orderDetails.mealPlan)}</div>
            </div>
            <div class="card">
              <div class="label">Number of Meals</div>
              <div class="value">${escapeHtml(orderDetails.numberOfMeals)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Meal-prep order</td>
                <td>${escapeHtml(order.order_status)}</td>
                <td>${formatMoney(Number(order.total || 0))}</td>
              </tr>
              ${
                documentType === "invoice"
                  ? `
                    <tr>
                      <td colspan="2"><strong>Amount Paid</strong></td>
                      <td>${formatMoney(Number(order.amount_paid || 0))}</td>
                    </tr>
                    <tr>
                      <td colspan="2"><strong>Balance Due</strong></td>
                      <td class="total">${formatMoney(
                        Number(order.balance_due || 0),
                      )}</td>
                    </tr>
                  `
                  : ""
              }
            </tbody>
          </table>

          <div class="notes">
            <div class="label">Order Notes</div>
            <div>${notes}</div>
          </div>

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/60">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-[#f1f4f8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
              Order Details
            </p>

            <h2 className="mt-1 text-2xl font-bold text-[#081c35]">
              {order.order_number}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={updating}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close order details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-lg">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-slate-300">Customer</p>
                <p className="mt-1 text-xl font-bold">{customerName}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge value={order.order_status} />
                  <StatusBadge value={order.payment_status} />
                </div>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-sm text-slate-300">Order Total</p>
                <p className="mt-1 text-3xl font-bold">
                  {formatMoney(Number(order.total || 0))}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-[#081c35]">Order Workflow</h3>
              <OrderWorkflowBadge status={currentWorkflowStatus} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {ORDER_WORKFLOW.map((status, index) => (
                <div key={status} className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      index < currentIndex
                        ? "bg-emerald-100 text-emerald-800"
                        : index === currentIndex
                          ? getWorkflowBadgeClass(status)
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {status}
                  </span>
                  {index < ORDER_WORKFLOW.length - 1 ? (
                    <span className="text-slate-300">→</span>
                  ) : null}
                </div>
              ))}
            </div>
            {nextWorkflowStatus ? (
              <button
                type="button"
                onClick={() => void onAdvance()}
                disabled={updating}
                className="mt-5 w-full rounded-xl bg-[#081c35] px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {updating ? "Updating..." : `Move to ${nextWorkflowStatus}`}
              </button>
            ) : null}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <OrderInfoCard label="Phone" value={customer?.phone ? formatPhoneNumber(customer.phone) : "Not provided"} />
            <OrderInfoCard label="Email" value={customer?.email || "Not provided"} />
            <OrderInfoCard
              label="Order Date"
              value={formatDate(order.order_date)}
            />
            <OrderInfoCard
              label="Fulfillment Date"
              value={
                order.fulfillment_date
                  ? formatDate(order.fulfillment_date)
                  : "Not scheduled"
              }
            />
            <OrderInfoCard
              label="Delivery Method"
              value={order.delivery_method || "Pickup"}
            />
            <OrderInfoCard label="Delivery Address" value={deliveryAddress} />
            <OrderInfoCard label="Assigned Driver" value={assignedDriver} />
            <OrderInfoCard
              label="Meal Plan Purchased"
              value={orderDetails.mealPlan}
            />
            <OrderInfoCard
              label="Number of Meals"
              value={orderDetails.numberOfMeals}
            />
            <OrderInfoCard
              label="Pickup/Delivery Date"
              value={
                order.fulfillment_date
                  ? formatDate(order.fulfillment_date)
                  : orderDetails.pickupDeliveryDate
              }
            />
            <OrderInfoCard
              label="Pickup/Delivery Time"
              value={orderDetails.pickupDeliveryTime}
            />
            <OrderInfoCard
              label="Balance Due"
              value={formatMoney(Number(order.balance_due || 0))}
              emphasize={Number(order.balance_due || 0) > 0}
            />
            <OrderInfoCard label="Payment Status" value={order.payment_status} />
            <OrderInfoCard label="Kitchen Status" value={getDepartmentStatus(currentWorkflowStatus, "Kitchen")} />
            <OrderInfoCard label="Packaging Status" value={getDepartmentStatus(currentWorkflowStatus, "Packaging")} />
            <OrderInfoCard label="Delivery Status" value={getDepartmentStatus(currentWorkflowStatus, "Delivery")} />
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">
              Payment Summary
            </h3>

            <div className="mt-5 space-y-3">
              <PaymentLine
                label="Subtotal"
                value={Number(order.subtotal || 0)}
              />
              <PaymentLine
                label="Delivery Fee"
                value={Number(order.delivery_fee || 0)}
              />
              <PaymentLine
                label="Discount"
                value={-Number(order.discount || 0)}
              />
              <PaymentLine
                label="Amount Paid"
                value={-Number(order.amount_paid || 0)}
              />

              <div className="border-t border-slate-200 pt-3">
                <PaymentLine
                  label="Balance Due"
                  value={Number(order.balance_due || 0)}
                  bold
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">Internal Notes</h3>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {orderDetails.freeformNotes}
            </p>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">Timeline</h3>
            <div className="mt-5 space-y-4">
              {(workflowEvents.length
                ? workflowEvents
                : [{
                    id: `${order.id}-created`,
                    status: normalizeWorkflowStatus(order.order_status),
                    label: "Order Created",
                    createdAt: `${order.order_date}T09:00:00`,
                  }]
              ).map((event, index) => (
                <div key={event.id} className="grid grid-cols-[72px_12px_1fr] items-start gap-3">
                  <p className="text-xs font-bold text-slate-500">
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(event.createdAt))}
                  </p>
                  <div className="relative mt-1">
                    <span className="block h-3 w-3 rounded-full bg-[#d6a817]" />
                    {index < workflowEvents.length - 1 ? (
                      <span className="absolute left-[5px] top-3 h-7 w-px bg-slate-200" />
                    ) : null}
                  </div>
                  <div>
                    <p className="font-bold text-[#081c35]">{event.label}</p>
                    <p className="text-xs text-slate-500">{event.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">Order Actions</h3>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => printOrder("invoice")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-[#081c35] hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Print Invoice
              </button>

              <button
                type="button"
                onClick={() => printOrder("packing-slip")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-[#081c35] hover:bg-slate-50"
              >
                <FileText className="h-4 w-4" />
                Packing Slip
              </button>

              <button
                type="button"
                onClick={() => void onDuplicate()}
                disabled={updating}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-[#081c35] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {updating ? "Working..." : "Duplicate Order"}
              </button>

              <button
                type="button"
                onClick={() => void onMarkCompleted()}
                disabled={updating || order.order_status === "Completed"}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {order.order_status === "Completed"
                  ? "Order Completed"
                  : updating
                    ? "Updating..."
                    : "Mark Completed"}
              </button>

              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={updating}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
              >
                <Trash2 className="h-4 w-4" />
                {updating ? "Working..." : "Delete Order"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function OrderInfoCard({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 text-lg font-bold ${
          emphasize ? "text-red-700" : "text-[#081c35]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PaymentLine({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={bold ? "font-bold text-[#081c35]" : "text-sm text-slate-600"}
      >
        {label}
      </span>
      <span
        className={
          bold
            ? "text-lg font-bold text-[#081c35]"
            : "text-sm font-semibold text-[#081c35]"
        }
      >
        {formatMoney(value)}
      </span>
    </div>
  );
}

function formatPhoneNumber(value: string | null | undefined) {
  if (!value) return "Not provided";

  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function CustomerDetailsModal({
  businessId,
  customer,
  orders,
  onClose,
  onCreateOrder,
  onOrderUpdated,
}: {
  businessId: string;
  customer: Customer;
  orders: Order[];
  onClose: () => void;
  onCreateOrder: (repeatOrder?: Order) => void;
  onOrderUpdated: (updatedOrder: Order) => void;
}) {
  const [crmNotes, setCrmNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [customerTags, setCustomerTags] = useState<CustomerTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsError, setTagsError] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editingSubscription, setEditingSubscription] = useState(false);
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [paymentSavingId, setPaymentSavingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCrmNotes() {
      setNotesLoading(true);
      setNotesError("");
      setNotesSaved(false);

      const { data, error } = await supabase
        .from("gbgs_customer_crm_notes")
        .select("notes, updated_at")
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        setNotesError("Could not load CRM notes.");
        setCrmNotes("");
        setNotesUpdatedAt(null);
      } else {
        setCrmNotes(data?.notes || "");
        setNotesUpdatedAt(data?.updated_at || null);
      }

      setNotesLoading(false);
    }

    loadCrmNotes();

    return () => {
      isMounted = false;
    };
  }, [customer.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadCustomerTags() {
      setTagsLoading(true);
      setTagsError("");

      const { data, error } = await supabase
        .from("gbgs_customer_tags")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setTagsError("Could not load customer tags. Run the updated SQL file.");
        setCustomerTags([]);
      } else {
        setCustomerTags((data ?? []) as CustomerTag[]);
      }

      setTagsLoading(false);
    }

    void loadCustomerTags();

    return () => {
      isMounted = false;
    };
  }, [customer.id]);

  async function addCustomerTag(tagValue: string) {
    const tag = tagValue.trim();
    if (!tag || tagsSaving) return;

    if (customerTags.some((item) => item.tag.toLowerCase() === tag.toLowerCase())) {
      setCustomTag("");
      return;
    }

    setTagsSaving(true);
    setTagsError("");

    const { data, error } = await supabase
      .from("gbgs_customer_tags")
      .insert({
        business_id: businessId,
        customer_id: customer.id,
        tag,
      })
      .select("*")
      .single();

    if (error) {
      setTagsError("Tag was not saved. Run the updated SQL file first.");
    } else if (data) {
      setCustomerTags((current) => [...current, data as CustomerTag]);
      setCustomTag("");
    }

    setTagsSaving(false);
  }

  async function removeCustomerTag(tagId: string) {
    setTagsSaving(true);
    setTagsError("");

    const { error } = await supabase
      .from("gbgs_customer_tags")
      .delete()
      .eq("id", tagId);

    if (error) {
      setTagsError("Tag could not be removed.");
    } else {
      setCustomerTags((current) => current.filter((item) => item.id !== tagId));
    }

    setTagsSaving(false);
  }

  async function saveCrmNotes() {
    setNotesSaving(true);
    setNotesError("");
    setNotesSaved(false);

    const now = new Date().toISOString();
    const { error } = await supabase.from("gbgs_customer_crm_notes").upsert(
      {
        customer_id: customer.id,
        notes: crmNotes.trim(),
        updated_at: now,
      },
      { onConflict: "customer_id" },
    );

    if (error) {
      setNotesError("Notes were not saved. Run the included Supabase SQL file first.");
    } else {
      setNotesUpdatedAt(now);
      setNotesSaved(true);
      window.setTimeout(() => setNotesSaved(false), 1800);
    }

    setNotesSaving(false);
  }

  const totalSpent = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );

  const balanceDue = orders.reduce(
    (sum, order) => sum + Number(order.balance_due || 0),
    0,
  );

  const completedOrders = orders.filter(
    (order) => order.order_status === "Completed",
  ).length;

  const averageOrderValue = orders.length > 0 ? totalSpent / orders.length : 0;

  const totalMealsPurchased = orders.reduce((sum, order) => {
    const details = parseOrderDetails(order.notes, order.meal_count);
    const meals = Number(details.numberOfMeals);
    return sum + (Number.isFinite(meals) ? meals : 0);
  }, 0);

  const customerSince = customer.created_at
    ? formatDate(customer.created_at.slice(0, 10))
    : "Unknown";

  const sortedOrders = [...orders].sort((a, b) =>
    b.order_date.localeCompare(a.order_date),
  );

  const lastOrder = sortedOrders[0] || null;
  const lastDelivery = sortedOrders.find(
    (order) =>
      (order.delivery_method ?? "").toLowerCase().includes("delivery") &&
      ["Delivered", "Completed"].includes(normalizeWorkflowStatus(order.order_status)),
  );

  const favoriteMeals = Object.entries(
    orders.reduce<Record<string, number>>((counts, order) => {
      const mealPlan = parseOrderDetails(order.notes, order.meal_count).mealPlan;

      if (mealPlan !== "Not specified") {
        counts[mealPlan] = (counts[mealPlan] || 0) + 1;
      }

      return counts;
    }, {}),
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const paymentHistory = sortedOrders.filter(
    (order) => Number(order.amount_paid || 0) > 0,
  );


  const subscriptionTag = customerTags.find((item) =>
    ["weekly", "bi-weekly", "monthly"].includes(item.tag.toLowerCase()),
  );
  const pausedTag = customerTags.find((item) => item.tag.toLowerCase() === "subscription paused");
  const cancelledTag = customerTags.find((item) => item.tag.toLowerCase() === "subscription cancelled");
  const subscriptionPlan = subscriptionTag?.tag || "Not Enrolled";
  const subscriptionStatus = cancelledTag ? "Cancelled" : pausedTag ? "Paused" : subscriptionTag ? "Active" : "Inactive";
  const subscriptionActive = subscriptionStatus === "Active";
  const latestOrderDetails = lastOrder ? parseOrderDetails(lastOrder.notes, lastOrder.meal_count) : null;
  const subscriptionMeals = latestOrderDetails?.numberOfMeals || "Not set";
  const subscriptionDelivery = lastOrder?.delivery_method || "Not set";
  const subscriptionDay = lastOrder?.fulfillment_date
    ? new Date(`${lastOrder.fulfillment_date}T12:00:00`).toLocaleDateString(
        undefined,
        { weekday: "long" },
      )
    : "Not scheduled";

  async function setSubscriptionPlan(plan: "Weekly" | "Bi-Weekly" | "Monthly") {
    setSubscriptionSaving(true);
    setTagsError("");
    const planTags = customerTags.filter((item) =>
      ["weekly", "bi-weekly", "monthly"].includes(item.tag.toLowerCase()),
    );
    if (planTags.length) {
      const { error } = await supabase.from("gbgs_customer_tags").delete().in("id", planTags.map((item) => item.id));
      if (error) {
        setTagsError("Subscription plan could not be updated.");
        setSubscriptionSaving(false);
        return;
      }
    }
    const statusTags = customerTags.filter((item) =>
      ["subscription paused", "subscription cancelled"].includes(item.tag.toLowerCase()),
    );
    if (statusTags.length) {
      await supabase.from("gbgs_customer_tags").delete().in("id", statusTags.map((item) => item.id));
    }
    const { data, error } = await supabase.from("gbgs_customer_tags").insert({
      business_id: businessId,
      customer_id: customer.id,
      tag: plan,
    }).select("*").single();
    if (error || !data) {
      setTagsError("Subscription plan could not be updated.");
    } else {
      setCustomerTags((current) => [
        ...current.filter((item) => !["weekly", "bi-weekly", "monthly", "subscription paused", "subscription cancelled"].includes(item.tag.toLowerCase())),
        data as CustomerTag,
      ]);
      setEditingSubscription(false);
    }
    setSubscriptionSaving(false);
  }

  async function setSubscriptionStatus(status: "Active" | "Paused" | "Cancelled") {
    if (!subscriptionTag && status !== "Cancelled") return;
    setSubscriptionSaving(true);
    setTagsError("");
    const statusTags = customerTags.filter((item) =>
      ["subscription paused", "subscription cancelled"].includes(item.tag.toLowerCase()),
    );
    if (statusTags.length) {
      const { error } = await supabase.from("gbgs_customer_tags").delete().in("id", statusTags.map((item) => item.id));
      if (error) {
        setTagsError("Subscription status could not be updated.");
        setSubscriptionSaving(false);
        return;
      }
    }
    let created: CustomerTag | null = null;
    if (status !== "Active") {
      const { data, error } = await supabase.from("gbgs_customer_tags").insert({
        business_id: businessId,
        customer_id: customer.id,
        tag: `Subscription ${status}`,
      }).select("*").single();
      if (error || !data) {
        setTagsError("Subscription status could not be updated.");
        setSubscriptionSaving(false);
        return;
      }
      created = data as CustomerTag;
    }
    setCustomerTags((current) => {
      const cleaned = current.filter((item) => !["subscription paused", "subscription cancelled"].includes(item.tag.toLowerCase()));
      return created ? [...cleaned, created] : cleaned;
    });
    setSubscriptionSaving(false);
  }

  async function setOrderPayment(order: Order, paid: boolean) {
    setPaymentSavingId(order.id);
    const { error: statusError } = await supabase.rpc("gbgs_set_order_payment_status", {
      p_business_id: businessId,
      p_order_id: order.id,
      p_payment_status: paid ? "Paid" : "Unpaid",
    });
    if (statusError) {
      window.alert(statusError.message);
      setPaymentSavingId(null);
      return;
    }
    const { data, error } = await supabase.from("gbgs_orders").select("*").eq("id", order.id).single();
    if (error || !data) {
      window.alert(error?.message || "Payment status could not be updated.");
    } else {
      onOrderUpdated(data as Order);
    }
    setPaymentSavingId(null);
  }

  function printCustomerOrder(order: Order) {
    const details = parseOrderDetails(order.notes, order.meal_count);
    const printWindow = window.open("", "_blank", "width=1000,height=900");
    if (!printWindow) return;

    const total = Number(order.total || 0);
    const amountPaid = Number(order.amount_paid || 0);
    const balanceDue = Number(order.balance_due || 0);
    const isPaid =
      String(order.payment_status || "").toLowerCase() === "paid" ||
      balanceDue <= 0;
    const logoUrl = `${window.location.origin}/miz-ritas-logo.png`;
    const receiptNumber = `RC-${String(order.order_number || "").replace(
      /[^a-zA-Z0-9]/g,
      "",
    )}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt ${escapeHtml(order.order_number)}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 28px;
              background: #f4efe7;
              color: #172033;
              font-family: Arial, Helvetica, sans-serif;
            }
            .receipt {
              position: relative;
              max-width: 900px;
              margin: 0 auto;
              overflow: hidden;
              background: #fffdf8;
              border: 1px solid #e7ddcf;
              box-shadow: 0 18px 50px rgba(34, 26, 18, .14);
              padding: 34px;
            }
            .watermark {
              position: absolute;
              left: 50%;
              top: 52%;
              width: 520px;
              transform: translate(-50%, -50%);
              opacity: .035;
              pointer-events: none;
            }
            .content { position: relative; z-index: 1; }
            .header {
              display: grid;
              grid-template-columns: 1.1fr 1fr .9fr;
              gap: 24px;
              align-items: start;
            }
            .logo {
              display: block;
              width: 340px;
              max-width: none;
              height: auto;
              object-fit: contain;
              object-position: center;
            }
            .business-name, .receipt-title {
              margin: 10px 0 5px;
              color: #a41118;
              font-size: 20px;
              font-weight: 900;
              letter-spacing: .02em;
            }
            .receipt-title {
              margin-top: 5px;
              font-size: 38px;
            }
            .tagline {
              color: #485526;
              font-size: 13px;
              font-weight: 700;
            }
            .contact {
              margin-top: 18px;
              font-size: 12px;
              line-height: 1.8;
            }
            .receipt-meta {
              margin-top: 18px;
              border-top: 2px solid #b99f7b;
              padding-top: 13px;
            }
            .meta-row, .total-row {
              display: flex;
              justify-content: space-between;
              gap: 18px;
              padding: 5px 0;
              font-size: 12px;
            }
            .meta-row strong { text-transform: uppercase; }
            .paid { color: #3b7b2b; font-weight: 900; }
            .unpaid { color: #a41118; font-weight: 900; }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1.35fr;
              gap: 16px;
              margin-top: 24px;
            }
            .box {
              min-height: 155px;
              border: 1px solid #eadcca;
              border-radius: 12px;
              padding: 18px;
              background: rgba(255,255,255,.78);
            }
            .box-title {
              margin-bottom: 16px;
              color: #a41118;
              font-size: 12px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .customer-name {
              font-size: 16px;
              font-weight: 900;
              margin-bottom: 12px;
            }
            .line { margin: 6px 0; font-size: 12px; }
            table {
              width: 100%;
              margin-top: 18px;
              border-collapse: separate;
              border-spacing: 0;
              overflow: hidden;
              border: 1px solid #e5dccd;
              border-radius: 11px;
              background: rgba(255,255,255,.78);
            }
            th {
              background: #4c5626;
              color: white;
              padding: 12px;
              font-size: 11px;
              text-align: left;
              text-transform: uppercase;
            }
            td {
              padding: 15px 12px;
              font-size: 12px;
              border-bottom: 1px solid #ebe5dc;
            }
            tr:last-child td { border-bottom: 0; }
            th:nth-child(1), td:nth-child(1) { width: 70px; text-align: center; }
            th:nth-child(3), td:nth-child(3),
            th:nth-child(4), td:nth-child(4) { text-align: right; width: 130px; }
            .bottom-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: 18px;
            }
            .thanks {
              min-height: 210px;
              border: 1px solid #eadcca;
              border-radius: 12px;
              padding: 20px;
              background: rgba(255,255,255,.76);
            }
            .thanks h3 {
              margin: 0 0 22px;
              color: #a41118;
              font-size: 16px;
            }
            .signature {
              margin-top: 18px;
              color: #485526;
              font-family: Georgia, serif;
              font-size: 20px;
              font-style: italic;
            }
            .totals {
              overflow: hidden;
              border: 1px solid #eadcca;
              border-radius: 12px;
              background: rgba(255,255,255,.82);
            }
            .totals-inner { padding: 16px 20px 8px; }
            .total-row { font-size: 13px; }
            .grand-total {
              margin-top: 8px;
              padding-top: 12px;
              border-top: 1px solid #cdbfa9;
              font-size: 19px;
              font-weight: 900;
            }
            .grand-total span:last-child { color: #a41118; }
            .amount-paid {
              background: #eef1e7;
              color: #4c5626;
              font-size: 17px;
              font-weight: 900;
              padding: 13px 20px;
            }
            .balance {
              background: #a41118;
              color: white;
              font-size: 17px;
              font-weight: 900;
              padding: 13px 20px;
            }
            .footer {
              margin-top: 22px;
              border: 1px dashed #d9cbb7;
              border-radius: 12px;
              padding: 18px;
              text-align: center;
              background: rgba(255,255,255,.8);
            }
            .footer-title {
              color: #a41118;
              font-size: 12px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .footer-info {
              margin-top: 12px;
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
              gap: 22px;
              color: #485526;
              font-size: 12px;
            }
            .footer-tagline {
              margin-top: 22px;
              color: #a41118;
              font-weight: 800;
            }
            .actions {
              max-width: 900px;
              margin: 0 auto 14px;
              display: flex;
              justify-content: flex-end;
              gap: 10px;
            }
            button {
              border: 0;
              border-radius: 9px;
              background: #081c35;
              color: white;
              padding: 11px 18px;
              font-size: 13px;
              font-weight: 800;
              cursor: pointer;
            }
            @media (max-width: 760px) {
              body { padding: 0; background: white; }
              .receipt { padding: 20px; box-shadow: none; }
              .header, .info-grid, .bottom-grid { grid-template-columns: 1fr; }
              .logo { margin: 0 auto; }
              .actions { padding: 12px; }
            }
            @media print {
              @page { size: letter; margin: .28in; }
              body { padding: 0; background: white; }
              .actions { display: none; }
              .receipt {
                max-width: none;
                border: 0;
                box-shadow: none;
                padding: 12px;
              }
              .header { gap: 14px; }
              .logo { width: 190px; height: 155px; }
              .box { min-height: 132px; }
              .thanks { min-height: 175px; }
            }
          </style>
        </head>
        <body>
          <div class="actions">
            <button onclick="window.print()">Print Receipt</button>
          </div>

          <main class="receipt">
            <img class="watermark" src="${logoUrl}" alt="" />
            <div class="content">
              <header class="header">
                <div>
                  <img class="logo" src="${logoUrl}" alt="Miz Rita's Kitchen logo" />
                </div>

                <div>
                  <div class="business-name">MIZ RITA'S KITCHEN</div>
                  <div class="tagline">Healthy Meals. Made with Love.</div>
                  <div class="contact">
                    <div>Atlanta, Georgia</div>
                    <div>${escapeHtml(customer.phone || "Phone available upon request")}</div>
                    <div>Miz Rita's Kitchen Meal Preps</div>
                  </div>
                </div>

                <div>
                  <div class="receipt-title">RECEIPT</div>
                  <div class="tagline">Thank you for your order!</div>
                  <div class="receipt-meta">
                    <div class="meta-row"><strong>Receipt #</strong><span>${escapeHtml(receiptNumber)}</span></div>
                    <div class="meta-row"><strong>Date</strong><span>${escapeHtml(formatDate(order.order_date))}</span></div>
                    <div class="meta-row"><strong>Payment Method</strong><span>${escapeHtml(order.payment_method || "Not recorded")}</span></div>
                    <div class="meta-row"><strong>Status</strong><span class="${isPaid ? "paid" : "unpaid"}">${isPaid ? "Paid" : "Unpaid"}</span></div>
                  </div>
                </div>
              </header>

              <section class="info-grid">
                <div class="box">
                  <div class="box-title">Bill To</div>
                  <div class="customer-name">${escapeHtml(customerName)}</div>
                  <div class="line">${escapeHtml(customer.phone || "No phone recorded")}</div>
                  <div class="line">${escapeHtml(customer.email || "No email recorded")}</div>
                </div>

                <div class="box">
                  <div class="box-title">Order Information</div>
                  <div class="meta-row"><strong>Order #</strong><span>${escapeHtml(order.order_number)}</span></div>
                  <div class="meta-row"><strong>Order Date</strong><span>${escapeHtml(formatDate(order.order_date))}</span></div>
                  <div class="meta-row"><strong>Fulfillment Date</strong><span>${escapeHtml(order.fulfillment_date ? formatDate(order.fulfillment_date) : "Not scheduled")}</span></div>
                  <div class="meta-row"><strong>Service Type</strong><span>${escapeHtml(order.delivery_method || "Pickup")}</span></div>
                  <div class="meta-row"><strong>Order Status</strong><span>${escapeHtml(order.order_status || "Pending")}</span></div>
                </div>
              </section>

              <table>
                <thead>
                  <tr>
                    <th>Qty</th>
                    <th>Meal / Plan</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${escapeHtml(details.numberOfMeals)}</td>
                    <td>${escapeHtml(details.mealPlan)}</td>
                    <td>${escapeHtml(formatMoney(total / Math.max(Number(details.numberOfMeals) || 1, 1)))}</td>
                    <td>${escapeHtml(formatMoney(total))}</td>
                  </tr>
                </tbody>
              </table>

              <section class="bottom-grid">
                <div class="thanks">
                  <h3>♡ &nbsp; THANK YOU!</h3>
                  <div>We appreciate your business and your commitment to eating healthy!</div>
                  <div class="signature">Miz Rita's Kitchen Team ♥</div>
                  ${
                    details.freeformNotes
                      ? `<div class="line" style="margin-top:18px"><strong>Order Notes:</strong> ${escapeHtml(details.freeformNotes)}</div>`
                      : ""
                  }
                </div>

                <div class="totals">
                  <div class="totals-inner">
                    <div class="total-row"><strong>Subtotal</strong><span>${escapeHtml(formatMoney(total))}</span></div>
                    <div class="total-row"><strong>Discount</strong><span>${escapeHtml(formatMoney(0))}</span></div>
                    <div class="total-row"><strong>Tax</strong><span>${escapeHtml(formatMoney(0))}</span></div>
                    <div class="total-row grand-total"><span>TOTAL</span><span>${escapeHtml(formatMoney(total))}</span></div>
                  </div>
                  <div class="total-row amount-paid"><span>AMOUNT PAID</span><span>${escapeHtml(formatMoney(amountPaid))}</span></div>
                  <div class="total-row balance"><span>BALANCE DUE</span><span>${escapeHtml(formatMoney(balanceDue))}</span></div>
                </div>
              </section>

              <footer class="footer">
                <div class="footer-title">Stay Connected</div>
                <div class="footer-info">
                  <span>Miz Rita's Kitchen</span>
                  <span>Healthy meal-prep service</span>
                  <span>Thank you for supporting our business</span>
                </div>
                <div class="footer-tagline">Healthy Meals. Made with Love. ♥</div>
              </footer>
            </div>
          </main>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  const phoneDigits = (customer.phone || "").replace(/\D/g, "");
  const customerName =
    `${customer.first_name} ${customer.last_name ?? ""}`.trim();

  function printCustomerSummary() {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    const orderRows = sortedOrders
      .map(
        (order) => `
          <tr>
            <td>${escapeHtml(order.order_number)}</td>
            <td>${escapeHtml(formatDate(order.order_date))}</td>
            <td>${escapeHtml(order.order_status)}</td>
            <td>${escapeHtml(formatMoney(Number(order.total || 0)))}</td>
          </tr>`,
      )
      .join("");
    const dietaryRows = dietaryProfileFields(parseDietaryProfile(customer.dietary_notes))
      .filter(([, value]) => value)
      .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong><br />${escapeHtml(value).replace(/\n/g, "<br />")}</p>`)
      .join("") || "<p>None</p>";

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(customerName)} - Customer Summary</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #081c35; }
            h1 { margin-bottom: 4px; }
            .muted { color: #64748b; }
            .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
            .card { border: 1px solid #dbe3ec; border-radius: 12px; padding: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(customerName)}</h1>
          <p class="muted">${escapeHtml(formatPhoneNumber(customer.phone))} · ${escapeHtml(customer.email || "No email")}</p>
          <div class="stats">
            <div class="card"><strong>Total Orders</strong><br />${orders.length}</div>
            <div class="card"><strong>Lifetime Value</strong><br />${escapeHtml(formatMoney(totalSpent))}</div>
            <div class="card"><strong>Balance Due</strong><br />${escapeHtml(formatMoney(balanceDue))}</div>
          </div>
          <h2>Dietary Notes</h2>
          ${dietaryRows}
          <h2>Internal CRM Notes</h2>
          <p>${escapeHtml(crmNotes || "No internal notes recorded.")}</p>
          <h2>Order History</h2>
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>${orderRows || '<tr><td colspan="4">No orders recorded.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const activityItems = [
    ...sortedOrders.map((order) => ({
      id: `order-${order.id}`,
      title: `Order ${order.order_number}`,
      detail: `${order.order_status} · ${formatMoney(Number(order.total || 0))}`,
      date: order.created_at || order.order_date,
    })),
    ...paymentHistory.map((order) => ({
      id: `payment-${order.id}`,
      title: "Payment recorded",
      detail: `${order.order_number} · ${formatMoney(Number(order.amount_paid || 0))}`,
      date: order.created_at || order.order_date,
    })),
    ...(notesUpdatedAt
      ? [{
          id: "crm-notes",
          title: "CRM notes updated",
          detail: "Internal customer notes were saved.",
          date: notesUpdatedAt,
        }]
      : []),
    ...(customer.created_at
      ? [{
          id: "customer-created",
          title: "Customer added",
          detail: `${customerName} was added to the CRM.`,
          date: customer.created_at,
        }]
      : []),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-[#f1f4f8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
              Customer CRM
            </p>

            <h2 className="mt-1 text-2xl font-bold text-[#081c35]">
              {customer.first_name} {customer.last_name ?? ""}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close customer profile"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-lg">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d6a817] text-[#081c35]">
                  <UserRound className="h-7 w-7" />
                </div>

                <div>
                  <p className="text-lg font-bold">
                    {customer.first_name} {customer.last_name ?? ""}
                  </p>

                  <div className="mt-2">
                    <StatusBadge value={customer.customer_status} />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCreateOrder()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35]"
              >
                <Plus className="h-4 w-4" />
                Create Order
              </button>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#d6a817] p-3 text-[#081c35]">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#081c35]">Customer Tags</h3>
                  <p className="text-sm text-slate-500">Mark customer type, plan, and important preferences.</p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {customerTags.length} tag{customerTags.length === 1 ? "" : "s"}
              </span>
            </div>

            {tagsLoading ? (
              <p className="mt-5 text-sm text-slate-500">Loading tags...</p>
            ) : (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  {customerTags.length === 0 ? (
                    <p className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                      No tags yet. Choose one below.
                    </p>
                  ) : (
                    customerTags.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void removeCustomerTag(item.id)}
                        disabled={tagsSaving}
                        title="Remove tag"
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ring-1 disabled:opacity-60 ${getCustomerTagClass(item.tag)}`}
                      >
                        {item.tag}
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {CUSTOMER_TAG_OPTIONS.filter(
                    (option) => !customerTags.some((item) => item.tag === option),
                  ).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void addCustomerTag(option)}
                      disabled={tagsSaving}
                      className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-[#081c35] hover:border-[#d6a817] hover:bg-amber-50 disabled:opacity-60"
                    >
                      + {option}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={customTag}
                    onChange={(event) => setCustomTag(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addCustomerTag(customTag);
                      }
                    }}
                    placeholder="Add a custom tag"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm text-[#081c35] outline-none focus:border-[#d6a817]"
                  />
                  <button
                    type="button"
                    onClick={() => void addCustomerTag(customTag)}
                    disabled={!customTag.trim() || tagsSaving}
                    className="rounded-xl bg-[#d6a817] px-5 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tagsSaving ? "Saving..." : "Add Tag"}
                  </button>
                </div>
              </>
            )}

            {tagsError ? (
              <p className="mt-3 text-xs font-semibold text-red-700">{tagsError}</p>
            ) : null}
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-md">
            <div className="flex flex-wrap gap-3">
              <a
                href={phoneDigits ? `tel:${phoneDigits}` : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${phoneDigits ? "bg-[#081c35] text-white" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
              >
                <Phone className="h-4 w-4" /> Call
              </a>
              <a
                href={customer.email ? `mailto:${customer.email}` : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${customer.email ? "bg-[#081c35] text-white" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
              >
                <Mail className="h-4 w-4" /> Email
              </a>
              <a
                href={phoneDigits ? `sms:${phoneDigits}` : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${phoneDigits ? "bg-[#081c35] text-white" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
              >
                <MessageCircle className="h-4 w-4" /> Text
              </a>
              <button
                type="button"
                onClick={() => lastOrder && onCreateOrder(lastOrder)}
                disabled={!lastOrder}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Repeat2 className="h-4 w-4" /> Repeat Last Order
              </button>
              <button
                type="button"
                onClick={printCustomerSummary}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-[#081c35]"
              >
                <Printer className="h-4 w-4" /> Print Summary
              </button>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ProfileStat
              label="Lifetime Orders"
              value={orders.length.toString()}
            />
            <ProfileStat
              label="Lifetime Revenue"
              value={formatMoney(totalSpent)}
            />
            <ProfileStat
              label="Average Order"
              value={formatMoney(averageOrderValue)}
            />
            <ProfileStat
              label="Meals Purchased"
              value={totalMealsPurchased.toString()}
            />
            <ProfileStat label="Balance Due" value={formatMoney(balanceDue)} />
            <ProfileStat
              label="Completed Orders"
              value={completedOrders.toString()}
            />
            <ProfileStat label="Customer Since" value={customerSince} />
            <ProfileStat
              label="Last Order"
              value={lastOrder ? formatDate(lastOrder.order_date) : "No orders"}
            />
            <ProfileStat
              label="Last Delivery Date"
              value={
                lastDelivery?.fulfillment_date
                  ? formatDate(lastDelivery.fulfillment_date)
                  : "No deliveries"
              }
            />
            <ProfileStat label="Current Status" value={customer.customer_status} />
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">
              Contact Information
            </h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <ContactItem
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={formatPhoneNumber(customer.phone)}
              />

              <ContactItem
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={customer.email || "Not provided"}
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">Dietary Notes</h3>
            <div className="mt-3 text-sm leading-6 text-slate-600"><DietaryNotes notes={customer.dietary_notes} /></div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#d6a817] p-3 text-[#081c35]">
                  <Heart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#081c35]">
                    Favorite Meals
                  </h3>
                  <p className="text-sm text-slate-500">
                    Most frequently purchased meal plans.
                  </p>
                </div>
              </div>

              {favoriteMeals.length === 0 ? (
                <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Favorites will appear after the customer places orders.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {favoriteMeals.map(([meal, count], index) => (
                    <div
                      key={meal}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"
                    >
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-[#d6a817]">
                          #{index + 1} Favorite
                        </p>
                        <p className="mt-1 font-bold text-[#081c35]">{meal}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {count} order{count === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-md">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#081c35] p-3 text-white">
                    <Repeat2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#081c35]">Subscription</h3>
                    <p className="text-sm text-slate-500">Customer recurring-order status.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setEditingSubscription((value) => !value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#081c35]">
                  {editingSubscription ? "Close" : "Edit"}
                </button>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-xs font-bold uppercase text-slate-500">Plan</p><p className="mt-1 text-xl font-bold text-[#081c35]">{subscriptionPlan}</p></div>
                  <StatusBadge value={subscriptionStatus} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <ProfileStat label="Meals" value={subscriptionMeals} />
                  <ProfileStat label="Service" value={subscriptionDelivery} />
                  <ProfileStat label="Day" value={subscriptionDay} />
                  <ProfileStat label="Status" value={subscriptionStatus.toUpperCase()} />
                </div>
                {editingSubscription ? (
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Change plan</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["Weekly", "Bi-Weekly", "Monthly"].map((plan) => (
                        <button key={plan} type="button" disabled={subscriptionSaving} onClick={() => void setSubscriptionPlan(plan as "Weekly" | "Bi-Weekly" | "Monthly")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-[#081c35] hover:border-[#d6a817] disabled:opacity-50">{plan}</button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {subscriptionStatus === "Active" ? (
                        <button type="button" disabled={subscriptionSaving} onClick={() => void setSubscriptionStatus("Paused")} className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50">Pause</button>
                      ) : subscriptionStatus === "Paused" ? (
                        <button type="button" disabled={subscriptionSaving} onClick={() => void setSubscriptionStatus("Active")} className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">Reactivate</button>
                      ) : null}
                      {subscriptionStatus !== "Cancelled" && subscriptionTag ? (
                        <button type="button" disabled={subscriptionSaving} onClick={() => void setSubscriptionStatus("Cancelled")} className="rounded-xl bg-red-100 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50">Cancel</button>
                      ) : null}
                      {subscriptionStatus === "Cancelled" ? (
                        <button type="button" disabled={subscriptionSaving} onClick={() => void setSubscriptionStatus("Active")} className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">Reactivate</button>
                      ) : null}
                    </div>
                    {subscriptionSaving ? <p className="mt-3 text-xs font-semibold text-slate-500">Saving subscription...</p> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#d6a817] p-3 text-[#081c35]">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#081c35]">
                  Payment History
                </h3>
                <p className="text-sm text-slate-500">
                  Payments recorded on customer orders.
                </p>
              </div>
            </div>

            {sortedOrders.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No payments have been recorded yet.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3 text-right">Payment</th>
                      <th className="px-3 py-3">Method</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Balance</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOrders.map((order) => (
                      <tr key={order.id} className="border-b border-slate-100 text-sm hover:bg-slate-50">
                        <td className="px-3 py-4 text-slate-600">{formatDate(order.order_date)}</td>
                        <td className="px-3 py-4 text-right font-bold text-[#081c35]">{formatMoney(Number(order.amount_paid || 0))}</td>
                        <td className="px-3 py-4 text-slate-600">Not recorded</td>
                        <td className="px-3 py-4"><StatusBadge value={order.payment_status} /></td>
                        <td className="px-3 py-4 text-right font-bold text-red-700">{formatMoney(Number(order.balance_due || 0))}</td>
                        <td className="px-3 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => printCustomerOrder(order)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#081c35]">Receipt</button>
                            <button type="button" disabled={paymentSavingId === order.id} onClick={() => void setOrderPayment(order, order.payment_status.toLowerCase() !== "paid")} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${order.payment_status.toLowerCase() === "paid" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>
                              {paymentSavingId === order.id ? "Saving..." : order.payment_status.toLowerCase() === "paid" ? "Mark Unpaid" : "Mark Paid"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#d6a817] p-3 text-[#081c35]">
                  <NotebookPen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#081c35]">
                    Internal CRM Notes
                  </h3>
                  <p className="text-sm text-slate-500">
                    Private notes for your team.
                  </p>
                </div>
              </div>
              <textarea
                value={crmNotes}
                onChange={(event) => {
                  setCrmNotes(event.target.value);
                  setNotesSaved(false);
                  setNotesError("");
                }}
                rows={7}
                disabled={notesLoading || notesSaving}
                placeholder={
                  notesLoading
                    ? "Loading notes from Supabase..."
                    : "Add follow-up notes, preferences, concerns, or reminders..."
                }
                className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-[#081c35] outline-none focus:border-[#d6a817] disabled:bg-slate-50"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs font-semibold ${notesError ? "text-red-700" : "text-emerald-700"}`}>
                    {notesError || (notesSaved ? "Notes saved to Supabase" : "")}
                  </p>
                  {!notesError && notesUpdatedAt ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Last updated {new Date(notesUpdatedAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={saveCrmNotes}
                  disabled={notesLoading || notesSaving}
                  className="rounded-xl bg-[#081c35] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {notesSaving ? "Saving..." : "Save Notes"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-md">
              <h3 className="text-lg font-bold text-[#081c35]">
                Activity Timeline
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Recent customer order activity.
              </p>
              {activityItems.length === 0 ? (
                <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Activity will appear when orders are created.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {activityItems.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[#d6a817]" />
                      <div className="min-w-0 border-b border-slate-100 pb-4 last:border-b-0">
                        <p className="font-bold text-[#081c35]">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.detail}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDate(item.date.slice(0, 10))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#081c35]">
                  Order History
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Current balance: {formatMoney(balanceDue)}
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                No orders recorded for this customer.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {orders.map((order) => {
                  const expanded = expandedOrderId === order.id;
                  const details = parseOrderDetails(order.notes, order.meal_count);
                  return (
                    <div key={order.id} className="overflow-hidden rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(expanded ? null : order.id)}
                        className="flex w-full flex-col gap-3 p-4 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 text-lg font-bold text-[#d6a817]">{expanded ? "−" : "+"}</span>
                          <div>
                            <p className="font-bold text-[#081c35]">{order.order_number}</p>
                            <p className="mt-1 text-xs text-slate-500">Ordered {formatDate(order.order_date)}{order.fulfillment_date ? ` • Fulfillment ${formatDate(order.fulfillment_date)}` : ""}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={order.order_status} />
                          <StatusBadge value={order.payment_status} />
                          <span className="ml-1 font-bold text-[#081c35]">{formatMoney(Number(order.total || 0))}</span>
                        </div>
                      </button>

                      {expanded ? (
                        <div className="border-t border-slate-200 bg-slate-50 p-5">
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <OrderInfoCard label="Meals" value={`${details.numberOfMeals} • ${details.mealPlan}`} />
                            <OrderInfoCard label="Delivery" value={`${order.delivery_method || "Pickup"}${order.fulfillment_date ? ` • ${formatDate(order.fulfillment_date)}` : ""}`} />
                            <OrderInfoCard label="Invoice Total" value={formatMoney(Number(order.total || 0))} />
                            <OrderInfoCard label="Payment" value={`${formatMoney(Number(order.amount_paid || 0))} paid • ${order.payment_status}`} />
                            <OrderInfoCard label="Balance" value={formatMoney(Number(order.balance_due || 0))} emphasize={Number(order.balance_due || 0) > 0} />
                            <OrderInfoCard label="Notes" value={details.freeformNotes || "No notes recorded."} />
                          </div>
                          <div className="mt-5 flex flex-wrap gap-3">
                            <button type="button" disabled={paymentSavingId === order.id} onClick={() => void setOrderPayment(order, order.payment_status.toLowerCase() !== "paid")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${order.payment_status.toLowerCase() === "paid" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>
                              {paymentSavingId === order.id ? "Saving..." : order.payment_status.toLowerCase() === "paid" ? "Mark Unpaid" : "Mark Paid"}
                            </button>
                            <button type="button" onClick={() => printCustomerOrder(order)} className="inline-flex items-center gap-2 rounded-xl bg-[#081c35] px-4 py-3 text-sm font-bold text-white">
                              <Printer className="h-4 w-4" /> Print Invoice
                            </button>
                            <button type="button" onClick={() => onCreateOrder(order)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-[#081c35]">
                              <Copy className="h-4 w-4" /> Duplicate Order
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[#081c35]">{value}</p>
    </div>
  );
}

function ContactItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="mt-2 break-words text-sm font-semibold text-[#081c35]">
        {value}
      </p>
    </div>
  );
}

function OrderWizardProgress({ currentStep }: { currentStep: number }) {
  const steps = ["Customer", "Meal Plan", "Schedule", "Payment", "Review"];

  return (
    <div className="grid grid-cols-5 gap-2">
      {steps.map((label, index) => {
        const step = index + 1;
        const active = step === currentStep;
        const complete = step < currentStep;

        return (
          <div key={label} className="text-center">
            <div
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                active || complete
                  ? "bg-[#d6a817] text-[#081c35]"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {step}
            </div>
            <p
              className={`mt-2 hidden text-xs font-semibold sm:block ${
                active ? "text-[#081c35]" : "text-slate-400"
              }`}
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function OrderReview({
  form,
  customerName,
}: {
  form: OrderFormState;
  customerName: string;
}) {
  const subtotal = parseMoneyInput(form.subtotal);
  const deliveryFee = parseMoneyInput(form.delivery_fee);
  const discount = parseMoneyInput(form.discount);
  const amountPaid = parseMoneyInput(form.amount_paid);
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const balance = Math.max(0, total - amountPaid);

  const rows = [
    ["Customer", customerName],
    ["Meal Plan", form.meal_plan || "Not selected"],
    ["Number of Meals", form.number_of_meals || "Not selected"],
    ["Method", form.delivery_method],
    [
      "Pickup/Delivery Date",
      form.fulfillment_date
        ? formatDate(form.fulfillment_date)
        : "Not scheduled",
    ],
    ["Pickup/Delivery Time", form.pickup_time || "Not scheduled"],
    ["Payment Status", form.payment_status],
    ["Order Total", formatMoney(total)],
    ["Amount Paid", formatMoney(amountPaid)],
    ["Balance Due", formatMoney(balance)],
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-5 border-b border-slate-100 px-4 py-3 last:border-b-0"
        >
          <span className="text-sm text-slate-500">{label}</span>
          <span className="text-right text-sm font-bold text-[#081c35]">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function validateOrderStep(step: number, form: OrderFormState): string | null {
  if (step === 1 && !form.customer_id) {
    return "Select a customer before continuing.";
  }

  if (step === 2 && !form.meal_plan) {
    return "Select a meal plan before continuing.";
  }

  if (step === 3 && !form.fulfillment_date) {
    return "Choose a pickup or delivery date before continuing.";
  }

  return null;
}

function Modal({
  eyebrow,
  title,
  onClose,
  disableClose,
  maxWidthClass,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  disableClose: boolean;
  maxWidthClass: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white shadow-2xl ${maxWidthClass}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
              {eyebrow}
            </p>

            <h2 className="mt-1 text-2xl font-bold text-[#081c35]">{title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={disableClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-[#081c35]">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>

      {children}
    </label>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input"
        placeholder="0.00"
      />
    </FormField>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold text-[#081c35]">{value}</p>

          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>

        <div className="rounded-xl bg-[#081c35] p-3 text-white">{icon}</div>
      </div>
    </div>
  );
}

function ProductionMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-inset ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-[#081c35]">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>

        <div className="rounded-xl bg-[#d6a817] p-3 text-[#081c35]">{icon}</div>
      </div>
    </div>
  );
}

function ProductionStatusBadge({ value }: { value: string }) {
  let className =
    "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";

  if (value === "Overdue" || value === "Prep Today") {
    className = "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
  } else if (value === "Prep Tomorrow") {
    className = "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  } else if (value === "Upcoming") {
    className = "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${className}`}
    >
      {value}
    </span>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-slate-300 py-14 text-center">
      <p className="font-semibold text-[#081c35]">{title}</p>

      <p className="mt-1 text-sm text-slate-500">{description}</p>

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35]"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
      {message}
    </div>
  );
}

function OrderSummary({ form }: { form: OrderFormState }) {
  const subtotal = parseMoneyInput(form.subtotal);
  const deliveryFee = parseMoneyInput(form.delivery_fee);
  const discount = parseMoneyInput(form.discount);
  const amountPaid = parseMoneyInput(form.amount_paid);
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const balance = Math.max(0, total - amountPaid);

  return (
    <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500">Order Total</span>
        <span className="font-bold text-[#081c35]">{formatMoney(total)}</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500">Balance Due</span>
        <span className="font-bold text-red-700">{formatMoney(balance)}</span>
      </div>
    </div>
  );
}

function normalizeWorkflowStatus(value: string): OrderWorkflowStatus {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, OrderWorkflowStatus> = {
    pending: "New Order",
    new: "New Order",
    "new order": "New Order",
    paid: "Paid",
    kitchen: "Kitchen",
    prep: "Kitchen",
    "in progress": "Kitchen",
    preparing: "Cooking",
    cooking: "Cooking",
    packaging: "Packaging",
    ready: "Ready For Pickup",
    "ready for pickup": "Ready For Pickup",
    "out for delivery": "Out For Delivery",
    delivered: "Delivered",
    completed: "Completed",
  };
  return aliases[normalized] ?? "New Order";
}

function getNextWorkflowStatus(
  current: OrderWorkflowStatus,
  deliveryMethod?: string | null,
): OrderWorkflowStatus | null {
  if (
    current === "Ready For Pickup" &&
    !(deliveryMethod ?? "").toLowerCase().includes("delivery")
  ) {
    return "Completed";
  }
  const index = ORDER_WORKFLOW.indexOf(current);
  return index >= 0 && index < ORDER_WORKFLOW.length - 1
    ? ORDER_WORKFLOW[index + 1]
    : null;
}

function getWorkflowEventLabel(status: OrderWorkflowStatus) {
  const labels: Record<OrderWorkflowStatus, string> = {
    "New Order": "Order Created",
    Paid: "Payment Received",
    Kitchen: "Order moved to Kitchen",
    Cooking: "Kitchen Started",
    Packaging: "Packaging Started",
    "Ready For Pickup": "Packaging Complete",
    "Out For Delivery": "Driver Assigned",
    Delivered: "Order Delivered",
    Completed: "Order Completed",
  };
  return labels[status];
}

function getWorkflowBadgeClass(status: OrderWorkflowStatus) {
  if (status === "Cooking") return "bg-orange-100 text-orange-800";
  if (status === "Packaging") return "bg-purple-100 text-purple-800";
  if (["Delivered", "Completed", "Ready For Pickup"].includes(status)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (["Paid", "Kitchen", "Out For Delivery"].includes(status)) {
    return "bg-blue-100 text-blue-800";
  }
  return "bg-slate-100 text-slate-700";
}

function getDepartmentStatus(
  current: OrderWorkflowStatus,
  department: "Kitchen" | "Packaging" | "Delivery",
) {
  const currentIndex = ORDER_WORKFLOW.indexOf(current);
  const startIndex =
    department === "Kitchen"
      ? ORDER_WORKFLOW.indexOf("Kitchen")
      : department === "Packaging"
        ? ORDER_WORKFLOW.indexOf("Packaging")
        : ORDER_WORKFLOW.indexOf("Out For Delivery");
  const endIndex =
    department === "Kitchen"
      ? ORDER_WORKFLOW.indexOf("Packaging")
      : department === "Packaging"
        ? ORDER_WORKFLOW.indexOf("Ready For Pickup")
        : ORDER_WORKFLOW.indexOf("Completed");
  if (currentIndex < startIndex) return "Waiting";
  if (currentIndex >= endIndex) return "Completed";
  return "Active";
}

function OrderWorkflowBadge({ status }: { status: OrderWorkflowStatus }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${getWorkflowBadgeClass(status)}`}>
      {status}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();

  let className =
    "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";

  if (
    ORDER_WORKFLOW.map((status) => status.toLowerCase()).includes(normalized) ||
    ["pending", "new", "prep", "ready"].includes(normalized)
  ) {
    className = getWorkflowBadgeClass(normalizeWorkflowStatus(value));
  } else if (["active", "completed", "paid", "confirmed"].includes(normalized)) {
    className = "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200";
  } else if (
    ["pending", "partial", "in progress", "lead"].includes(normalized)
  ) {
    className = "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  } else if (["cancelled", "inactive", "unpaid"].includes(normalized)) {
    className = "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${className}`}
    >
      {normalized === "ready" ? "Ready For Pickup" : value}
    </span>
  );
}

function getProductionStatus(fulfillmentDate: string | null) {
  if (!fulfillmentDate) {
    return "Not Scheduled";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fulfillment = new Date(`${fulfillmentDate}T00:00:00`);
  const differenceInDays = Math.round(
    (fulfillment.getTime() - today.getTime()) / 86400000,
  );

  if (differenceInDays < 0) {
    return "Overdue";
  }

  if (differenceInDays === 0) {
    return "Prep Today";
  }

  if (differenceInDays === 1) {
    return "Prep Tomorrow";
  }

  return "Upcoming";
}

function getLocalDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

function summarizeDashboardProduction(orders: ProductionQueueOrder[], today: string) {
  const completedStatuses = ["Ready For Pickup", "Ready For Delivery", "Completed"];
  const activeOrders = orders.filter((order) => order.order_status !== "Cancelled");
  const todayOrders = activeOrders.filter((order) => order.fulfillment_date?.slice(0, 10) === today);
  const meals = (order: ProductionQueueOrder) => Number(order.meal_count) || 0;
  const progressWeight = (status: ProductionQueueOrder["production_status"]) => {
    if (completedStatuses.includes(status)) return 1;
    if (status === "Packaging") return 0.8;
    if (status === "Awaiting Packaging") return 0.7;
    if (["Cooking", "Paused", "Stopped"].includes(status)) return 0.5;
    return 0;
  };
  const totalMeals = todayOrders.reduce((sum, order) => sum + meals(order), 0);
  const weightedCompletedMeals = todayOrders.reduce(
    (sum, order) => sum + meals(order) * progressWeight(order.production_status),
    0,
  );

  return {
    waitingOrders: todayOrders.filter((order) => ["Waiting", "Stopped"].includes(order.production_status)).length,
    mealsWaiting: todayOrders.filter((order) => ["Waiting", "Stopped"].includes(order.production_status)).reduce((sum, order) => sum + meals(order), 0),
    overdueOrders: activeOrders.filter((order) => !completedStatuses.includes(order.production_status) && Boolean(order.fulfillment_date) && order.fulfillment_date!.slice(0, 10) < today).length,
    cookingOrders: todayOrders.filter((order) => order.production_status === "Cooking").length,
    pausedOrders: todayOrders.filter((order) => order.production_status === "Paused").length,
    packagingOrders: todayOrders.filter((order) => ["Awaiting Packaging", "Packaging"].includes(order.production_status)).length,
    readyOrders: todayOrders.filter((order) => ["Ready For Pickup", "Ready For Delivery"].includes(order.production_status)).length,
    mealsRemaining: todayOrders.filter((order) => !completedStatuses.includes(order.production_status)).reduce((sum, order) => sum + meals(order), 0),
    mealsCompleted: todayOrders.filter((order) => completedStatuses.includes(order.production_status)).reduce((sum, order) => sum + meals(order), 0),
    totalMeals,
    progress: totalMeals ? Math.round(weightedCompletedMeals / totalMeals * 100) : 0,
  };
}

function buildOrderNotes(form: OrderFormState) {
  const metadata = [
    `Pickup/Delivery Date: ${
      form.fulfillment_date
        ? formatDate(form.fulfillment_date)
        : "Not scheduled"
    }`,
    `Pickup/Delivery Time: ${form.pickup_time.trim() || "Not scheduled"}`,
  ];

  const extraNotes = form.notes.trim();

  return extraNotes
    ? `${metadata.join("\n")}\n\nNotes:\n${extraNotes}`
    : metadata.join("\n");
}

type DietaryProfile = {
  dietaryRestrictions: string;
  foodAllergies: string;
  mealPreferences: string;
  kitchenNotes: string;
};

function DietaryNotes({ notes }: { notes: string | null }) {
  const profile = parseDietaryProfile(notes);
  const fields = dietaryProfileFields(profile);
  const available = fields.filter(([, value]) => value);

  if (!available.length) return <>None</>;

  return <div className="space-y-3">{available.map(([label, value]) => (
    <div key={label}>
      <p className="font-semibold text-[#081c35]">{label}:</p>
      <p className="whitespace-pre-line">{value}</p>
    </div>
  ))}</div>;
}

function dietaryProfileFields(profile: DietaryProfile): Array<[string, string]> {
  return [
    ["Dietary Restrictions", profile.dietaryRestrictions],
    ["Food Allergies", profile.foodAllergies],
    ["Meal Preferences", profile.mealPreferences],
    ["Kitchen Notes", profile.kitchenNotes],
  ];
}

function parseDietaryProfile(notes: string | null): DietaryProfile {
  const empty: DietaryProfile = { dietaryRestrictions: "", foodAllergies: "", mealPreferences: "", kitchenNotes: "" };
  const text = notes?.trim() ?? "";
  if (!text) return empty;

  const prefix = "GBGS_CUSTOMER_PROFILE_V1:";
  const serialized = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
  if (text.startsWith("GBGS_") && !text.startsWith(prefix)) return empty;

  if (serialized.startsWith("{")) {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      const field = (key: keyof DietaryProfile) => typeof parsed[key] === "string" ? parsed[key].trim() : "";
      return {
        dietaryRestrictions: field("dietaryRestrictions"),
        foodAllergies: field("foodAllergies"),
        mealPreferences: field("mealPreferences"),
        kitchenNotes: field("kitchenNotes"),
      };
    } catch {
      return empty;
    }
  }

  const labels = ["Dietary Restrictions", "Food Allergies", "Meal Preferences", "Kitchen Notes", "Address", "Delivery Preference", "Pickup Location", "Emergency Contact", "Phone", "Email"];
  const labelPattern = labels.join("|");
  const value = (label: string) => text.match(new RegExp(`(?:^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n(?:${labelPattern}):|$)`, "i"))?.[1]?.trim() ?? "";
  const structured = labels.some((label) => new RegExp(`(?:^|\\n)${label}:`, "i").test(text));

  return {
    dietaryRestrictions: structured ? value("Dietary Restrictions") : text,
    foodAllergies: value("Food Allergies"),
    mealPreferences: value("Meal Preferences"),
    kitchenNotes: value("Kitchen Notes"),
  };
}

function parseOrderDetails(notes: string | null | undefined, mealCount: number) {
  const value = notes || "";

  const mealPlan =
    value.match(/^Meal Plan:\s*(.+)$/im)?.[1]?.trim() || "Not specified";

  const numberOfMeals = String(mealCount);

  const pickupDeliveryDate =
    value.match(/^Pickup\/Delivery Date:\s*(.+)$/im)?.[1]?.trim() ||
    "Not scheduled";

  const pickupDeliveryTime =
    value.match(/^Pickup\/Delivery Time:\s*(.+)$/im)?.[1]?.trim() ||
    "Not scheduled";

  const freeformNotes = value.includes("Notes:")
    ? value
        .split(/Notes:\s*/i)
        .slice(1)
        .join("Notes:")
        .trim()
    : value
        .split("\n")
        .filter(
          (line) =>
            !/^Meal Plan:/i.test(line) &&
            !/^Number of Meals:/i.test(line) &&
            !/^Pickup\/Delivery Date:/i.test(line) &&
            !/^Pickup\/Delivery Time:/i.test(line),
        )
        .join("\n")
        .trim();

  return {
    mealPlan,
    numberOfMeals,
    pickupDeliveryDate,
    pickupDeliveryTime,
    freeformNotes: freeformNotes || "No order notes recorded.",
  };
}

function parseMoneyInput(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
