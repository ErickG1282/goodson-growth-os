"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type Order = {
  id: string;
  customer_id: string;
  meal_id: string | null;
  meal_count: number;
  order_number: string;
  order_date: string;
  fulfillment_date: string | null;
  order_status: string;
  payment_status: string;
  delivery_method: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  discount: number | null;
  amount_paid: number | null;
  total: number;
  balance_due: number;
  notes: string | null;
  created_at?: string;
};

type WorkflowStatus =
  | "New Order"
  | "Preparing"
  | "Packaging"
  | "Ready"
  | "Out For Delivery"
  | "Delivered"
  | "Completed";

type WorkflowEvent = {
  id: string;
  status: WorkflowStatus;
  label: string;
  createdAt: string;
};

type OrderDetails = {
  mealPlan: string;
  pickupTime: string;
  deliveryAddress: string;
  internalNotes: string;
};

type EditForm = {
  mealId: string;
  mealPlan: string;
  mealCount: string;
  deliveryMethod: string;
  fulfillmentDate: string;
  pickupTime: string;
  deliveryAddress: string;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  amountPaid: string;
  paymentStatus: string;
  internalNotes: string;
};

type MenuMeal = { id: string; name: string; selling_price: number; food_cost: number };
type NewOrderForm = {
  customerId: string;
  mealId: string;
  quantity: string;
  deliveryMethod: string;
  fulfillmentDate: string;
  deliveryAddress: string;
  notes: string;
};

const emptyNewOrderForm: NewOrderForm = { customerId: "", mealId: "", quantity: "1", deliveryMethod: "Pickup", fulfillmentDate: "", deliveryAddress: "", notes: "" };

const WORKFLOW: WorkflowStatus[] = [
  "New Order",
  "Preparing",
  "Packaging",
  "Ready",
  "Out For Delivery",
  "Delivered",
  "Completed",
];
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export default function OrdersPage() {
  const [businessId, setBusinessId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meals, setMeals] = useState<MenuMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [events, setEvents] = useState<Record<string, WorkflowEvent[]>>({});
  const [newOrderForm, setNewOrderForm] = useState<NewOrderForm | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("newOrder") !== "1") return;
    setNewOrderForm({ ...emptyNewOrderForm, customerId: params.get("customerId") ?? "" });
  }, []);

  const loadOrders = useCallback(async () => {
    setError("");
    try {
      const { data: business, error: businessError } = await supabase
        .from("gbgs_businesses")
        .select("id")
        .eq("slug", "miz-ritas-kitchen")
        .maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);

      const [ordersResult, customersResult, mealsResult, eventsResult] = await Promise.all([
        supabase
          .from("gbgs_orders")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("gbgs_customers")
          .select("id, first_name, last_name, phone, email")
          .eq("business_id", business.id),
        supabase.from("gbgs_menu_meals").select("id, name, selling_price, food_cost").eq("business_id", business.id).eq("status", "Active").order("name"),
        supabase
          .from("gbgs_order_workflow_events")
          .select("id, order_id, status, label, created_at")
          .eq("business_id", business.id)
          .order("created_at"),
      ]);
      if (ordersResult.error || customersResult.error || mealsResult.error || eventsResult.error) {
        throw ordersResult.error ?? customersResult.error ?? mealsResult.error ?? eventsResult.error;
      }
      setOrders((ordersResult.data ?? []) as Order[]);
      setSelectedOrder((current) => current ? ((ordersResult.data ?? []).find((order) => order.id === current.id) as Order | undefined) ?? null : null);
      setCustomers((customersResult.data ?? []) as Customer[]);
      setMeals((mealsResult.data ?? []).map((meal) => ({ ...meal, selling_price: Number(meal.selling_price), food_cost: Number(meal.food_cost) })));
      const grouped: Record<string, WorkflowEvent[]> = {};
      (eventsResult.data ?? []).forEach((event) => {
        grouped[event.order_id] = [...(grouped[event.order_id] ?? []), { id: event.id, status: normalizeStatus(event.status), label: event.label, createdAt: event.created_at }];
      });
      setEvents(grouped);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`orders-hq-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gbgs_orders",
          filter: `business_id=eq.${businessId}`,
        },
        () => void loadOrders(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_order_workflow_events", filter: `business_id=eq.${businessId}` }, () => void loadOrders())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, loadOrders]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const customerMap = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          {
            ...customer,
            name: `${customer.first_name} ${customer.last_name ?? ""}`.trim(),
          },
        ]),
      ),
    [customers],
  );
  const mealMap = useMemo(() => new Map(meals.map((meal) => [meal.id, meal.name])), [meals]);

  const now = new Date();
  const today = dateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const customer = customerMap.get(order.customer_id);
      const details = parseDetails(order.notes);
      const status = normalizeStatus(order.order_status);
      const orderDate = new Date(`${order.order_date}T12:00:00`);
      const fulfillment = order.fulfillment_date?.slice(0, 10);
      const matchesSearch =
        !term ||
        customer?.name.toLowerCase().includes(term) ||
        customer?.phone?.toLowerCase().includes(term) ||
        order.order_number.toLowerCase().includes(term) ||
        (mealMap.get(order.meal_id ?? "") ?? "").toLowerCase().includes(term);
      if (!matchesSearch) return false;

      if (filter === "Today") return fulfillment === today || order.order_date === today;
      if (filter === "Tomorrow") return fulfillment === tomorrow;
      if (filter === "This Week") return orderDate >= weekStart;
      if (filter === "Pending") return ["New Order", "Preparing"].includes(status);
      if (filter === "Ready") return status === "Ready";
      if (filter === "Delivered") {
        return (
          status === "Delivered" ||
          (events[order.id] ?? []).some((event) => event.status === "Delivered")
        );
      }
      if (filter === "Cancelled") return ["cancelled", "canceled"].includes(order.order_status.toLowerCase());
      if (filter === "Paid" || filter === "Unpaid") {
        return order.payment_status.toLowerCase() === filter.toLowerCase();
      }
      return filter === "All" || status.toLowerCase() === filter.toLowerCase();
    });
  }, [orders, customerMap, mealMap, search, filter, today, tomorrow, weekStart, events]);

  const ordersToday = orders.filter((order) => order.order_date === today);
  const cards = [
    ["Orders Today", ordersToday.length],
    ["Orders This Week", orders.filter((order) => new Date(`${order.order_date}T12:00:00`) >= weekStart).length],
    ["Orders This Month", orders.filter((order) => new Date(`${order.order_date}T12:00:00`) >= monthStart).length],
    ["Pending Orders", orders.filter((order) => !["Completed", "Cancelled"].includes(order.order_status)).length],
    ["Completed Orders", orders.filter((order) => normalizeStatus(order.order_status) === "Completed").length],
    ["Revenue Today", money(ordersToday.reduce((sum, order) => sum + Number(order.total || 0), 0))],
  ];

  const addEvent = async (orderId: string, status: WorkflowStatus, label: string) => {
    if (!businessId) return;
    const createdAt = new Date().toISOString();
    const optimistic = { id: `${orderId}-${Date.now()}`, status, label, createdAt };
    setEvents((current) => ({ ...current, [orderId]: [...(current[orderId] ?? []), optimistic] }));
    const { error: eventError } = await supabase.from("gbgs_order_workflow_events").insert({ business_id: businessId, order_id: orderId, status, label, created_at: createdAt });
    if (eventError) setError(eventError.message);
  };

  const updateStatus = async (order: Order, status: WorkflowStatus) => {
    setSaving(true);
    const persistedStatus = status === "Delivered" ? "Completed" : status;
    const label = eventLabel(status);
    const { error: updateError } = await supabase.rpc("gbgs_transition_order", {
      p_business_id: businessId,
      p_order_id: order.id,
      p_order_status: persistedStatus,
      p_label: label,
    });
    if (updateError) {
      setError(updateError.message);
    } else {
      const updated = { ...order, order_status: persistedStatus };
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedOrder(updated);
      setToast(label);
    }
    setSaving(false);
  };

  const updatePaymentStatus = async (order: Order, status: string) => {
    setSaving(true); setError("");
    const { error: paymentError } = await supabase.rpc("gbgs_set_order_payment_status", {
      p_business_id: businessId, p_order_id: order.id, p_payment_status: status,
    });
    if (paymentError) setError(paymentError.message);
    else { setToast(`Payment moved to ${status}`); await loadOrders(); }
    setSaving(false);
  };

  const openEdit = (order: Order) => {
    const details = parseDetails(order.notes);
    setEditingOrder(order);
    setEditForm({
      mealId: order.meal_id ?? "",
      mealPlan: mealMap.get(order.meal_id ?? "") ?? "",
      mealCount: String(order.meal_count),
      deliveryMethod: order.delivery_method || "Pickup",
      fulfillmentDate: order.fulfillment_date?.slice(0, 10) || "",
      pickupTime: details.pickupTime === "Not scheduled" ? "" : details.pickupTime,
      deliveryAddress: details.deliveryAddress === "Not provided" ? "" : details.deliveryAddress,
      subtotal: String(order.subtotal ?? order.total ?? 0),
      deliveryFee: String(order.delivery_fee ?? 0),
      discount: String(order.discount ?? 0),
      amountPaid: String(order.amount_paid ?? 0),
      paymentStatus: order.payment_status,
      internalNotes: details.internalNotes === "No internal notes." ? "" : details.internalNotes,
    });
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingOrder || !editForm) return;
    setSaving(true);
    const subtotal = Number(editForm.subtotal) || 0;
    const deliveryFee = Number(editForm.deliveryFee) || 0;
    const discount = Number(editForm.discount) || 0;
    const amountPaid = Number(editForm.amountPaid) || 0;
    const total = Math.max(0, subtotal + deliveryFee - discount);
    const mealId = editForm.mealId || meals.find((meal) => meal.name.toLowerCase() === editForm.mealPlan.trim().toLowerCase())?.id;
    if (!mealId) { setError("Select a meal that exists in Menu HQ."); setSaving(false); return; }
    const { error: updateError } = await supabase.rpc("gbgs_update_order_and_payment", {
        p_business_id: businessId,
        p_order_id: editingOrder.id,
        p_meal_id: mealId,
        p_values: {
        fulfillment_date: editForm.fulfillmentDate || null,
        meal_count: Math.max(1, Math.floor(Number(editForm.mealCount))),
        delivery_method: editForm.deliveryMethod,
        subtotal,
        delivery_fee: deliveryFee,
        discount,
        total,
        notes: buildNotes(editForm),
      },
      p_target_paid: amountPaid,
    });
    if (updateError) {
      setError(updateError.message);
    } else {
      const { data: synchronized } = await supabase.from("gbgs_orders").select("*").eq("id", editingOrder.id).single();
      const updated = synchronized as Order;
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      setSelectedOrder(updated);
      setToast("Order updated");
      setEditingOrder(null);
      setEditForm(null);
    }
    setSaving(false);
  };

  const createNewOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!newOrderForm) return;
    const customer = customers.find((item) => item.id === newOrderForm.customerId);
    const meal = meals.find((item) => item.id === newOrderForm.mealId);
    const quantity = Math.max(1, Math.floor(Number(newOrderForm.quantity) || 0));
    if (!customer || !meal) { setError("Select a customer and Menu meal."); return; }
    if (newOrderForm.deliveryMethod === "Delivery" && !newOrderForm.deliveryAddress.trim()) { setError("Enter a delivery address."); return; }
    setSaving(true);
    setError("");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { setError(userError?.message || "You must be signed in."); setSaving(false); return; }
    const subtotal = quantity * meal.selling_price;
    const orderNumber = `MR-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
    const notes = buildNewOrderNotes(newOrderForm);
    const { data: createdId, error: createError } = await supabase.rpc("gbgs_create_order", {
      p_business_id: businessId,
      p_created_by: user.id,
      p_customer_id: customer.id,
      p_meal_id: meal.id,
      p_values: {
        order_number: orderNumber,
        order_date: today,
        fulfillment_date: newOrderForm.fulfillmentDate,
        meal_count: quantity,
        order_status: "New Order",
        payment_status: "Unpaid",
        delivery_method: newOrderForm.deliveryMethod,
        subtotal,
        delivery_fee: 0,
        discount: 0,
        total: subtotal,
        notes,
      },
      p_payment_amount: 0,
    });
    if (createError || !createdId) { setError(createError?.message || "Order could not be created."); setSaving(false); return; }
    const { data: createdOrder, error: reloadError } = await supabase.from("gbgs_orders").select("*").eq("id", createdId).single();
    if (reloadError || !createdOrder) { setError(reloadError?.message || "Created order could not be loaded."); setSaving(false); return; }
    setOrders((current) => [createdOrder as Order, ...current.filter((item) => item.id !== createdOrder.id)]);
    setSelectedOrder(createdOrder as Order);
    setNewOrderForm(null);
    setToast("Order created");
    await loadOrders();
    setSaving(false);
  };

  const duplicateOrder = async (order: Order) => {
    setSaving(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError(userError?.message || "You must be signed in.");
      setSaving(false);
      return;
    }
    const orderNumber = `MR-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
    if (!order.meal_id) {
      setError("This legacy order must be linked to a Menu meal before it can be duplicated.");
      setSaving(false);
      return;
    }
    const { data: duplicatedId, error: duplicateError } = await supabase.rpc("gbgs_create_order", {
        p_business_id: businessId,
        p_created_by: user.id,
        p_customer_id: order.customer_id,
        p_meal_id: order.meal_id,
        p_values: {
        order_number: orderNumber,
        order_date: today,
        fulfillment_date: order.fulfillment_date,
        meal_count: order.meal_count,
        order_status: "New Order",
        payment_status: "Unpaid",
        delivery_method: order.delivery_method,
        subtotal: Number(order.subtotal || 0),
        delivery_fee: Number(order.delivery_fee || 0),
        discount: Number(order.discount || 0),
        total: Number(order.total || 0),
        notes: order.notes,
      },
      p_payment_amount: 0,
    });
    if (duplicateError) {
      setError(duplicateError.message);
    } else {
      const { data: duplicated, error: reloadError } = await supabase.from("gbgs_orders").select("*").eq("id", duplicatedId).single();
      if (reloadError || !duplicated) { setError(reloadError?.message ?? "Duplicated order could not be loaded."); setSaving(false); return; }
      setOrders((current) => [duplicated, ...current]);
      setToast("Order duplicated");
      setSelectedOrder(duplicated);
    }
    setSaving(false);
  };

  const deleteOrder = async (order: Order) => {
    if (!window.confirm(`Delete ${order.order_number}? This cannot be undone.`)) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from("gbgs_orders").delete().eq("id", order.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setSelectedOrder(null);
      setToast("Order deleted");
    }
    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb] p-4 text-slate-900 md:p-8">
      <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#d6a817]">Miz Rita HQ</p>
            <h1 className="mt-2 text-4xl font-bold">Orders HQ</h1>
            <p className="mt-2 text-slate-300">Find an order, follow its progress, and take the next action.</p>
          </div>
          <div className="flex flex-wrap gap-3"><Link href="/dashboard/miz-rita" className="rounded-xl border border-white/20 px-5 py-3 font-bold hover:bg-white/10">Dashboard</Link><button onClick={() => { setError(""); setNewOrderForm({ ...emptyNewOrderForm }); }} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35]"><Plus className="mr-2 inline h-5 w-5" />New Order</button></div>
        </div>
      </section>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</div> : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-[#081c35]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#081c35]">Orders</h2>
              <p className="mt-1 text-sm text-slate-500">{visibleOrders.length} order{visibleOrders.length === 1 ? "" : "s"} shown</p>
            </div>
            <label className="flex w-full items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 lg:max-w-md">
              <Search className="h-5 w-5 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, phone, order, or meal plan" className="min-w-0 flex-1 outline-none" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["All", "Today", "Tomorrow", "This Week", "Pending", "Preparing", "Packaging", "Ready", "Delivered", "Cancelled", "Paid", "Unpaid"].map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === item ? "bg-[#081c35] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="bg-[#081c35] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                {["Order Number", "Customer", "Meal Plan", "Meal Count", "Pickup / Delivery", "Kitchen Status", "Payment Status", "Driver", "Order Total", "Balance Due", "Order Date", "Actions"].map((heading) => (
                  <th key={heading} className="px-4 py-4">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={12} className="p-10 text-center text-slate-500">Loading orders...</td></tr>
              ) : visibleOrders.length ? visibleOrders.map((order) => {
                const customer = customerMap.get(order.customer_id);
                const details = parseDetails(order.notes);
                const status = normalizeStatus(order.order_status);
                return (
                  <tr key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedOrder(order)}>
                    <td className="px-4 py-4 font-bold text-[#081c35]">{order.order_number}</td>
                    <td className="px-4 py-4"><p className="font-bold">{customer?.name || "Unknown"}</p><p className="text-xs text-slate-500">{customer?.phone || "No phone"}</p></td>
                    <td className="px-4 py-4">{mealMap.get(order.meal_id ?? "") ?? "Not specified"}</td>
                    <td className="px-4 py-4 font-bold">{order.meal_count}</td>
                    <td className="px-4 py-4">{order.delivery_method || "Pickup"}<p className="text-xs text-slate-500">{details.pickupTime}</p></td>
                    <td className="px-4 py-4"><WorkflowBadge status={status} /></td>
                    <td className="px-4 py-4"><SimpleBadge value={order.payment_status} /></td>
                    <td className="px-4 py-4">Not Assigned</td>
                    <td className="px-4 py-4 font-bold">{money(Number(order.total || 0))}</td>
                    <td className={`px-4 py-4 font-bold ${Number(order.balance_due || 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(Number(order.balance_due || 0))}</td>
                    <td className="px-4 py-4">{shortDate(order.order_date)}</td>
                    <td className="px-4 py-4"><button onClick={(event) => { event.stopPropagation(); setSelectedOrder(order); }} className="flex items-center gap-1 rounded-xl border px-3 py-2 font-bold">Open <ChevronRight className="h-4 w-4" /></button></td>
                  </tr>
                );
              }) : <tr><td colSpan={12} className="p-10 text-center text-slate-500">No orders match this search or filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOrder ? (
        <OrderDrawer
          order={selectedOrder}
          mealName={mealMap.get(selectedOrder.meal_id ?? "") ?? "Not specified"}
          customer={customerMap.get(selectedOrder.customer_id) ?? null}
          events={events[selectedOrder.id] ?? []}
          saving={saving}
          onClose={() => setSelectedOrder(null)}
          onAdvance={() => {
            const next = nextStatus(normalizeStatus(selectedOrder.order_status), selectedOrder.delivery_method);
            if (next) void updateStatus(selectedOrder, next);
          }}
          onStatus={(status) => void updateStatus(selectedOrder, status)}
          onPaymentStatus={(status) => void updatePaymentStatus(selectedOrder, status)}
          onEdit={() => openEdit(selectedOrder)}
          onDuplicate={() => void duplicateOrder(selectedOrder)}
          onDelete={() => void deleteOrder(selectedOrder)}
        />
      ) : null}

      {editingOrder && editForm ? (
        <EditOrderModal
          form={editForm}
          saving={saving}
          onChange={setEditForm}
          onClose={() => { setEditingOrder(null); setEditForm(null); }}
          onSave={saveEdit}
          meals={meals}
        />
      ) : null}

      {newOrderForm ? <NewOrderModal form={newOrderForm} customers={customers} meals={meals} saving={saving} onChange={setNewOrderForm} onClose={() => setNewOrderForm(null)} onSave={createNewOrder} /> : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl bg-[#081c35] px-5 py-4 font-bold text-white shadow-2xl">
          <CheckCircle2 className="h-5 w-5 text-[#d6a817]" />{toast}
        </div>
      ) : null}
    </main>
  );
}

function OrderDrawer({
  order,
  mealName,
  customer,
  events,
  saving,
  onClose,
  onAdvance,
  onStatus,
  onPaymentStatus,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  order: Order;
  mealName: string;
  customer: (Customer & { name: string }) | null;
  events: WorkflowEvent[];
  saving: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onStatus: (status: WorkflowStatus) => void;
  onPaymentStatus: (status: string) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const details = parseDetails(order.notes);
  const status = normalizeStatus(order.order_status);
  const next = nextStatus(status, order.delivery_method);
  const activity = events.length
    ? events
    : [{ id: `${order.id}-created`, status, label: "Order Created", createdAt: `${order.order_date}T09:00:00` }];
  const print = (kind: "Invoice" | "Receipt") => printOrder(order, customer, { ...details, mealPlan: mealName }, kind);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[#f4f6fb] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Order Details</p><h2 className="mt-1 text-2xl font-bold text-[#081c35]">{order.order_number}</h2></div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Close order"><X /></button>
        </header>
        <div className="space-y-5 p-5">
          <section className="rounded-3xl bg-[#081c35] p-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm text-slate-300">Customer</p><p className="mt-1 text-2xl font-bold">{customer?.name || "Unknown customer"}</p><p className="mt-2 text-sm text-slate-300">{customer?.phone || "No phone"} · {customer?.email || "No email"}</p></div>
              <div className="text-right"><WorkflowBadge status={status} /><p className="mt-3 text-3xl font-bold">{money(Number(order.total || 0))}</p></div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#081c35]">Order Workflow</h3>
            <div className="mt-4 flex flex-wrap gap-2">{WORKFLOW.map((item, index) => {
              const current = WORKFLOW.indexOf(status);
              return <span key={item} className={`rounded-full px-3 py-1.5 text-xs font-bold ${index < current ? "bg-emerald-100 text-emerald-800" : index === current ? badgeClass(item) : "bg-slate-100 text-slate-500"}`}>{item}</span>;
            })}</div>
            {next ? <button disabled={saving} onClick={onAdvance} className="mt-5 w-full rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35] disabled:opacity-50">Move to {next}</button> : null}
            <label className="mt-4 block"><span className="mb-2 block text-sm font-bold">Kitchen Status</span><select disabled={saving} value={status} onChange={(event) => onStatus(event.target.value as WorkflowStatus)} className="order-input text-slate-900">{WORKFLOW.map((item) => <option key={item}>{item}</option>)}</select></label>
          </section>

          <InfoSection title="Customer Information" rows={[["Customer", customer?.name || "Unknown"], ["Phone", customer?.phone || "Not provided"], ["Email", customer?.email || "Not provided"]]} />
          <InfoSection title="Meal Information" rows={[["Meal Plan", mealName], ["Meal Count", String(order.meal_count)], ["Pickup / Delivery", order.delivery_method || "Pickup"], ["Fulfillment Date", order.fulfillment_date ? shortDate(order.fulfillment_date) : "Not scheduled"]]} />
          <InfoSection title="Payment Information" rows={[["Payment Status", order.payment_status], ["Subtotal", money(Number(order.subtotal || 0))], ["Order Total", money(Number(order.total || 0))], ["Amount Paid", money(Number(order.amount_paid || 0))], ["Balance Due", money(Number(order.balance_due || 0))]]} />
          <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Update Payment Status</h3><select disabled={saving} value={paymentStatusLabel(order.payment_status)} onChange={(event) => onPaymentStatus(event.target.value)} className="order-input mt-4"><option>Unpaid</option><option>Partially Paid</option><option>Paid</option><option>Refunded</option></select>{paymentStatusLabel(order.payment_status) !== "Paid" && <button disabled={saving} onClick={() => onPaymentStatus("Paid")} className="mt-3 w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-50">Move to Paid</button>}</section>
          <InfoSection title="Kitchen Progress" rows={[["Kitchen Status", departmentStatus(status, "Kitchen")], ["Packaging Status", departmentStatus(status, "Packaging")]]} />
          <InfoSection title="Delivery Information" rows={[["Method", order.delivery_method || "Pickup"], ["Address", details.deliveryAddress], ["Driver", "Not Assigned"], ["Delivery Status", departmentStatus(status, "Delivery")], ["Pickup Time", details.pickupTime]]} />

          <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Internal Notes</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{details.internalNotes}</p></section>
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#081c35]">Activity Timeline</h3>
            <div className="mt-5 space-y-4">{activity.map((event) => (
              <div key={event.id} className="grid grid-cols-[80px_12px_1fr] gap-3">
                <p className="text-xs font-bold text-slate-500">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(event.createdAt))}</p>
                <span className="mt-1 h-3 w-3 rounded-full bg-[#d6a817]" />
                <div><p className="font-bold">{event.label}</p><p className="text-xs text-slate-500">{event.status}</p></div>
              </div>
            ))}</div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#081c35]">Quick Actions</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ActionButton icon={<Pencil />} label="Edit Order" onClick={onEdit} />
              <ActionButton icon={<Printer />} label="Print Invoice" onClick={() => print("Invoice")} />
              <ActionButton icon={<FileText />} label="Print Receipt" onClick={() => print("Receipt")} />
              <ActionButton icon={<Copy />} label="Duplicate Order" onClick={onDuplicate} />
              <ActionButton icon={<Trash2 />} label="Delete Order" onClick={onDelete} danger />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function NewOrderModal({ form, customers, meals, saving, onChange, onClose, onSave }: { form: NewOrderForm; customers: Customer[]; meals: MenuMeal[]; saving: boolean; onChange: (form: NewOrderForm) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  const field = (key: keyof NewOrderForm, value: string) => onChange({ ...form, [key]: value });
  const meal = meals.find((item) => item.id === form.mealId);
  const quantity = Math.max(1, Math.floor(Number(form.quantity) || 0));
  const foodCost = quantity * Number(meal?.food_cost ?? 0);
  const sellingPrice = quantity * Number(meal?.selling_price ?? 0);
  const profit = sellingPrice - foodCost;
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4"><form onSubmit={onSave} className="mx-auto my-8 max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#081c35] p-6 text-white"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Orders HQ</p><h2 className="mt-1 text-2xl font-bold">New Order</h2></div><button type="button" onClick={onClose} aria-label="Close new order"><X /></button></header><div className="grid gap-4 p-6 sm:grid-cols-2">
    <EditField label="Customer"><select required value={form.customerId} onChange={(event) => field("customerId", event.target.value)} className="order-input"><option value="">Select Customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.first_name} {customer.last_name ?? ""}</option>)}</select></EditField>
    <EditField label="Meal"><select required value={form.mealId} onChange={(event) => field("mealId", event.target.value)} className="order-input"><option value="">Select Meal</option>{meals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></EditField>
    <EditField label="Quantity"><input required type="number" min="1" step="1" value={form.quantity} onChange={(event) => field("quantity", event.target.value)} className="order-input" /></EditField>
    <EditField label="Pickup / Delivery"><select value={form.deliveryMethod} onChange={(event) => field("deliveryMethod", event.target.value)} className="order-input"><option>Pickup</option><option>Delivery</option></select></EditField>
    <EditField label="Fulfillment Date"><input required type="date" value={form.fulfillmentDate} onChange={(event) => field("fulfillmentDate", event.target.value)} className="order-input" /></EditField>
    {form.deliveryMethod === "Delivery" ? <div className="sm:col-span-2"><EditField label="Delivery Address"><input required value={form.deliveryAddress} onChange={(event) => field("deliveryAddress", event.target.value)} className="order-input" /></EditField></div> : null}
    <div className="sm:col-span-2"><EditField label="Notes"><textarea rows={3} value={form.notes} onChange={(event) => field("notes", event.target.value)} className="order-input" /></EditField></div>
    <section className="grid gap-3 sm:col-span-2 sm:grid-cols-4">{[["Food Cost", foodCost], ["Selling Price", sellingPrice], ["Profit", profit], ["Order Total", sellingPrice]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-[#081c35]">{money(Number(value))}</p></div>)}</section>
    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35] disabled:opacity-50">{saving ? "Creating..." : "Create Order"}</button></div>
  </div></form><style jsx global>{`.order-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;outline:none;background:white}.order-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}`}</style></div>;
}

function EditOrderModal({ form, saving, meals, onChange, onClose, onSave }: { form: EditForm; saving: boolean; meals: Array<{ id: string; name: string }>; onChange: (form: EditForm) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  const field = (key: keyof EditForm, value: string) => onChange({ ...form, [key]: value });
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4">
      <form onSubmit={onSave} className="mx-auto my-8 max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#081c35] p-6 text-white"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Orders HQ</p><h2 className="mt-1 text-2xl font-bold">Edit Order</h2></div><button type="button" onClick={onClose}><X /></button></header>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <EditField label="Meal Plan"><input required value={form.mealPlan} onChange={(event) => { field("mealPlan", event.target.value); field("mealId", meals.find((meal) => meal.name.toLowerCase() === event.target.value.trim().toLowerCase())?.id ?? ""); }} className="order-input" /></EditField>
          <EditField label="Meal Count"><input required type="number" min="1" value={form.mealCount} onChange={(event) => field("mealCount", event.target.value)} className="order-input" /></EditField>
          <EditField label="Pickup / Delivery"><select value={form.deliveryMethod} onChange={(event) => field("deliveryMethod", event.target.value)} className="order-input"><option>Pickup</option><option>Delivery</option></select></EditField>
          <EditField label="Fulfillment Date"><input type="date" value={form.fulfillmentDate} onChange={(event) => field("fulfillmentDate", event.target.value)} className="order-input" /></EditField>
          <EditField label="Pickup Time"><input type="time" value={form.pickupTime} onChange={(event) => field("pickupTime", event.target.value)} className="order-input" /></EditField>
          <EditField label="Delivery Address"><input value={form.deliveryAddress} onChange={(event) => field("deliveryAddress", event.target.value)} className="order-input" /></EditField>
          <EditField label="Subtotal"><input type="number" min="0" step="0.01" value={form.subtotal} onChange={(event) => field("subtotal", event.target.value)} className="order-input" /></EditField>
          <EditField label="Delivery Fee"><input type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(event) => field("deliveryFee", event.target.value)} className="order-input" /></EditField>
          <EditField label="Discount"><input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => field("discount", event.target.value)} className="order-input" /></EditField>
          <EditField label="Amount Paid"><input type="number" min="0" step="0.01" value={form.amountPaid} onChange={(event) => field("amountPaid", event.target.value)} className="order-input" /></EditField>
          <EditField label="Payment Status"><select value={paymentStatusLabel(form.paymentStatus)} onChange={(event) => field("paymentStatus", event.target.value)} className="order-input"><option>Unpaid</option><option>Partially Paid</option><option>Paid</option><option>Refunded</option></select></EditField>
          <EditField label="Internal Notes"><textarea rows={3} value={form.internalNotes} onChange={(event) => field("internalNotes", event.target.value)} className="order-input" /></EditField>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35] disabled:opacity-50">{saving ? "Saving..." : "Save Order"}</button></div>
        </div>
      </form>
      <style jsx global>{`.order-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;outline:none}.order-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}`}</style>
    </div>
  );
}

function InfoSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">{title}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div></section>;
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>;
}

function ActionButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-[#081c35] hover:bg-slate-50"}`}>{icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}{label}</button>;
}

function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${badgeClass(status)}`}>{status}</span>;
}

function SimpleBadge({ value }: { value: string }) {
  const paid = value.toLowerCase() === "paid";
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-800" : value.toLowerCase() === "unpaid" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{value}</span>;
}

function paymentStatusLabel(value: string) {
  return value.toLowerCase() === "partial" ? "Partially Paid" : value;
}

function badgeClass(status: WorkflowStatus) {
  if (status === "Preparing") return "bg-orange-100 text-orange-800";
  if (status === "Packaging") return "bg-purple-100 text-purple-800";
  if (["Ready", "Delivered", "Completed"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (["Preparing", "Out For Delivery"].includes(status)) return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function normalizeStatus(value: string): WorkflowStatus {
  const map: Record<string, WorkflowStatus> = {
    pending: "New Order", new: "New Order", "new order": "New Order", paid: "Preparing",
    kitchen: "Preparing", prep: "Preparing", preparing: "Preparing", "in progress": "Preparing", cooking: "Preparing",
    packaging: "Packaging", ready: "Ready", "ready for pickup": "Ready",
    "out for delivery": "Out For Delivery", delivered: "Delivered", completed: "Completed",
  };
  return map[value.toLowerCase()] ?? "New Order";
}

function nextStatus(current: WorkflowStatus, method?: string | null): WorkflowStatus | null {
  if (current === "Ready" && !(method || "").toLowerCase().includes("delivery")) return "Completed";
  if (current === "Delivered") return "Completed";
  const index = WORKFLOW.indexOf(current);
  return index >= 0 && index < WORKFLOW.length - 1 ? WORKFLOW[index + 1] : null;
}

function eventLabel(status: WorkflowStatus) {
  const labels: Record<WorkflowStatus, string> = {
    "New Order": "Order Created", Preparing: "Kitchen Started", Packaging: "Packaging Started", Ready: "Packaging Complete",
    "Out For Delivery": "Order Out For Delivery", Delivered: "Order Delivered", Completed: "Order Completed",
  };
  return labels[status];
}

function departmentStatus(status: WorkflowStatus, department: "Kitchen" | "Packaging" | "Delivery") {
  const current = WORKFLOW.indexOf(status);
  const start = department === "Kitchen" ? 1 : department === "Packaging" ? 2 : 4;
  const end = department === "Kitchen" ? 3 : department === "Packaging" ? 3 : 6;
  return current < start ? "Waiting" : current >= end ? "Completed" : "Active";
}

function parseDetails(notes: string | null): OrderDetails {
  const text = notes || "";
  const value = (label: string, fallback: string) =>
    text.match(new RegExp(`^${label}:\\\\s*(.+)$`, "im"))?.[1]?.trim() || fallback;
  const internal = text.includes("Notes:")
    ? text.split(/Notes:\s*/i).slice(1).join("Notes:").trim()
    : text.split("\n").filter((line) => !/^(Meal Plan|Number of Meals|Pickup\/Delivery Date|Pickup\/Delivery Time|Delivery Address|Assigned Driver):/i.test(line)).join("\n").trim();
  return {
    mealPlan: "Not specified",
    pickupTime: value("Pickup/Delivery Time", "Not scheduled"),
    deliveryAddress: value("Delivery Address", "Not provided"),
    internalNotes: internal || "No internal notes.",
  };
}

function buildNotes(form: EditForm) {
  const metadata = [
    `Pickup/Delivery Date: ${form.fulfillmentDate || "Not scheduled"}`,
    `Pickup/Delivery Time: ${form.pickupTime || "Not scheduled"}`,
    `Delivery Address: ${form.deliveryAddress || "Not provided"}`,
  ];
  return form.internalNotes.trim() ? `${metadata.join("\n")}\n\nNotes:\n${form.internalNotes.trim()}` : metadata.join("\n");
}

function buildNewOrderNotes(form: NewOrderForm) {
  const metadata = [
    `Pickup/Delivery Date: ${form.fulfillmentDate}`,
    `Pickup/Delivery Time: Not scheduled`,
    `Delivery Address: ${form.deliveryMethod === "Delivery" ? form.deliveryAddress.trim() : "Not provided"}`,
  ];
  return form.notes.trim() ? `${metadata.join("\n")}\n\nNotes:\n${form.notes.trim()}` : metadata.join("\n");
}

function replaceMetadata(notes: string | null, label: string, value: string) {
  const text = notes || "";
  const expression = new RegExp(`^${label}:.*$`, "im");
  return expression.test(text) ? text.replace(expression, `${label}: ${value}`) : `${text.trim()}\n${label}: ${value}`.trim();
}

function printOrder(order: Order, customer: (Customer & { name: string }) | null, details: OrderDetails, kind: "Invoice" | "Receipt") {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html><head><title>${kind} ${order.order_number}</title><style>body{font-family:Arial;color:#081c35;margin:40px}.header{border-bottom:4px solid #d6a817;padding-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.card{border:1px solid #cbd5e1;border-radius:12px;padding:14px}.label{font-size:11px;text-transform:uppercase;color:#64748b;font-weight:700}.value{font-size:18px;font-weight:700;margin-top:5px}.total{font-size:30px}</style></head><body><div class="header"><h1>Miz Rita's Kitchen</h1><p>${kind} · ${order.order_number}</p></div><div class="grid"><div class="card"><div class="label">Customer</div><div class="value">${escapeHtml(customer?.name || "Unknown")}</div></div><div class="card"><div class="label">Order Date</div><div class="value">${shortDate(order.order_date)}</div></div><div class="card"><div class="label">Meal Plan</div><div class="value">${escapeHtml(details.mealPlan)}</div></div><div class="card"><div class="label">Meals</div><div class="value">${order.meal_count}</div></div><div class="card"><div class="label">Payment</div><div class="value">${escapeHtml(order.payment_status)}</div></div><div class="card"><div class="label">Total</div><div class="value total">${money(Number(order.total || 0))}</div></div></div><script>window.onload=()=>window.print()</script></body></html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}
