"use client";

import {
  CheckCircle2,
  ChevronRight,
  Mail,
  Pencil,
  Phone,
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
  dietary_notes: string | null;
  customer_status: string;
  created_at: string;
};

type Order = {
  id: string;
  customer_id: string;
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

type CustomerTag = {
  id: string;
  customer_id: string;
  business_id: string;
  tag: string;
  created_at: string;
};

type ProfileMetadata = {
  dietaryRestrictions: string;
  foodAllergies: string;
  address: string;
  emergencyContact: string;
  mealPreferences: string;
  deliveryPreference: string;
  pickupLocation: string;
  kitchenNotes: string;
};

type CustomerForm = ProfileMetadata & {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: string;
  internalNotes: string;
  tags: string[];
};

type NewOrderForm = {
  mealPlan: string;
  mealCount: string;
  method: string;
  fulfillmentDate: string;
  pickupTime: string;
  subtotal: string;
  notes: string;
};

const emptyMetadata: ProfileMetadata = {
  dietaryRestrictions: "",
  foodAllergies: "",
  address: "",
  emergencyContact: "",
  mealPreferences: "",
  deliveryPreference: "Pickup",
  pickupLocation: "",
  kitchenNotes: "",
};

const defaultCustomerTags = ["VIP", "High Protein", "Weight Loss", "Low Carb", "Keto", "Vegetarian", "Truck Driver", "Corporate", "Weekly Subscription", "Monthly Subscription", "Delivery", "Pickup"];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );

export default function CustomersPage() {
  const [businessId, setBusinessId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [crmNotes, setCrmNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerForm | null>(null);
  const [newOrderCustomer, setNewOrderCustomer] = useState<Customer | null>(null);
  const [newOrderForm, setNewOrderForm] = useState<NewOrderForm>({
    mealPlan: "",
    mealCount: "",
    method: "Pickup",
    fulfillmentDate: "",
    pickupTime: "",
    subtotal: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const { data: business, error: businessError } = await supabase
        .from("gbgs_businesses")
        .select("id")
        .eq("slug", "miz-ritas-kitchen")
        .maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);

      const [customerResult, orderResult, tagResult, notesResult] = await Promise.all([
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
        supabase
          .from("gbgs_customer_tags")
          .select("*")
          .eq("business_id", business.id),
        supabase
          .from("gbgs_customer_crm_notes")
          .select("customer_id, notes"),
      ]);
      if (customerResult.error || orderResult.error || tagResult.error || notesResult.error) {
        throw customerResult.error ?? orderResult.error ?? tagResult.error ?? notesResult.error;
      }
      setCustomers((customerResult.data ?? []) as Customer[]);
      setOrders((orderResult.data ?? []) as Order[]);
      setTags((tagResult.data ?? []) as CustomerTag[]);
      setCrmNotes(Object.fromEntries((notesResult.data ?? []).map((item) => [item.customer_id, item.notes || ""])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Customers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`customers-hq-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_customers", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_orders", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_customer_tags", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_customer_crm_notes" }, () => void loadData())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, loadData]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const ordersByCustomer = useMemo(() => {
    const map = new Map<string, Order[]>();
    orders.forEach((order) => map.set(order.customer_id, [...(map.get(order.customer_id) ?? []), order]));
    return map;
  }, [orders]);

  const tagMap = useMemo(() => {
    const map = new Map<string, CustomerTag[]>();
    tags.forEach((tag) => map.set(tag.customer_id, [...(map.get(tag.customer_id) ?? []), tag]));
    return map;
  }, [tags]);

  const profile = (customer: Customer) =>
    getCustomerProfile(customer, ordersByCustomer.get(customer.id) ?? [], tagMap.get(customer.id) ?? []);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const totalBalance = orders.reduce((sum, order) => sum + Number(order.balance_due || 0), 0);
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const activeSubscriptions = customers.filter((customer) => profile(customer).subscription === "Active").length;
  const cards = [
    ["Total Customers", customers.length],
    ["Active Customers", customers.filter((customer) => customer.customer_status.toLowerCase() === "active").length],
    ["New Customers This Month", customers.filter((customer) => new Date(customer.created_at).getTime() >= monthStart).length],
    ["Active Meal Subscriptions", activeSubscriptions],
    ["Outstanding Balances", money(totalBalance)],
    ["Customer Lifetime Revenue", money(totalRevenue)],
  ];

  const visibleCustomers = customers.filter((customer) => {
    const customerProfile = profile(customer);
    const customerOrders = ordersByCustomer.get(customer.id) ?? [];
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      `${customer.first_name} ${customer.last_name ?? ""}`.toLowerCase().includes(term) ||
      customer.phone?.toLowerCase().includes(term) ||
      customer.email?.toLowerCase().includes(term) ||
      customerOrders.some((order) =>
        parseOrder(order.notes).mealPlan.toLowerCase().includes(term),
      );
    if (!matchesSearch) return false;
    if (filter === "Active" || filter === "Inactive") return customer.customer_status.toLowerCase() === filter.toLowerCase();
    if (filter === "Subscription") return customerProfile.subscription !== "No Subscription";
    if (filter === "No Subscription") return customerProfile.subscription === "No Subscription";
    if (filter === "Balance Due") return customerProfile.balance > 0;
    if (filter === "Paid") return customerOrders.length > 0 && customerProfile.balance <= 0;
    if (filter === "Recent Customers") return new Date(customer.created_at).getTime() >= Date.now() - 30 * 86400000;
    return true;
  });

  const openEdit = (customer: Customer) => {
    const metadata = parseMetadata(customer.dietary_notes);
    setEditingCustomer(customer);
    setCustomerForm({
      firstName: customer.first_name,
      lastName: customer.last_name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      status: customer.customer_status,
      internalNotes: crmNotes[customer.id] ?? "",
      tags: (tagMap.get(customer.id) ?? []).map((item) => item.tag),
      ...metadata,
    });
  };

  const openNewCustomer = () => {
    setEditingCustomer({
      id: "",
      first_name: "",
      last_name: null,
      phone: null,
      email: null,
      dietary_notes: null,
      customer_status: "Active",
      created_at: new Date().toISOString(),
    });
    setCustomerForm({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      status: "Active",
      internalNotes: "",
      tags: [],
      ...emptyMetadata,
    });
  };

  const saveCustomer = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCustomer || !customerForm) return;
    setSaving(true);
    const customerValues = {
        first_name: customerForm.firstName.trim(),
        last_name: customerForm.lastName.trim() || null,
        phone: customerForm.phone.trim() || null,
        email: customerForm.email.trim() || null,
        customer_status: customerForm.status,
        dietary_notes: buildMetadata(customerForm),
      };
    let customerResult;
    if (editingCustomer.id) {
      customerResult = await supabase
        .from("gbgs_customers")
        .update(customerValues)
        .eq("id", editingCustomer.id)
        .select("*")
        .single();
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError(userError?.message || "You must be signed in.");
        setSaving(false);
        return;
      }
      customerResult = await supabase
        .from("gbgs_customers")
        .insert({ ...customerValues, business_id: businessId, created_by: user.id })
        .select("*")
        .single();
    }
    const savedCustomer = customerResult.data as Customer | null;
    const notesResult = savedCustomer
      ? await supabase
          .from("gbgs_customer_crm_notes")
          .upsert(
            {
              customer_id: savedCustomer.id,
              notes: customerForm.internalNotes.trim(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "customer_id" },
          )
      : { error: null };
    let tagsError: { message?: string } | null = null;
    if (savedCustomer && !customerResult.error && !notesResult.error) {
      const deleteResult = await supabase.from("gbgs_customer_tags").delete().eq("customer_id", savedCustomer.id).eq("business_id", businessId);
      tagsError = deleteResult.error;
      if (!tagsError && customerForm.tags.length) {
        const insertResult = await supabase.from("gbgs_customer_tags").insert(customerForm.tags.map((tag) => ({ business_id: businessId, customer_id: savedCustomer.id, tag })));
        tagsError = insertResult.error;
      }
    }
    if (customerResult.error || notesResult.error || tagsError || !savedCustomer) {
      setError(customerResult.error?.message || notesResult.error?.message || tagsError?.message || "Customer could not be saved.");
    } else {
      setCustomers((current) =>
        editingCustomer.id
          ? current.map((customer) => customer.id === savedCustomer.id ? savedCustomer : customer)
          : [savedCustomer, ...current],
      );
      setCrmNotes((current) => ({ ...current, [savedCustomer.id]: customerForm.internalNotes.trim() }));
      await loadData();
      setSelectedCustomer(savedCustomer);
      setEditingCustomer(null);
      setCustomerForm(null);
      setToast(editingCustomer.id ? "Customer updated" : "Customer created");
    }
    setSaving(false);
  };

  const setSubscription = async (customer: Customer, action: "pause" | "resume") => {
    setSaving(true);
    const customerTags = tagMap.get(customer.id) ?? [];
    const paused = customerTags.find((tag) => tag.tag.toLowerCase() === "subscription paused");
    if (action === "pause" && !paused) {
      const { error: tagError } = await supabase.from("gbgs_customer_tags").insert({
        business_id: businessId,
        customer_id: customer.id,
        tag: "Subscription Paused",
      });
      if (tagError) setError(tagError.message);
      else setToast("Subscription paused");
    } else if (action === "resume" && paused) {
      const { error: tagError } = await supabase.from("gbgs_customer_tags").delete().eq("id", paused.id);
      if (tagError) setError(tagError.message);
      else setToast("Subscription resumed");
    }
    await loadData();
    setSaving(false);
  };

  const recordPayment = async (customer: Customer) => {
    const customerOrders = (ordersByCustomer.get(customer.id) ?? [])
      .filter((order) => Number(order.balance_due || 0) > 0)
      .sort((a, b) => a.order_date.localeCompare(b.order_date));
    if (!customerOrders.length) {
      setToast("No outstanding balance");
      return;
    }
    const amountText = window.prompt("Payment amount", String(customerOrders[0].balance_due));
    if (amountText === null) return;
    let remaining = Math.max(0, Number(amountText) || 0);
    if (!remaining) return;
    setSaving(true);
    for (const order of customerOrders) {
      if (remaining <= 0) break;
      const balance = Number(order.balance_due || 0);
      const applied = Math.min(balance, remaining);
      const { error: transactionError } = await supabase.from("gbgs_payments").insert({
        business_id: businessId,
        order_id: order.id,
        customer_id: customer.id,
        invoice_number: `INV-${order.order_number}`,
        payment_method: "Cash",
        amount: applied,
        internal_notes: "Recorded from Customers HQ",
      });
      if (transactionError) {
        setError(transactionError.message);
        break;
      }
      remaining -= applied;
    }
    await loadData();
    setToast("Payment recorded");
    setSaving(false);
  };

  const createOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!newOrderCustomer) return;
    setSaving(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError(userError?.message || "You must be signed in.");
      setSaving(false);
      return;
    }
    const subtotal = Number(newOrderForm.subtotal) || 0;
    const now = new Date();
    const { data: meal, error: mealError } = await supabase.from("gbgs_menu_meals").select("id").eq("business_id", businessId).ilike("name", newOrderForm.mealPlan.trim()).maybeSingle();
    if (mealError || !meal) {
      setError(mealError?.message ?? "Select a meal that exists in Menu HQ.");
      setSaving(false);
      return;
    }
    const orderNumber = `MR-${now.toISOString().replace(/\D/g, "").slice(0, 14)}`;
    const { error: insertError } = await supabase.rpc("gbgs_create_order", {
      p_business_id: businessId,
      p_created_by: user.id,
      p_customer_id: newOrderCustomer.id,
      p_meal_id: meal.id,
      p_values: {
      order_number: orderNumber,
      order_date: now.toISOString().slice(0, 10),
      fulfillment_date: newOrderForm.fulfillmentDate || null,
      meal_count: Math.max(1, Math.floor(Number(newOrderForm.mealCount))),
      order_status: "New Order",
      payment_status: "Unpaid",
      delivery_method: newOrderForm.method,
      subtotal,
      delivery_fee: 0,
      discount: 0,
      total: subtotal,
      notes: buildOrderNotes(newOrderForm),
      },
      p_payment_amount: 0,
    });
    if (insertError) setError(insertError.message);
    else {
      setToast("Order created");
      setNewOrderCustomer(null);
      setNewOrderForm({ mealPlan: "", mealCount: "", method: "Pickup", fulfillmentDate: "", pickupTime: "", subtotal: "", notes: "" });
      await loadData();
    }
    setSaving(false);
  };

  const deleteCustomer = async (customer: Customer) => {
    const customerOrders = ordersByCustomer.get(customer.id) ?? [];
    if (customerOrders.length) {
      setError("Customers with order history cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete ${customer.first_name} ${customer.last_name ?? ""}?`)) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from("gbgs_customers").delete().eq("id", customer.id);
    if (deleteError) setError(deleteError.message);
    else {
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      setSelectedCustomer(null);
      setToast("Customer deleted");
    }
    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb] p-4 text-slate-900 md:p-8">
      <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold uppercase tracking-[0.3em] text-[#d6a817]">Miz Rita HQ</p>
          <h1 className="mt-2 text-4xl font-bold">Customers HQ</h1>
          <p className="mt-2 text-slate-300">Customer relationships, preferences, subscriptions, and history in one place.</p></div>
          <button onClick={openNewCustomer} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35]"><Plus className="mr-2 inline h-5 w-5" />New Customer</button>
        </div>
      </section>

      {error ? <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div> : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-[#081c35]">{value}</p></div>)}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-2xl font-bold text-[#081c35]">Customers</h2><p className="mt-1 text-sm text-slate-500">{visibleCustomers.length} customer{visibleCustomers.length === 1 ? "" : "s"} shown</p></div>
            <label className="flex w-full items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 lg:max-w-md"><Search className="h-5 w-5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, email, or meal plan" className="min-w-0 flex-1 outline-none" /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{["All", "Active", "Inactive", "Subscription", "No Subscription", "Balance Due", "Paid", "Recent Customers"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === item ? "bg-[#081c35] text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>)}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="bg-[#081c35] text-xs uppercase tracking-wide text-slate-300"><tr>{["Customer Name", "Phone", "Email", "Meal Plan", "Subscription", "Orders", "Lifetime Revenue", "Balance Due", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-4">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={10} className="p-10 text-center text-slate-500">Loading customers...</td></tr> : visibleCustomers.length ? visibleCustomers.map((customer) => {
                const customerProfile = profile(customer);
                return <tr key={customer.id} onClick={() => setSelectedCustomer(customer)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-4 font-bold text-[#081c35]">{customer.first_name} {customer.last_name}</td>
                  <td className="px-4 py-4">{customer.phone || "Not provided"}</td>
                  <td className="px-4 py-4">{customer.email || "Not provided"}</td>
                  <td className="px-4 py-4">{customerProfile.currentMealPlan}</td>
                  <td className="px-4 py-4"><Badge value={customerProfile.subscription} /></td>
                  <td className="px-4 py-4 font-bold">{customerProfile.orders}</td>
                  <td className="px-4 py-4 font-bold">{money(customerProfile.revenue)}</td>
                  <td className={`px-4 py-4 font-bold ${customerProfile.balance > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(customerProfile.balance)}</td>
                  <td className="px-4 py-4"><Badge value={customer.customer_status} /></td>
                  <td className="px-4 py-4"><button onClick={(event) => { event.stopPropagation(); setSelectedCustomer(customer); }} className="flex items-center gap-1 rounded-xl border px-3 py-2 font-bold">Open <ChevronRight className="h-4 w-4" /></button></td>
                </tr>;
              }) : <tr><td colSpan={10} className="p-10 text-center text-slate-500">No customers match this search or filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCustomer ? <CustomerProfile
        customer={selectedCustomer}
        orders={ordersByCustomer.get(selectedCustomer.id) ?? []}
        tags={tagMap.get(selectedCustomer.id) ?? []}
        internalNotes={crmNotes[selectedCustomer.id] ?? ""}
        saving={saving}
        onClose={() => setSelectedCustomer(null)}
        onNewOrder={() => setNewOrderCustomer(selectedCustomer)}
        onEdit={() => openEdit(selectedCustomer)}
        onSubscription={(action) => void setSubscription(selectedCustomer, action)}
        onPayment={() => void recordPayment(selectedCustomer)}
        onDelete={() => void deleteCustomer(selectedCustomer)}
      /> : null}

      {editingCustomer && customerForm ? <CustomerEditModal form={customerForm} saving={saving} onChange={setCustomerForm} onClose={() => { setEditingCustomer(null); setCustomerForm(null); }} onSave={saveCustomer} /> : null}
      {newOrderCustomer ? <NewOrderModal customer={newOrderCustomer} form={newOrderForm} saving={saving} onChange={setNewOrderForm} onClose={() => setNewOrderCustomer(null)} onSave={createOrder} /> : null}

      {toast ? <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl bg-[#081c35] px-5 py-4 font-bold text-white shadow-2xl"><CheckCircle2 className="h-5 w-5 text-[#d6a817]" />{toast}</div> : null}
    </main>
  );
}

function CustomerProfile({ customer, orders, tags, internalNotes, saving, onClose, onNewOrder, onEdit, onSubscription, onPayment, onDelete }: {
  customer: Customer;
  orders: Order[];
  tags: CustomerTag[];
  internalNotes: string;
  saving: boolean;
  onClose: () => void;
  onNewOrder: () => void;
  onEdit: () => void;
  onSubscription: (action: "pause" | "resume") => void;
  onPayment: () => void;
  onDelete: () => void;
}) {
  const metadata = parseMetadata(customer.dietary_notes);
  const profile = getCustomerProfile(customer, orders, tags);
  const subscriptionPaused = tags.some((tag) => tag.tag.toLowerCase() === "subscription paused");
  const sortedOrders = [...orders].sort((a, b) => b.order_date.localeCompare(a.order_date));
  const phone = customer.phone?.replace(/\D/g, "") || "";
  const activity = [
    ...sortedOrders.slice(0, 8).map((order) => ({ id: order.id, date: order.created_at || order.order_date, label: `Order ${order.order_number}`, detail: `${order.order_status} · ${money(Number(order.total || 0))}` })),
    { id: "created", date: customer.created_at, label: "Customer Added", detail: customer.customer_status },
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
    <div className="h-full w-full max-w-4xl overflow-y-auto bg-[#f4f6fb] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Customer Profile</p><h2 className="mt-1 text-2xl font-bold text-[#081c35]">{customer.first_name} {customer.last_name}</h2><div className="mt-2 flex flex-wrap gap-2">{tags.map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">🏷️ {item.tag}</span>)}</div></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X /></button></header>
      <div className="space-y-5 p-5">
        <section className="rounded-3xl bg-[#081c35] p-6 text-white"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-3xl font-bold">{customer.first_name} {customer.last_name}</h3><div className="mt-3 flex gap-2"><Badge value={customer.customer_status} /><Badge value={profile.subscription} /></div></div><div className="text-left sm:text-right"><p className="text-sm text-slate-300">Lifetime Revenue</p><p className="text-3xl font-bold">{money(profile.revenue)}</p></div></div></section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Orders", profile.orders], ["Average Order", money(profile.averageOrder)], ["Outstanding", money(profile.balance)], ["Last Order", profile.lastOrder ? date(profile.lastOrder) : "No orders"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</section>

        <ProfileSection title="Customer Information" rows={[["Phone", customer.phone || "Not provided"], ["Email", customer.email || "Not provided"], ["Address", metadata.address || "Not provided"], ["Emergency Contact", metadata.emergencyContact || "Not provided"]]} />
        <ProfileSection title="Meal & Delivery Preferences" rows={[["Dietary Restrictions", metadata.dietaryRestrictions || "None"], ["Food Allergies", metadata.foodAllergies || "None"], ["Favorite Meals", profile.favoriteMeals.join(", ") || "Not established"], ["Meal Preferences", metadata.mealPreferences || "None"], ["Subscription Status", profile.subscription], ["Delivery Preference", metadata.deliveryPreference || "Not set"], ["Pickup Location", metadata.pickupLocation || "Not set"]]} />

        <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Payment History</h3><HistoryTable headings={["Date", "Order", "Amount Paid", "Balance"]} rows={sortedOrders.filter((order) => Number(order.amount_paid || 0) > 0).map((order) => [date(order.order_date), order.order_number, money(Number(order.amount_paid || 0)), money(Number(order.balance_due || 0))])} empty="No payments recorded." /></section>
        <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Order History</h3><HistoryTable headings={["Date", "Order", "Meal Plan", "Status", "Total"]} rows={sortedOrders.map((order) => [date(order.order_date), order.order_number, parseOrder(order.notes).mealPlan, order.order_status, money(Number(order.total || 0))])} empty="No orders recorded." /></section>
        <ProfileSection title="Kitchen & Staff Notes" rows={[["Kitchen Notes", metadata.kitchenNotes || "None"], ["Internal Staff Notes", internalNotes || "None"]]} />
        <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Activity Timeline</h3><div className="mt-5 space-y-4">{activity.map((item) => <div key={item.id} className="grid grid-cols-[90px_12px_1fr] gap-3"><p className="text-xs font-bold text-slate-500">{date(item.date)}</p><span className="mt-1 h-3 w-3 rounded-full bg-[#d6a817]" /><div><p className="font-bold">{item.label}</p><p className="text-sm text-slate-500">{item.detail}</p></div></div>)}</div></section>

        <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">Quick Actions</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickButton icon={<Plus />} label="New Order" onClick={onNewOrder} />
          <QuickButton icon={<Pencil />} label="Edit Customer" onClick={onEdit} />
          <QuickButton icon={<CheckCircle2 />} label={subscriptionPaused ? "Resume Subscription" : "Pause Subscription"} onClick={() => onSubscription(subscriptionPaused ? "resume" : "pause")} />
          <QuickButton icon={<CheckCircle2 />} label="Record Payment" onClick={onPayment} />
          <QuickButton icon={<Printer />} label="Print Customer Summary" onClick={() => printCustomer(customer, orders, metadata, internalNotes)} />
          <QuickButton icon={<Phone />} label="Call" href={phone ? `tel:${phone}` : undefined} />
          <QuickButton icon={<Mail />} label="Email" href={customer.email ? `mailto:${customer.email}` : undefined} />
          <QuickButton icon={<Phone />} label="Text" href={phone ? `sms:${phone}` : undefined} />
          <QuickButton icon={<Trash2 />} label="Delete Customer" onClick={onDelete} danger />
        </div><p className="mt-3 text-xs text-slate-500">{saving ? "Saving changes..." : ""}</p></section>
      </div>
    </div>
  </div>;
}

function CustomerEditModal({ form, saving, onChange, onClose, onSave }: { form: CustomerForm; saving: boolean; onChange: (form: CustomerForm) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  const [customTag, setCustomTag] = useState("");
  const field = (key: Exclude<keyof CustomerForm, "tags">, value: string) => onChange({ ...form, [key]: value });
  const addTag = (tag: string) => {
    const normalized = tag.trim();
    if (!normalized || form.tags.some((item) => item.toLowerCase() === normalized.toLowerCase())) return;
    onChange({ ...form, tags: [...form.tags, normalized] });
    setCustomTag("");
  };
  const removeTag = (tag: string) => onChange({ ...form, tags: form.tags.filter((item) => item !== tag) });
  return <Modal title="Edit Customer" onClose={onClose}><form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
    <Field label="First Name"><input required value={form.firstName} onChange={(event) => field("firstName", event.target.value)} className="customer-input" /></Field>
    <Field label="Last Name"><input value={form.lastName} onChange={(event) => field("lastName", event.target.value)} className="customer-input" /></Field>
    <Field label="Phone"><input value={form.phone} onChange={(event) => field("phone", event.target.value)} className="customer-input" /></Field>
    <Field label="Email"><input type="email" value={form.email} onChange={(event) => field("email", event.target.value)} className="customer-input" /></Field>
    <Field label="Address"><input value={form.address} onChange={(event) => field("address", event.target.value)} className="customer-input" /></Field>
    <Field label="Emergency Contact"><input value={form.emergencyContact} onChange={(event) => field("emergencyContact", event.target.value)} className="customer-input" /></Field>
    <Field label="Dietary Restrictions"><textarea value={form.dietaryRestrictions} onChange={(event) => field("dietaryRestrictions", event.target.value)} className="customer-input" /></Field>
    <Field label="Food Allergies"><textarea value={form.foodAllergies} onChange={(event) => field("foodAllergies", event.target.value)} className="customer-input" /></Field>
    <Field label="Meal Preferences"><textarea value={form.mealPreferences} onChange={(event) => field("mealPreferences", event.target.value)} className="customer-input" /></Field>
    <Field label="Kitchen Notes"><textarea value={form.kitchenNotes} onChange={(event) => field("kitchenNotes", event.target.value)} className="customer-input" /></Field>
    <Field label="Delivery Preference"><select value={form.deliveryPreference} onChange={(event) => field("deliveryPreference", event.target.value)} className="customer-input"><option>Pickup</option><option>Delivery</option></select></Field>
    <Field label="Pickup Location"><input value={form.pickupLocation} onChange={(event) => field("pickupLocation", event.target.value)} className="customer-input" /></Field>
    <Field label="Status"><select value={form.status} onChange={(event) => field("status", event.target.value)} className="customer-input"><option>Active</option><option>Inactive</option></select></Field>
    <Field label="Internal Staff Notes"><textarea value={form.internalNotes} onChange={(event) => field("internalNotes", event.target.value)} className="customer-input" /></Field>
    <section className="sm:col-span-2"><p className="mb-2 text-sm font-bold">Customer Tags</p><div className="flex flex-wrap gap-2">{form.tags.map((tag) => <button key={tag} type="button" onClick={() => removeTag(tag)} className="rounded-full bg-[#081c35] px-3 py-1.5 text-xs font-bold text-white">{tag} <X className="ml-1 inline h-3 w-3" /></button>)}</div><div className="mt-3 flex flex-wrap gap-2">{defaultCustomerTags.filter((tag) => !form.tags.some((item) => item.toLowerCase() === tag.toLowerCase())).map((tag) => <button key={tag} type="button" onClick={() => addTag(tag)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">+ {tag}</button>)}</div><div className="mt-3 flex gap-2"><input value={customTag} onChange={(event) => setCustomTag(event.target.value)} placeholder="Add custom tag" className="customer-input" /><button type="button" onClick={() => addTag(customTag)} className="rounded-xl border px-4 py-2 font-bold">Add Tag</button></div></section>
    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35] disabled:opacity-50">{saving ? "Saving..." : "Save Customer"}</button></div>
  </form></Modal>;
}

function NewOrderModal({ customer, form, saving, onChange, onClose, onSave }: { customer: Customer; form: NewOrderForm; saving: boolean; onChange: (form: NewOrderForm) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  const field = (key: keyof NewOrderForm, value: string) => onChange({ ...form, [key]: value });
  return <Modal title={`New Order · ${customer.first_name}`} onClose={onClose}><form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
    <Field label="Meal Plan"><input required value={form.mealPlan} onChange={(event) => field("mealPlan", event.target.value)} className="customer-input" /></Field>
    <Field label="Meal Count"><input required type="number" min="1" value={form.mealCount} onChange={(event) => field("mealCount", event.target.value)} className="customer-input" /></Field>
    <Field label="Pickup / Delivery"><select value={form.method} onChange={(event) => field("method", event.target.value)} className="customer-input"><option>Pickup</option><option>Delivery</option></select></Field>
    <Field label="Fulfillment Date"><input required type="date" value={form.fulfillmentDate} onChange={(event) => field("fulfillmentDate", event.target.value)} className="customer-input" /></Field>
    <Field label="Pickup Time"><input type="time" value={form.pickupTime} onChange={(event) => field("pickupTime", event.target.value)} className="customer-input" /></Field>
    <Field label="Subtotal"><input required type="number" min="0" step="0.01" value={form.subtotal} onChange={(event) => field("subtotal", event.target.value)} className="customer-input" /></Field>
    <div className="sm:col-span-2"><Field label="Internal Notes"><textarea rows={3} value={form.notes} onChange={(event) => field("notes", event.target.value)} className="customer-input" /></Field></div>
    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold text-[#081c35] disabled:opacity-50">{saving ? "Creating..." : "Create Order"}</button></div>
  </form></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4"><div className="mx-auto my-8 max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#081c35] p-6 text-white"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6a817]">Customers HQ</p><h2 className="mt-1 text-2xl font-bold">{title}</h2></div><button onClick={onClose}><X /></button></header><div className="p-6">{children}</div></div><style jsx global>{`.customer-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;outline:none}.customer-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}`}</style></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>;
}

function ProfileSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-[#081c35]">{title}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap font-bold">{value}</p></div>)}</div></section>;
}

function HistoryTable({ headings, rows, empty }: { headings: string[]; rows: string[][]; empty: string }) {
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr>{headings.map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row[1]}-${index}`} className="border-b border-slate-100">{row.map((value, cell) => <td key={`${cell}-${value}`} className="px-3 py-4">{value}</td>)}</tr>) : <tr><td colSpan={headings.length} className="p-8 text-center text-slate-500">{empty}</td></tr>}</tbody></table></div>;
}

function QuickButton({ icon, label, onClick, href, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const classes = `flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-[#081c35] hover:bg-slate-50"}`;
  return href ? <a href={href} className={classes}><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</a> : <button onClick={onClick} className={classes}><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</button>;
}

function Badge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const style = ["active", "weekly", "bi-weekly", "monthly"].some((item) => normalized.includes(item)) && !normalized.includes("paused") ? "bg-emerald-100 text-emerald-800" : normalized.includes("paused") ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${style}`}>{value}</span>;
}

function getCustomerProfile(customer: Customer, orders: Order[], tags: CustomerTag[]) {
  const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const balance = orders.reduce((sum, order) => sum + Number(order.balance_due || 0), 0);
  const favoriteCounts = orders.reduce<Record<string, number>>((counts, order) => {
    const plan = parseOrder(order.notes).mealPlan;
    if (plan !== "Not specified") counts[plan] = (counts[plan] || 0) + 1;
    return counts;
  }, {});
  const favoriteMeals = Object.entries(favoriteCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([meal]) => meal);
  const subscriptionTag = tags.find((tag) => ["weekly", "bi-weekly", "monthly"].includes(tag.tag.toLowerCase()));
  const paused = tags.some((tag) => tag.tag.toLowerCase() === "subscription paused");
  const cancelled = tags.some((tag) => tag.tag.toLowerCase() === "subscription cancelled");
  const subscription = cancelled ? "Cancelled" : paused ? "Paused" : subscriptionTag ? "Active" : "No Subscription";
  const latestOrder = [...orders].sort((a, b) => b.order_date.localeCompare(a.order_date))[0] ?? null;
  const lastOrder = latestOrder?.order_date ?? null;
  const currentMealPlan = latestOrder ? parseOrder(latestOrder.notes).mealPlan : "Not established";
  return { orders: orders.length, revenue, balance, averageOrder: orders.length ? revenue / orders.length : 0, favoriteMeals, subscription, lastOrder, currentMealPlan };
}

function parseMetadata(notes: string | null): ProfileMetadata {
  const text = notes || "";
  const jsonPrefix = "GBGS_CUSTOMER_PROFILE_V1:";
  if (text.startsWith(jsonPrefix)) {
    try {
      const parsed = JSON.parse(text.slice(jsonPrefix.length)) as Partial<ProfileMetadata>;
      return Object.fromEntries(Object.keys(emptyMetadata).map((key) => [key, typeof parsed[key as keyof ProfileMetadata] === "string" ? parsed[key as keyof ProfileMetadata] : emptyMetadata[key as keyof ProfileMetadata]])) as ProfileMetadata;
    } catch {
      return { ...emptyMetadata };
    }
  }
  const labels = ["Dietary Restrictions", "Food Allergies", "Address", "Emergency Contact", "Meal Preferences", "Delivery Preference", "Pickup Location", "Kitchen Notes"];
  const labelPattern = labels.join("|");
  const value = (label: string) => text.match(new RegExp(`(?:^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n(?:${labelPattern}):|$)`, "i"))?.[1]?.trim() || "";
  const structured = /^(Dietary Restrictions|Food Allergies|Address|Emergency Contact|Meal Preferences|Delivery Preference|Pickup Location|Kitchen Notes):/im.test(text);
  return {
    dietaryRestrictions: structured ? value("Dietary Restrictions") : text,
    foodAllergies: value("Food Allergies"),
    address: value("Address"),
    emergencyContact: value("Emergency Contact"),
    mealPreferences: value("Meal Preferences"),
    deliveryPreference: value("Delivery Preference") || "Pickup",
    pickupLocation: value("Pickup Location"),
    kitchenNotes: value("Kitchen Notes"),
  };
}

function buildMetadata(form: CustomerForm) {
  const metadata: ProfileMetadata = {
    dietaryRestrictions: form.dietaryRestrictions.trim(),
    foodAllergies: form.foodAllergies.trim(),
    address: form.address.trim(),
    emergencyContact: form.emergencyContact.trim(),
    mealPreferences: form.mealPreferences.trim(),
    deliveryPreference: form.deliveryPreference,
    pickupLocation: form.pickupLocation.trim(),
    kitchenNotes: form.kitchenNotes.trim(),
  };
  return `GBGS_CUSTOMER_PROFILE_V1:${JSON.stringify(metadata)}`;
}

function parseOrder(notes: string | null) {
  const text = notes || "";
  return { mealPlan: text.match(/^Meal Plan:\s*(.+)$/im)?.[1]?.trim() || "Not specified" };
}

function buildOrderNotes(form: NewOrderForm) {
  const metadata = [`Pickup/Delivery Date: ${form.fulfillmentDate}`, `Pickup/Delivery Time: ${form.pickupTime || "Not scheduled"}`];
  return form.notes.trim() ? `${metadata.join("\n")}\n\nNotes:\n${form.notes.trim()}` : metadata.join("\n");
}

function printCustomer(customer: Customer, orders: Order[], metadata: ProfileMetadata, internalNotes: string) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const balance = orders.reduce((sum, order) => sum + Number(order.balance_due || 0), 0);
  printWindow.document.write(`<!doctype html><html><head><title>Customer Summary</title><style>body{font-family:Arial;color:#081c35;margin:40px}.header{border-bottom:4px solid #d6a817;padding-bottom:18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0}.card{border:1px solid #cbd5e1;border-radius:12px;padding:14px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}</style></head><body><div class="header"><h1>${escapeHtml(`${customer.first_name} ${customer.last_name ?? ""}`)}</h1><p>${escapeHtml(customer.phone || "No phone")} · ${escapeHtml(customer.email || "No email")}</p></div><div class="grid"><div class="card"><b>Orders</b><br>${orders.length}</div><div class="card"><b>Lifetime Revenue</b><br>${money(revenue)}</div><div class="card"><b>Balance</b><br>${money(balance)}</div></div><h2>Preferences</h2><p>${escapeHtml(metadata.mealPreferences || "None")}</p><h2>Internal Notes</h2><p>${escapeHtml(internalNotes || "None")}</p><h2>Orders</h2><table><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${escapeHtml(order.order_number)}</td><td>${date(order.order_date)}</td><td>${escapeHtml(order.order_status)}</td><td>${money(Number(order.total || 0))}</td></tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}
