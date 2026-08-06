"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type View = "Month" | "Week" | "Day";
type Customer = { id: string; first_name: string; last_name: string | null; phone: string | null };
type Order = { id: string; customer_id: string; order_number: string; meal_count: number; fulfillment_date: string | null; order_status: string; production_status: string | null; payment_status: string; balance_due: number; delivery_method: string | null; notes: string | null };
type Delivery = { id: string; order_id: string; delivery_type: "Pickup" | "Delivery"; driver_name: string | null; driver_phone: string | null; status: string; scheduled_at: string | null; address: string | null; notes: string | null };
type ManualEvent = { id: string; user_id: string; title: string; event_date: string; start_time: string | null; end_time: string | null; location: string | null; notes: string | null; completed: boolean; created_at: string; updated_at: string; source: string | null; source_id: string | null; category: string | null };
type CalendarEvent = {
  id: string; source: "manual" | "order" | "delivery"; title: string; type: string; startsAt: string;
  customer?: Customer; order?: Order; delivery?: Delivery; notes: string; status: string;
};
type EventForm = { title: string; type: "Special Event" | "Appointment" | "Payment Due" | "Fulfillment"; date: string; time: string; endTime: string; customerId: string; orderId: string; notes: string; status: string };

const blankForm: EventForm = { title: "", type: "Special Event", date: localKey(new Date()), time: "09:00", endTime: "10:00", customerId: "", orderId: "", notes: "", status: "Scheduled" };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const sameDay = (value: string, date: Date) => localKey(new Date(value)) === localKey(date);

export default function CalendarPage() {
  const [businessId, setBusinessId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [manualEvents, setManualEvents] = useState<ManualEvent[]>([]);
  const [view, setView] = useState<View>("Month");
  const [focusDate, setFocusDate] = useState(new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editor, setEditor] = useState<"new" | ManualEvent | null>(null);
  const [form, setForm] = useState<EventForm>(blankForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw authError ?? new Error("You must be signed in.");
      const { data: business, error: businessError } = await supabase.from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);
      const [customerResult, orderResult, deliveryResult, eventResult] = await Promise.all([
        supabase.from("gbgs_customers").select("id, first_name, last_name, phone").eq("business_id", business.id),
        supabase.from("gbgs_orders").select("id, customer_id, order_number, meal_count, fulfillment_date, order_status, production_status, payment_status, balance_due, delivery_method, notes").eq("business_id", business.id),
        supabase.from("gbgs_deliveries").select("id, order_id, delivery_type, driver_name, driver_phone, status, scheduled_at, address, notes").eq("business_id", business.id),
        supabase.from("gbgs_calendar_events").select("*").eq("user_id", user.id).order("event_date").order("start_time"),
      ]);
      const firstError = customerResult.error ?? orderResult.error ?? deliveryResult.error ?? eventResult.error;
      if (firstError) throw firstError;
      setCustomers((customerResult.data ?? []) as Customer[]);
      setOrders((orderResult.data ?? []) as Order[]);
      setDeliveries((deliveryResult.data ?? []) as Delivery[]);
      setManualEvents((eventResult.data ?? []) as ManualEvent[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Calendar could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`calendar-hq-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_calendar_events" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_orders", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_deliveries", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadData]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2500); return () => window.clearTimeout(timer); }, [toast]);

  const events = useMemo<CalendarEvent[]>(() => {
    const customer = (id: string) => customers.find((item) => item.id === id);
    const mapped: CalendarEvent[] = manualEvents.map((event) => {
      const order = event.source === "Order" ? orders.find((item) => item.id === event.source_id) : undefined;
      const delivery = deliveries.find((item) => item.order_id === order?.id);
      const fulfillment = event.source === "Order";
      const startsAt = combineDateTime(event.event_date, event.start_time ?? "12:00");
      const type = fulfillment ? delivery?.delivery_type ?? order?.delivery_method ?? "Pickup" : event.category ?? "Special Event";
      return { id: `${fulfillment ? "fulfillment" : "manual"}-${event.id}`, source: fulfillment ? "delivery" : "manual", title: fulfillment ? type : event.title, type, startsAt, customer: customer(order?.customer_id ?? ""), order, delivery, notes: event.notes ?? "", status: fulfillment ? delivery?.status ?? productionStatus(order) : event.completed ? "Completed" : "Scheduled" };
    });
    const linkedFulfillmentOrders = new Set(manualEvents.filter((event) => event.source === "Order" && event.source_id).map((event) => event.source_id));
    orders.forEach((order) => {
      if (!order.fulfillment_date) return;
      const details = parseNotes(order.notes);
      const at = combineDateTime(order.fulfillment_date, details.pickupTime);
      const orderCustomer = customer(order.customer_id);
      const delivery = deliveries.find((item) => item.order_id === order.id);
      mapped.push({ id: `kitchen-${order.id}`, source: "order", title: "Kitchen", type: "Kitchen Production", startsAt: combineDateTime(order.fulfillment_date, "08:00"), customer: orderCustomer, order, notes: details.notes, status: productionStatus(order) });
      mapped.push({ id: `due-${order.id}`, source: "order", title: `Order Due · ${order.order_number}`, type: "Order Due", startsAt: at, customer: orderCustomer, order, notes: details.notes, status: order.order_status });
      if (delivery && !linkedFulfillmentOrders.has(order.id)) mapped.push({ id: `fulfillment-${order.id}`, source: "delivery", title: delivery.delivery_type, type: delivery.delivery_type, startsAt: delivery.scheduled_at ?? at, customer: orderCustomer, order, delivery, notes: delivery.notes ?? details.notes, status: delivery.status });
      if (Number(order.balance_due) > 0) mapped.push({ id: `payment-${order.id}`, source: "order", title: `Payment Due · ${order.order_number}`, type: "Payment Due", startsAt: at, customer: orderCustomer, order, notes: `Balance due: $${Number(order.balance_due).toFixed(2)}`, status: order.payment_status });
    });
    return mapped.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [customers, orders, deliveries, manualEvents]);

  const today = new Date();
  const todayEvents = events.filter((event) => sameDay(event.startsAt, today));
  const late = events.filter((event) => event.type === "Order Due" && new Date(event.startsAt) < today && !["Completed", "Delivered", "Cancelled"].includes(event.status));
  const shift = (amount: number) => setFocusDate((current) => {
    const next = new Date(current);
    if (view === "Month") next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount * (view === "Week" ? 7 : 1));
    return next;
  });
  const openNew = (date = focusDate) => { setForm({ ...blankForm, date: localKey(date) }); setEditor("new"); };
  const openEdit = (event: CalendarEvent) => {
    if (event.source !== "manual") return;
    const record = manualEvents.find((item) => `manual-${item.id}` === event.id);
    if (!record) return;
    setForm({ title: record.title, type: (record.category as EventForm["type"]) ?? "Special Event", date: record.event_date, time: record.start_time?.slice(0,5) ?? "09:00", endTime: record.end_time?.slice(0,5) ?? "10:00", customerId: "", orderId: record.source === "Order" ? record.source_id ?? "" : "", notes: record.notes ?? "", status: record.completed ? "Completed" : "Scheduled" });
    setEditor(record);
  };
  const saveEvent = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be signed in."); setSaving(false); return; }
    const values = { user_id: user.id, title: form.title.trim(), event_date: form.date, start_time: form.time || null, end_time: form.endTime || null, location: null, notes: form.notes.trim() || null, completed: form.status === "Completed", source: form.orderId ? "Order" : "Manual", source_id: form.orderId || null, category: form.type, updated_at: new Date().toISOString() };
    const result = editor === "new" ? await supabase.from("gbgs_calendar_events").insert(values) : await supabase.from("gbgs_calendar_events").update(values).eq("id", editor!.id);
    if (result.error) setError(result.error.message); else { setToast(editor === "new" ? "Event created" : "Event updated"); setEditor(null); await loadData(); }
    setSaving(false);
  };
  const deleteEvent = async (event: CalendarEvent) => {
    if (event.source !== "manual" || !window.confirm("Delete this event?")) return;
    const { error: deleteError } = await supabase.from("gbgs_calendar_events").delete().eq("id", event.id.replace("manual-", ""));
    if (deleteError) setError(deleteError.message); else { setToast("Event deleted"); setSelected(null); await loadData(); }
  };

  return <main className="lg:ml-64 min-h-screen bg-slate-100 p-4 text-[#081c35] sm:p-6">
    {toast && <div className="fixed right-5 top-5 z-[80] rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-xl">{toast}</div>}
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-[#d6a817]">Miz Rita HQ</p><h1 className="mt-1 text-3xl font-bold">Calendar HQ</h1><p className="mt-1 text-slate-600">Orders, production, pickups, deliveries, and appointments in one place.</p></div><div className="flex gap-2"><button onClick={() => printSchedule(events, "Daily", focusDate)} className="rounded-xl border bg-white px-4 py-3 font-bold"><Printer className="mr-2 inline h-4 w-4" />Daily</button><button onClick={() => printSchedule(events, "Weekly", focusDate)} className="rounded-xl border bg-white px-4 py-3 font-bold"><Printer className="mr-2 inline h-4 w-4" />Weekly</button><button onClick={() => openNew()} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold"><Plus className="mr-2 inline h-4 w-4" />Create Event</button></div></header>
    {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_300px]">
      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div className="flex items-center gap-2"><button onClick={() => shift(-1)} className="rounded-lg border p-2"><ChevronLeft /></button><button onClick={() => setFocusDate(new Date())} className="rounded-lg border px-3 py-2 font-bold">Today</button><button onClick={() => shift(1)} className="rounded-lg border p-2"><ChevronRight /></button><h2 className="ml-2 text-xl font-bold">{viewLabel(focusDate, view)}</h2></div><div className="flex rounded-xl bg-slate-100 p-1">{(["Month", "Week", "Day"] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === item ? "bg-[#081c35] text-white" : "text-slate-600"}`}>{item}</button>)}</div></div>
        {loading ? <p className="p-16 text-center text-slate-500">Loading calendar...</p> : <CalendarView view={view} focusDate={focusDate} events={events} onEvent={setSelected} onDay={(date) => { setFocusDate(date); setView("Day"); }} />}
      </section>
      <aside className="space-y-4"><div className="rounded-3xl bg-[#081c35] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Today</p><h2 className="mt-1 text-2xl font-bold">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(today)}</h2></div>
        {[["Today's Pickups", "Pickup"], ["Today's Deliveries", "Delivery"], ["Today's Kitchen Production", "Kitchen Production"], ["Today's Appointments", "Appointment"]].map(([label, type]) => <TodayGroup key={type} label={label} events={todayEvents.filter((event) => event.type === type)} onSelect={setSelected} />)}
        <TodayGroup label="Late Orders" events={late} onSelect={setSelected} late />
      </aside>
    </div>
    {selected && <EventProfile event={selected} onClose={() => setSelected(null)} onEdit={() => openEdit(selected)} onDelete={() => void deleteEvent(selected)} />}
    {editor && <EventEditor form={form} customers={customers} orders={orders} saving={saving} onChange={setForm} onClose={() => setEditor(null)} onSave={(event) => void saveEvent(event)} />}
  </main>;
}

function CalendarView({ view, focusDate, events, onEvent, onDay }: { view: View; focusDate: Date; events: CalendarEvent[]; onEvent: (event: CalendarEvent) => void; onDay: (date: Date) => void }) {
  if (view === "Month") {
    const start = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1); start.setDate(start.getDate() - start.getDay());
    const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
    return <div><div className="grid grid-cols-7 border-b bg-slate-50">{weekdays.map((day) => <div key={day} className="p-3 text-center text-xs font-bold uppercase text-slate-500">{day}</div>)}</div><div className="grid grid-cols-7">{days.map((date) => <div key={date.toISOString()} onDoubleClick={() => onDay(date)} className={`min-h-28 border-b border-r p-2 ${date.getMonth() !== focusDate.getMonth() ? "bg-slate-50 text-slate-400" : ""}`}><button onClick={() => onDay(date)} className={`mb-1 h-7 w-7 rounded-full text-sm font-bold ${sameDay(date.toISOString(), new Date()) ? "bg-[#d6a817]" : ""}`}>{date.getDate()}</button><div className="space-y-1">{events.filter((event) => sameDay(event.startsAt, date)).slice(0, 4).map((event) => <EventChip key={event.id} event={event} onClick={() => onEvent(event)} />)}</div></div>)}</div></div>;
  }
  const start = startOfWeek(focusDate);
  const days = view === "Week" ? Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; }) : [focusDate];
  return <div className={`grid ${view === "Week" ? "grid-cols-1 md:grid-cols-7" : "grid-cols-1"}`}>{days.map((date) => <div key={localKey(date)} className="min-h-[520px] border-r p-3"><button onClick={() => onDay(date)} className="mb-4 w-full border-b pb-3 text-center font-bold">{weekdays[date.getDay()]} <span className="block text-2xl">{date.getDate()}</span></button><div className="space-y-2">{events.filter((event) => sameDay(event.startsAt, date)).map((event) => <button key={event.id} onClick={() => onEvent(event)} className={`w-full rounded-xl border-l-4 p-3 text-left text-sm shadow-sm ${eventColor(event)}`}><EventSummary event={event} /><p className="mt-1 opacity-75">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt))}</p></button>)}</div></div>)}</div>;
}
function EventSummary({ event }: { event: CalendarEvent }) { return <div className="leading-tight"><p className="font-bold">{event.type === "Kitchen Production" ? "Kitchen" : event.title}</p>{event.customer && <p className="mt-1">{customerName(event.customer)}</p>}{event.order && <p>{event.order.order_number}</p>}{event.type === "Delivery" && <p>Driver: {event.delivery?.driver_name || "Not Assigned"}</p>}<p>Status: {event.status}</p></div>; }
function EventChip({ event, onClick }: { event: CalendarEvent; onClick: () => void }) { return <button onClick={onClick} className={`block w-full rounded-md border-l-4 px-2 py-1 text-left text-[11px] ${eventColor(event)}`}><EventSummary event={event} /></button>; }
function TodayGroup({ label, events, onSelect, late }: { label: string; events: CalendarEvent[]; onSelect: (event: CalendarEvent) => void; late?: boolean }) { return <section className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-bold">{label}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${late ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>{events.length}</span></div><div className="mt-3 space-y-2">{events.slice(0, 5).map((event) => <button key={event.id} onClick={() => onSelect(event)} className="block w-full rounded-lg bg-slate-50 p-2 text-left text-sm"><EventSummary event={event} /><p className="mt-1 text-xs text-slate-500">{dateTime(event.startsAt)}</p></button>)}{!events.length && <p className="text-sm text-slate-400">Nothing scheduled.</p>}</div></section>; }

function EventProfile({ event, onClose, onEdit, onDelete }: { event: CalendarEvent; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const details = parseNotes(event.order?.notes ?? null);
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"><div className="h-full w-full max-w-2xl overflow-y-auto bg-slate-100 shadow-2xl"><header className="flex items-center justify-between bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">{event.type}</p><h2 className="text-2xl font-bold">{event.title}</h2></div><button onClick={onClose}><X /></button></header><div className="space-y-5 p-5"><section className={`rounded-3xl border-l-8 p-6 shadow-sm ${eventColor(event)}`}><p className="text-lg font-bold">{dateTime(event.startsAt)}</p><p className="mt-1">{event.status}</p></section><Info rows={[["Customer", customerName(event.customer)], ["Order Number", event.order?.order_number ?? "Not linked"], ["Meal Plan", details.mealPlan], ["Meal Count", event.order ? String(event.order.meal_count) : "Not linked"], ["Pickup or Delivery", event.delivery?.delivery_type ?? event.order?.delivery_method ?? "Not linked"], ["Driver", event.delivery?.driver_name || "Not Assigned"], ["Address", event.delivery?.address ?? details.address], ["Phone Number", event.customer?.phone ?? "Not provided"], ["Notes", event.notes || details.notes || "None"], ["Status", event.status]]} /><section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm sm:grid-cols-2">{event.source === "manual" && <><Action icon={<Pencil />} label="Edit Event" onClick={onEdit} /><Action icon={<Trash2 />} label="Delete Event" onClick={onDelete} danger /></>} {event.order && <Link className="rounded-xl bg-[#081c35] px-4 py-3 text-center font-bold text-white" href="/dashboard/miz-rita/orders">Open Order</Link>}{event.customer && <Link className="rounded-xl border px-4 py-3 text-center font-bold" href="/dashboard/miz-rita/customers">Open Customer</Link>}</section></div></div></div>;
}
function EventEditor({ form, customers, orders, saving, onChange, onClose, onSave }: { form: EventForm; customers: Customer[]; orders: Order[]; saving: boolean; onChange: (form: EventForm) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  const field = (key: keyof EventForm, value: string) => onChange({ ...form, [key]: value });
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4"><form onSubmit={onSave} className="mx-auto my-10 max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Calendar HQ</p><h2 className="text-2xl font-bold">Event Details</h2></div><button type="button" onClick={onClose}><X /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Field label="Event Title"><input required value={form.title} onChange={(event) => field("title", event.target.value)} className="calendar-input" /></Field><Field label="Event Type"><select value={form.type} onChange={(event) => field("type", event.target.value)} className="calendar-input"><option>Special Event</option><option>Appointment</option><option>Payment Due</option></select></Field><Field label="Date"><input required type="date" value={form.date} onChange={(event) => field("date", event.target.value)} className="calendar-input" /></Field><Field label="Start Time"><input required type="time" value={form.time} onChange={(event) => field("time", event.target.value)} className="calendar-input" /></Field><Field label="End Time"><input type="time" value={form.endTime} onChange={(event) => field("endTime", event.target.value)} className="calendar-input" /></Field><Field label="Status"><select value={form.status} onChange={(event) => field("status", event.target.value)} className="calendar-input"><option>Scheduled</option><option>Completed</option><option>Cancelled</option></select></Field><Field label="Customer"><select value={form.customerId} onChange={(event) => field("customerId", event.target.value)} className="calendar-input"><option value="">Not linked</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></Field><Field label="Order"><select value={form.orderId} onChange={(event) => field("orderId", event.target.value)} className="calendar-input"><option value="">Not linked</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Notes"><textarea rows={4} value={form.notes} onChange={(event) => field("notes", event.target.value)} className="calendar-input" /></Field></div><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold disabled:opacity-50">{saving ? "Saving..." : "Save Event"}</button></div>
  </div><style jsx global>{`.calendar-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;outline:none}.calendar-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}`}</style></form></div>;
}
function Info({ rows }: { rows: Array<[string, string]> }) { return <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap font-bold">{value}</p></div>)}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }
function Action({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) { return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${danger ? "border-red-200 bg-red-50 text-red-700" : ""}`}>{icon}{label}</button>; }

function eventColor(event: CalendarEvent) {
  if (event.status === "Cancelled") return "border-slate-500 bg-slate-100 text-slate-700";
  if ((event.type === "Order Due" || event.type === "Payment Due") && new Date(event.startsAt) < new Date() && !["Completed", "Paid"].includes(event.status)) return "border-red-600 bg-red-50 text-red-800";
  if (event.type === "Pickup") return "border-blue-600 bg-blue-50 text-blue-800";
  if (event.type === "Delivery") return "border-emerald-600 bg-emerald-50 text-emerald-800";
  if (event.type === "Kitchen Production" && event.status === "Packaging") return "border-purple-600 bg-purple-50 text-purple-800";
  if (event.type === "Kitchen Production" && event.status === "Ready For Pickup") return "border-blue-600 bg-blue-50 text-blue-800";
  if (event.type === "Kitchen Production" && ["Out For Delivery", "Delivered"].includes(event.status)) return "border-emerald-600 bg-emerald-50 text-emerald-800";
  if (event.type === "Kitchen Production") return "border-orange-500 bg-orange-50 text-orange-800";
  if (event.type === "Appointment") return "border-purple-600 bg-purple-50 text-purple-800";
  return "border-slate-500 bg-slate-50 text-slate-700";
}
function productionStatus(order?: Order) {
  if (!order) return "Scheduled";
  const persisted = order.production_status?.trim();
  if (persisted) return persisted === "Ready" ? "Ready For Pickup" : persisted;
  const status = order.order_status.trim().toLowerCase();
  if (status === "paused") return "Paused";
  if (status === "packaging") return "Packaging";
  if (status === "ready" || status === "ready for pickup") return "Ready For Pickup";
  if (status === "out for delivery") return "Out For Delivery";
  if (status === "delivered" || status === "completed") return "Delivered";
  if (["cooking", "preparing", "kitchen", "paid"].includes(status)) return "Cooking";
  return "Waiting";
}
function parseNotes(notes: string | null) {
  const text = notes ?? ""; const value = (label: string, fallback: string) => text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim() || fallback;
  return { mealPlan: value("Meal Plan", "Not specified"), pickupTime: value("Pickup/Delivery Time", "12:00"), address: value("Delivery Address", "Not provided"), driver: value("Assigned Driver", "Not assigned"), notes: text.split("\n").filter((line) => !/^(Meal Plan|Number of Meals|Pickup\/Delivery Date|Pickup\/Delivery Time|Delivery Address|Assigned Driver):/i.test(line)).join("\n").trim() };
}
function customerName(customer?: Customer) { return customer ? `${customer.first_name} ${customer.last_name ?? ""}`.trim() : "Not linked"; }
function localKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function localTime(date: Date) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function combineDateTime(date: string, time: string) { const parsed = new Date(`${date.slice(0, 10)} ${time}`); return Number.isNaN(parsed.getTime()) ? `${date.slice(0, 10)}T12:00:00` : parsed.toISOString(); }
function startOfWeek(date: Date) { const result = new Date(date); result.setDate(result.getDate() - result.getDay()); result.setHours(0, 0, 0, 0); return result; }
function viewLabel(date: Date, view: View) { if (view === "Month") return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date); if (view === "Day") return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date); const end = new Date(startOfWeek(date)); end.setDate(end.getDate() + 6); return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(startOfWeek(date))} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(end)}`; }
function printSchedule(events: CalendarEvent[], mode: "Daily" | "Weekly", date: Date) {
  const start = mode === "Daily" ? new Date(date) : startOfWeek(date); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + (mode === "Daily" ? 1 : 7));
  const rows = events.filter((event) => new Date(event.startsAt) >= start && new Date(event.startsAt) < end).map((event) => `<tr><td>${dateTime(event.startsAt)}</td><td>${event.title}</td><td>${customerName(event.customer)}</td><td>${event.status}</td></tr>`).join("");
  const popup = window.open("", "_blank", "width=900,height=700"); if (!popup) return;
  popup.document.write(`<html><head><title>${mode} Schedule</title><style>body{font-family:Arial;padding:36px;color:#081c35}h1{border-bottom:4px solid #d6a817;padding-bottom:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}</style></head><body><h1>Miz Rita HQ · ${mode} Schedule</h1><table><thead><tr><th>Time</th><th>Event</th><th>Customer</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No events scheduled.</td></tr>"}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`); popup.document.close();
}
