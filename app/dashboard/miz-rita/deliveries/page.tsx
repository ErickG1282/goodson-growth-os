"use client";

import { CheckCircle2, Clock3, MapPin, Phone, Printer, Search, Truck, UserRound, X } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = { id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null };
type Order = { id: string; customer_id: string; order_number: string; meal_count: number; order_status: string; notes: string | null };
type TimelineEvent = { status: string; timestamp: string };
type DeliveryStatus = "New Order" | "Preparing" | "Packaging" | "Ready" | "Out For Delivery" | "Delivered" | "Cancelled";
type Delivery = {
  id: string; business_id: string; order_id: string; delivery_type: "Pickup" | "Delivery";
  driver_name: string | null; driver_phone: string | null; status: DeliveryStatus;
  scheduled_at: string | null; completed_at: string | null; address: string | null;
  notes: string | null; activity_timeline: TimelineEvent[] | null; created_at: string; updated_at: string;
};
type Row = { delivery: Delivery; order: Order; customer?: Customer; details: { mealCount: string } };

const statuses: DeliveryStatus[] = ["New Order", "Preparing", "Packaging", "Ready", "Out For Delivery", "Delivered", "Cancelled"];
const dateKey = (date: Date) => date.toLocaleDateString("en-CA");
const formatDateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Not recorded";

export default function DeliveriesPage() {
  const [businessId, setBusinessId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [driverEditor, setDriverEditor] = useState<Delivery | null>(null);
  const [driverForm, setDriverForm] = useState({ name: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const { data: business, error: businessError } = await supabase.from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);
      const [orderResult, customerResult, deliveryResult] = await Promise.all([
        supabase.from("gbgs_orders").select("id, customer_id, order_number, meal_count, order_status, notes").eq("business_id", business.id).order("created_at", { ascending: false }),
        supabase.from("gbgs_customers").select("id, first_name, last_name, phone, email").eq("business_id", business.id),
        supabase.from("gbgs_deliveries").select("*").eq("business_id", business.id).order("scheduled_at", { ascending: true, nullsFirst: false }),
      ]);
      const firstError = orderResult.error ?? customerResult.error ?? deliveryResult.error;
      if (firstError) throw firstError;
      setOrders((orderResult.data ?? []) as Order[]);
      setCustomers((customerResult.data ?? []) as Customer[]);
      setDeliveries((deliveryResult.data ?? []) as Delivery[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Deliveries could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`deliveries-hq-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_deliveries", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_orders", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadData]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const rows = useMemo<Row[]>(() => deliveries.flatMap((delivery) => {
    const order = orders.find((item) => item.id === delivery.order_id);
    if (!order) return [];
    return [{ delivery, order, customer: customers.find((item) => item.id === order.customer_id), details: { mealCount: String(order.meal_count) } }];
  }), [deliveries, orders, customers]);
  const today = dateKey(new Date());
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const isLate = (row: Row) => Boolean(row.delivery.scheduled_at && new Date(row.delivery.scheduled_at) < new Date() && !["Delivered", "Cancelled"].includes(row.delivery.status));
  const filtered = rows.filter((row) => {
    const name = customerName(row.customer);
    const haystack = [name, row.order.order_number, row.delivery.driver_name, row.delivery.driver_phone, row.customer?.phone, row.delivery.address].join(" ").toLowerCase();
    if (!haystack.includes(search.toLowerCase())) return false;
    const scheduledDay = row.delivery.scheduled_at?.slice(0, 10);
    if (filter === "All") return true;
    if (filter === "Today") return scheduledDay === today;
    if (filter === "Tomorrow") return scheduledDay === tomorrow;
    if (filter === "Pickup") return row.delivery.delivery_type === "Pickup";
    if (filter === "Late") return isLate(row);
    return row.delivery.status === filter;
  });
  const metrics: Array<[string, number]> = [
    ["Deliveries Today", rows.filter((row) => row.delivery.delivery_type === "Delivery" && row.delivery.scheduled_at?.slice(0, 10) === today).length],
    ["Ready for Pickup", rows.filter((row) => row.delivery.delivery_type === "Pickup" && row.delivery.status === "Ready").length],
    ["Out for Delivery", rows.filter((row) => row.delivery.status === "Out For Delivery").length],
    ["Delivered Today", rows.filter((row) => row.delivery.status === "Delivered" && row.delivery.completed_at?.slice(0, 10) === today).length],
    ["Late Deliveries", rows.filter(isLate).length],
  ];
  const selectedRow = rows.find((row) => row.delivery.id === selected);

  const updateStatus = async (row: Row, status: DeliveryStatus) => {
    setSaving(true); setError("");
    const orderStatus = status === "Ready" ? "Ready For Pickup" : status === "Delivered" ? "Completed" : status;
    const { error: transitionError } = await supabase.rpc("gbgs_transition_order", {
      p_business_id: businessId, p_order_id: row.order.id, p_order_status: orderStatus,
      p_label: status === "Delivered" ? "Order Delivered" : `Order moved to ${status}`,
    });
    if (transitionError) setError(transitionError.message); else { setToast(`Delivery moved to ${status}`); await loadData(); }
    setSaving(false);
  };

  const openDriver = (delivery: Delivery) => { setDriverForm({ name: delivery.driver_name ?? "", phone: delivery.driver_phone ?? "" }); setDriverEditor(delivery); };
  const saveDriver = async (event: FormEvent) => {
    event.preventDefault(); if (!driverEditor) return; setSaving(true); setError("");
    const { error: updateError } = await supabase.from("gbgs_deliveries").update({ driver_name: driverForm.name.trim() || null, driver_phone: driverForm.phone.trim() || null, updated_at: new Date().toISOString() }).eq("id", driverEditor.id).eq("business_id", businessId);
    if (updateError) setError(updateError.message); else { setToast(driverForm.name.trim() ? "Driver assigned" : "Driver removed"); setDriverEditor(null); await loadData(); }
    setSaving(false);
  };

  return <main className="lg:ml-64 min-h-screen bg-slate-100 p-4 text-[#081c35] sm:p-6">
    {toast && <div className="fixed right-5 top-5 z-[90] rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-xl">{toast}</div>}
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-[#d6a817]">Miz Rita HQ</p><h1 className="mt-1 text-3xl font-bold">Deliveries HQ</h1><p className="mt-1 text-slate-600">Manage today&apos;s pickups and deliveries.</p></div><button onClick={() => window.print()} className="rounded-xl bg-[#081c35] px-5 py-3 font-bold text-white"><Printer className="mr-2 inline h-4 w-4" />Print Delivery List</button></header>
    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</section>
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, order, driver, phone, or address" className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 outline-none focus:border-[#d6a817]" /></div><div className="flex flex-wrap gap-2">{["All", "Today", "Tomorrow", "New Order", "Preparing", "Packaging", "Ready", "Out For Delivery", "Delivered", "Pickup", "Late", "Cancelled"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-xl px-3 py-2 text-sm font-bold ${filter === item ? "bg-[#081c35] text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>)}</div></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr>{["Order Number", "Customer", "Driver", "Pickup / Delivery", "Scheduled Time", "Address", "Status", "Meal Count", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.delivery.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-4 font-bold">{row.order.order_number}</td><td className="px-3 py-4">{customerName(row.customer)}</td><td className="px-3 py-4">{row.delivery.driver_name || "Not Assigned"}</td><td className="px-3 py-4">{row.delivery.delivery_type}</td><td className="px-3 py-4">{formatDateTime(row.delivery.scheduled_at)}</td><td className="max-w-52 truncate px-3 py-4">{row.delivery.address || "Not provided"}</td><td className="px-3 py-4"><Status status={row.delivery.status} late={isLate(row)} /></td><td className="px-3 py-4">{row.details.mealCount}</td><td className="px-3 py-4"><button onClick={() => setSelected(row.delivery.id)} className="rounded-lg bg-[#081c35] px-3 py-2 font-bold text-white">View</button></td></tr>)}</tbody></table>{loading ? <p className="p-10 text-center text-slate-500">Loading deliveries...</p> : !filtered.length && <p className="p-10 text-center text-slate-500">No deliveries match this view.</p>}</div>
    </section>
    {selectedRow && <DeliveryProfile row={selectedRow} saving={saving} onClose={() => setSelected(null)} onAssign={() => openDriver(selectedRow.delivery)} onStatus={(status) => void updateStatus(selectedRow, status)} />}
    {driverEditor && <DriverEditor form={driverForm} saving={saving} onChange={setDriverForm} onClose={() => setDriverEditor(null)} onSave={(event) => void saveDriver(event)} />}
  </main>;
}

function DeliveryProfile({ row, saving, onClose, onAssign, onStatus }: { row: Row; saving: boolean; onClose: () => void; onAssign: () => void; onStatus: (status: DeliveryStatus) => void }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.delivery.address || "")}`;
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"><div className="h-full w-full max-w-4xl overflow-y-auto bg-slate-100 shadow-2xl"><header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Delivery Profile</p><h2 className="text-2xl font-bold">{row.order.order_number}</h2></div><button onClick={onClose}><X /></button></header><div className="space-y-5 p-5">
    <Info title="Delivery Information" rows={[["Type", row.delivery.delivery_type], ["Scheduled", formatDateTime(row.delivery.scheduled_at)], ["Completed", formatDateTime(row.delivery.completed_at)], ["Address", row.delivery.address || "Not provided"], ["Driver", row.delivery.driver_name || "Not Assigned"], ["Driver Phone", row.delivery.driver_phone || "Not provided"], ["Status", row.delivery.status], ["Notes", row.delivery.notes || "None"]]} />
    <Info title="Customer" rows={[["Name", customerName(row.customer)], ["Phone", row.customer?.phone || "Not provided"], ["Email", row.customer?.email || "Not provided"], ["Meal Count", row.details.mealCount]]} />
    <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">Activity Timeline</h3><div className="mt-4 space-y-3">{(row.delivery.activity_timeline ?? []).map((event, index) => <div key={`${event.status}-${event.timestamp}-${index}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="font-bold">{event.status}</p><p className="text-sm text-slate-500">{formatDateTime(event.timestamp)}</p></div></div>)}</div></section>
    <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">Quick Actions</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Action icon={<UserRound />} label={row.delivery.driver_name ? "Edit Driver" : "Assign Driver"} onClick={onAssign} /><Action icon={<MapPin />} label="Open Maps" href={row.delivery.address ? mapsUrl : undefined} /><Action icon={<Phone />} label="Call Customer" href={row.customer?.phone ? `tel:${row.customer.phone}` : undefined} /><Action icon={<Printer />} label="Print" onClick={() => window.print()} /></div><div className="mt-5 flex flex-wrap gap-2">{statuses.map((status) => <button key={status} disabled={saving || status === row.delivery.status} onClick={() => onStatus(status)} className="rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-40">{status}</button>)}</div></section>
  </div></div></div>;
}

function DriverEditor({ form, saving, onChange, onClose, onSave }: { form: { name: string; phone: string }; saving: boolean; onChange: (form: { name: string; phone: string }) => void; onClose: () => void; onSave: (event: FormEvent) => void }) {
  return <div className="fixed inset-0 z-[70] bg-slate-950/70 p-4"><form onSubmit={onSave} className="mx-auto mt-24 max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Delivery Assignment</p><h2 className="text-2xl font-bold">Driver Details</h2></div><button type="button" onClick={onClose}><X /></button></div><div className="mt-5 space-y-4"><Field label="Driver Name"><input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Not Assigned" className="w-full rounded-xl border p-3" /></Field><Field label="Driver Phone"><input value={form.phone} onChange={(event) => onChange({ ...form, phone: event.target.value })} className="w-full rounded-xl border p-3" /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => onChange({ name: "", phone: "" })} className="rounded-xl border px-5 py-3 font-bold text-red-700">Remove Driver</button><button disabled={saving} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold disabled:opacity-50">{saving ? "Saving..." : "Save Driver"}</button></div></div></form></div>;
}

function Info({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">{title}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap font-bold">{value}</p></div>)}</div></section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }
function Action({ icon, label, onClick, href }: { icon: ReactNode; label: string; onClick?: () => void; href?: string }) { const classes = "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold"; return href ? <a href={href} target="_blank" rel="noreferrer" className={classes}>{icon}{label}</a> : <button onClick={onClick} disabled={!onClick} className={`${classes} disabled:opacity-40`}>{icon}{label}</button>; }
function Status({ status, late }: { status: string; late: boolean }) { const style = late ? "bg-red-100 text-red-800" : status === "Delivered" ? "bg-emerald-100 text-emerald-800" : status === "Cancelled" ? "bg-slate-200 text-slate-700" : status === "Out For Delivery" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"; return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${style}`}>{late ? <Clock3 className="h-3 w-3" /> : status === "Out For Delivery" ? <Truck className="h-3 w-3" /> : null}{late ? "Late" : status}</span>; }
function customerName(customer?: Customer) { return customer ? `${customer.first_name} ${customer.last_name ?? ""}`.trim() : "Unknown Customer"; }
