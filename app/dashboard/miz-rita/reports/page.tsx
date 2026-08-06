"use client";

import { Download, FileSpreadsheet, FileText, Printer, RefreshCw } from "lucide-react";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = { id: string; customer_id: string; meal_id: string | null; meal_count: number; order_number: string; order_date: string; fulfillment_date: string | null; order_status: string; payment_status: string; delivery_method: string | null; amount_paid: number | null; total: number; balance_due: number; notes: string | null; created_at?: string };
type Customer = { id: string; first_name: string; last_name: string | null; customer_status: string; created_at: string; dietary_notes: string | null };
type Meal = { id: string; name: string; category: string; selling_price: number; food_cost: number; status: string };
type Ingredient = { id: string; meal_id: string; ingredient_name: string; quantity_required: number; unit: string };
type Delivery = { id: string; order_id: string; delivery_type: "Pickup" | "Delivery"; driver_name: string | null; driver_phone: string | null; status: string; scheduled_at: string | null; completed_at: string | null };
type InventoryHistory = { date: string; ingredient: string; quantityChange: number; unit: string; reason: string };
type RangeName = "Today" | "Yesterday" | "This Week" | "This Month" | "Last Month" | "Custom";
type ReportRow = Record<string, string | number>;

const reportTypes = ["Sales Report", "Customer Report", "Meal Performance", "Inventory Usage", "Kitchen Production", "Delivery Performance", "Payments", "Outstanding Balances", "Subscription Report", "Revenue by Month"];
const finiteNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};
const safeDivide = (numerator: unknown, denominator: unknown) => {
  const divisor = finiteNumber(denominator);
  return divisor === 0 ? 0 : finiteNumber(numerator) / divisor;
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const localKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));

export default function ReportsPage() {
  const [businessId, setBusinessId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [inventoryHistory, setInventoryHistory] = useState<InventoryHistory[]>([]);
  const [range, setRange] = useState<RangeName>("This Month");
  const [customStart, setCustomStart] = useState(localKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(localKey(new Date()));
  const [customerFilter, setCustomerFilter] = useState("");
  const [mealFilter, setMealFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [reportType, setReportType] = useState("Sales Report");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const { data: business, error: businessError } = await supabase.from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);
      const results = await Promise.all([
        supabase.from("gbgs_orders").select("id, customer_id, meal_id, meal_count, order_number, order_date, fulfillment_date, order_status, payment_status, delivery_method, amount_paid, total, balance_due, notes, created_at").eq("business_id", business.id),
        supabase.from("gbgs_customers").select("id, first_name, last_name, customer_status, created_at, dietary_notes").eq("business_id", business.id),
        supabase.from("gbgs_menu_meals").select("id, name, category, selling_price, food_cost, status").eq("business_id", business.id),
        supabase.from("gbgs_menu_ingredients").select("id, meal_id, ingredient_name, quantity_required, unit"),
        supabase.from("gbgs_deliveries").select("id, order_id, delivery_type, driver_name, driver_phone, status, scheduled_at, completed_at").eq("business_id", business.id),
        supabase.from("gbgs_inventory_history").select("created_at, ingredient, quantity_change, unit, reason").eq("business_id", business.id),
      ]);
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setOrders((results[0].data ?? []).map((order) => ({ ...order, meal_count: finiteNumber(order.meal_count), amount_paid: finiteNumber(order.amount_paid), total: finiteNumber(order.total), balance_due: finiteNumber(order.balance_due) })) as Order[]); setCustomers((results[1].data ?? []) as Customer[]);
      setMeals((results[2].data ?? []).map((meal) => ({ ...meal, selling_price: finiteNumber(meal.selling_price), food_cost: finiteNumber(meal.food_cost) })) as Meal[]); setIngredients((results[3].data ?? []).map((ingredient) => ({ ...ingredient, quantity_required: finiteNumber(ingredient.quantity_required) })) as Ingredient[]);
      setDeliveries((results[4].data ?? []) as Delivery[]);
      setInventoryHistory((results[5].data ?? []).map((entry) => ({ date: entry.created_at, ingredient: entry.ingredient, quantityChange: finiteNumber(entry.quantity_change), unit: entry.unit, reason: entry.reason })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Reports could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`reports-hq-${businessId}`);
    ["gbgs_orders", "gbgs_customers", "gbgs_menu_meals", "gbgs_menu_ingredients", "gbgs_deliveries", "gbgs_payments", "gbgs_inventory_history"].forEach((table) => channel.on("postgres_changes", { event: "*", schema: "public", table }, () => void loadData()));
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadData]);

  const bounds = useMemo(() => rangeBounds(range, customStart, customEnd), [range, customStart, customEnd]);
  const customersById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const deliveriesByOrder = useMemo(() => new Map(deliveries.map((delivery) => [delivery.order_id, delivery])), [deliveries]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const date = new Date(`${order.order_date.slice(0, 10)}T12:00:00`);
    const details = parseNotes(order.notes);
    const delivery = deliveriesByOrder.get(order.id);
    return date >= bounds.start && date <= bounds.end
      && (!customerFilter || order.customer_id === customerFilter)
      && (!mealFilter || order.meal_id === mealFilter)
      && (!driverFilter || delivery?.driver_name === driverFilter)
      && (!paymentFilter || order.payment_status === paymentFilter);
  }), [orders, bounds, customerFilter, mealFilter, driverFilter, paymentFilter, deliveriesByOrder]);

  const periodMetrics = useMemo(() => {
    const now = new Date(); const today = boundsFor("Today"); const week = boundsFor("This Week"); const month = boundsFor("This Month"); const yearStart = new Date(now.getFullYear(), 0, 1);
    const revenue = (start: Date, end: Date) => orders.filter((order) => inRange(order.order_date, start, end)).reduce((sum, order) => sum + finiteNumber(order.total), 0);
    const count = (start: Date, end: Date) => orders.filter((order) => inRange(order.order_date, start, end)).length;
    const allRevenue = orders.reduce((sum, order) => sum + finiteNumber(order.total), 0);
    return [
      ["Revenue Today", money(revenue(today.start, today.end))], ["Revenue This Week", money(revenue(week.start, week.end))],
      ["Revenue This Month", money(revenue(month.start, month.end))], ["Revenue This Year", money(revenue(yearStart, new Date(2099, 0, 1)))],
      ["Orders Today", count(today.start, today.end)], ["Orders This Week", count(week.start, week.end)], ["Orders This Month", count(month.start, month.end)],
      ["Active Customers", customers.filter((customer) => customer.customer_status.toLowerCase() === "active").length],
      ["New Customers", customers.filter((customer) => inRange(customer.created_at, month.start, month.end)).length],
      ["Meals Produced", orders.filter((order) => ["Delivered", "Completed"].includes(order.order_status)).reduce((sum, order) => sum + finiteNumber(order.meal_count), 0)],
      ["Deliveries Completed", deliveries.filter((delivery) => delivery.status === "Delivered").length],
      ["Average Order Value", money(safeDivide(allRevenue, orders.length))],
    ] as Array<[string, string | number]>;
  }, [orders, customers, deliveries]);

  const mealStats = useMemo(() => aggregateMeals(filteredOrders, meals), [filteredOrders, meals]);
  const customerStats = useMemo(() => aggregateCustomers(filteredOrders, customersById), [filteredOrders, customersById]);
  const daily = useMemo(() => timeSeries(filteredOrders, "day"), [filteredOrders]);
  const monthly = useMemo(() => timeSeries(orders, "month"), [orders]);
  const customerGrowth = useMemo(() => growthSeries(customers), [customers]);
  const inventoryUsage = useMemo(() => aggregateInventory(inventoryHistory, bounds), [inventoryHistory, bounds]);
  const deliveryStats = useMemo(() => {
    const relevant = deliveries.filter((delivery) => { const order = orders.find((item) => item.id === delivery.order_id); return order && filteredOrders.some((item) => item.id === order.id); });
    return [
      { label: "Delivered", value: relevant.filter((item) => item.status === "Delivered").length },
      { label: "In Progress", value: relevant.filter((item) => item.status === "Out For Delivery").length },
      { label: "Scheduled", value: relevant.filter((item) => ["Scheduled", "Preparing", "Ready For Pickup"].includes(item.status)).length },
      { label: "Cancelled", value: relevant.filter((item) => item.status === "Cancelled").length },
    ];
  }, [deliveries, orders, filteredOrders]);
  const driverNames = useMemo(() => [...new Set(deliveries.map((delivery) => delivery.driver_name).filter((name): name is string => Boolean(name)))].sort(), [deliveries]);
  const reportRows = useMemo(() => buildReportRows(reportType, filteredOrders, customers, meals, ingredients, deliveries, inventoryUsage, mealStats, customerStats), [reportType, filteredOrders, customers, meals, ingredients, deliveries, inventoryUsage, mealStats, customerStats]);
  const reportHeaders = reportRows.length ? Object.keys(reportRows[0]) : ["Result"];
  const exportName = `Miz-Rita-${reportType.replace(/\s+/g, "-")}-${localKey(new Date())}`;

  return <main className="lg:ml-64 min-h-screen bg-slate-100 p-4 text-[#081c35] sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-[#d6a817]">Miz Rita HQ</p><h1 className="mt-1 text-3xl font-bold">Reports HQ</h1><p className="mt-1 text-slate-600">Live business performance from every connected operation.</p></div><button onClick={() => void loadData()} className="rounded-xl border bg-white px-4 py-3 font-bold"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></header>
    {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{periodMetrics.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</section>
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <select value={range} onChange={(event) => setRange(event.target.value as RangeName)} className="report-input">{["Today", "Yesterday", "This Week", "This Month", "Last Month", "Custom"].map((item) => <option key={item}>{item}</option>)}</select>
      {range === "Custom" && <><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="report-input" /><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="report-input" /></>}
      <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} className="report-input"><option value="">All Customers</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select>
      <select value={mealFilter} onChange={(event) => setMealFilter(event.target.value)} className="report-input"><option value="">All Meals</option>{meals.map((meal) => <option key={meal.id} value={meal.id}>{meal.name}</option>)}</select>
      <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="report-input"><option value="">All Drivers</option>{driverNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="report-input"><option value="">All Payment Statuses</option>{Array.from(new Set(orders.map((order) => order.payment_status))).map((status) => <option key={status}>{status}</option>)}</select>
    </div><style jsx global>{`.report-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;background:white;outline:none}.report-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}`}</style></section>
    <section className="mt-6 grid gap-5 xl:grid-cols-2">
      <ChartCard title="Daily Revenue"><LineChart data={daily.map((item) => ({ label: item.label, value: item.revenue }))} format={money} /></ChartCard>
      <ChartCard title="Monthly Revenue"><BarChart data={monthly.map((item) => ({ label: item.label, value: item.revenue }))} format={money} /></ChartCard>
      <ChartCard title="Orders Per Day"><BarChart data={daily.map((item) => ({ label: item.label, value: item.orders }))} /></ChartCard>
      <ChartCard title="Top Selling Meals"><BarChart data={mealStats.slice(0, 8).map((item) => ({ label: item.name, value: item.meals }))} /></ChartCard>
      <ChartCard title="Revenue By Meal"><BarChart data={mealStats.slice(0, 8).map((item) => ({ label: item.name, value: item.revenue }))} format={money} /></ChartCard>
      <ChartCard title="Customer Growth"><LineChart data={customerGrowth} /></ChartCard>
      <ChartCard title="Inventory Usage"><BarChart data={inventoryUsage.slice(0, 8).map((item) => ({ label: item.ingredient, value: item.used }))} /></ChartCard>
      <ChartCard title="Delivery Performance"><BarChart data={deliveryStats} /></ChartCard>
    </section>
    <section className="mt-6 grid gap-5 xl:grid-cols-4"><Ranking title="Top 10 Meals" rows={mealStats.slice(0, 10).map((item) => [item.name, `${item.meals} meals`])} /><Ranking title="Top Customers" rows={customerStats.slice().sort((a, b) => b.orders - a.orders).slice(0, 10).map((item) => [item.name, `${item.orders} orders`])} /><Ranking title="Highest Revenue Customers" rows={customerStats.slice(0, 10).map((item) => [item.name, money(item.revenue)])} /><Ranking title="Most Popular Meal Plans" rows={mealStats.slice(0, 10).map((item) => [item.name, `${item.orders} orders`])} /></section>
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Report Type</p><select value={reportType} onChange={(event) => setReportType(event.target.value)} className="mt-2 rounded-xl border px-4 py-3 font-bold">{reportTypes.map((item) => <option key={item}>{item}</option>)}</select></div><div className="flex flex-wrap gap-2"><button onClick={() => exportCsv(reportRows, exportName)} className="export-button"><Download />CSV</button><button onClick={() => exportExcel(reportRows, exportName)} className="export-button"><FileSpreadsheet />Excel</button><button onClick={() => printReport(reportType, reportRows, "PDF")} className="export-button"><FileText />PDF</button><button onClick={() => printReport(reportType, reportRows, "Print")} className="export-button"><Printer />Printable Report</button></div></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#081c35] text-xs uppercase text-white"><tr>{reportHeaders.map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{reportRows.map((row, index) => <tr key={index} className="border-b">{reportHeaders.map((heading) => <td key={heading} className="px-4 py-3">{row[heading]}</td>)}</tr>)}</tbody></table>{!loading && !reportRows.length && <p className="p-10 text-center text-slate-500">No data for this report and filter selection.</p>}</div>
    </section>
    <section className="mt-6 rounded-3xl bg-[#081c35] p-5 text-white"><h2 className="text-xl font-bold">Print Reports</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{["Sales Report", "Production Report", "Customer Report", "Financial Summary"].map((label) => <button key={label} onClick={() => printReport(label, printDataset(label, filteredOrders, customers, meals, ingredients, deliveries, inventoryUsage, mealStats, customerStats), "Print")} className="rounded-xl border border-white/20 px-4 py-3 font-bold hover:bg-white/10"><Printer className="mr-2 inline h-4 w-4" />Print {label}</button>)}</div></section>
  </main>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">{title}</h2><div className="mt-4 h-64">{children}</div></section>; }
function BarChart({ data, format = String }: { data: Array<{ label: string; value: number }>; format?: (value: number) => string }) {
  const values = data.map((item) => finiteNumber(item.value));
  const max = Math.max(...values, 1);
  return <div className="flex h-full items-end gap-2 overflow-x-auto border-b border-l p-3">{data.length ? data.map((item, index) => <div key={item.label} className="group flex h-full min-w-12 flex-1 flex-col justify-end"><div title={`${item.label}: ${format(values[index])}`} style={{ height: `${Math.max(safeDivide(values[index], max) * 88, 2)}%` }} className="rounded-t-lg bg-[#d6a817] transition hover:bg-[#081c35]" /><p className="mt-2 truncate text-center text-[10px] text-slate-500">{item.label}</p></div>) : <p className="m-auto text-slate-400">No data</p>}</div>;
}
function LineChart({ data, format = String }: { data: Array<{ label: string; value: number }>; format?: (value: number) => string }) {
  const values = data.map((item) => finiteNumber(item.value)); const max = Math.max(...values, 1); const x = (index: number) => data.length === 1 ? 50 : safeDivide(index, data.length - 1) * 96 + 2; const y = (index: number) => 94 - safeDivide(values[index], max) * 82; const points = data.map((_, index) => `${x(index)},${y(index)}`).join(" ");
  return <div className="relative h-full">{data.length ? <><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[88%] w-full overflow-visible border-b border-l"><polyline points={points} fill="none" stroke="#d6a817" strokeWidth="2" vectorEffect="non-scaling-stroke" />{data.map((item, index) => <circle key={item.label} cx={x(index)} cy={y(index)} r="1.8" fill="#081c35"><title>{`${item.label}: ${format(values[index])}`}</title></circle>)}</svg><div className="flex justify-between text-[10px] text-slate-500"><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div></> : <p className="flex h-full items-center justify-center text-slate-400">No data</p>}</div>;
}
function Ranking({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-bold">{title}</h2><div className="mt-4 space-y-2">{rows.map(([name, value], index) => <div key={`${name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><span className="truncate font-bold"><span className="mr-2 text-[#d6a817]">{index + 1}</span>{name}</span><span className="shrink-0 text-sm text-slate-500">{value}</span></div>)}{!rows.length && <p className="text-sm text-slate-400">No data</p>}</div></section>; }

function rangeBounds(range: RangeName, customStart: string, customEnd: string) { if (range === "Custom") return { start: new Date(`${customStart}T00:00:00`), end: new Date(`${customEnd}T23:59:59`) }; return boundsFor(range); }
function boundsFor(range: Exclude<RangeName, "Custom">) {
  const now = new Date(); let start = new Date(now); let end = new Date(now);
  if (range === "Yesterday") { start.setDate(start.getDate() - 1); end = new Date(start); }
  if (range === "This Week") start.setDate(start.getDate() - start.getDay());
  if (range === "This Month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "Last Month") { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
  start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); return { start, end };
}
function inRange(value: string, start: Date, end: Date) { const date = new Date(`${value.slice(0, 10)}T12:00:00`); return date >= start && date <= end; }
function parseNotes(notes: string | null) { const text = notes ?? ""; const value = (label: string, fallback: string) => text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim() || fallback; return { mealCount: finiteNumber(value("Number of Meals", "0")), driver: value("Assigned Driver", "Unassigned") }; }
function customerName(customer?: Customer) { return customer ? `${customer.first_name} ${customer.last_name ?? ""}`.trim() : "Unknown"; }
function aggregateMeals(orders: Order[], meals: Meal[]) { const names = new Map(meals.map((meal) => [meal.id, meal.name])); const map = new Map<string, { name: string; orders: number; meals: number; revenue: number }>(); orders.forEach((order) => { if (!order.meal_id) return; const item = map.get(order.meal_id) ?? { name: names.get(order.meal_id) ?? "Unknown meal", orders: 0, meals: 0, revenue: 0 }; item.orders++; item.meals += finiteNumber(order.meal_count); item.revenue += finiteNumber(order.total); map.set(order.meal_id, item); }); return [...map.values()].sort((a, b) => b.meals - a.meals); }
function aggregateCustomers(orders: Order[], map: Map<string, Customer>) { const result = new Map<string, { name: string; orders: number; revenue: number }>(); orders.forEach((order) => { const item = result.get(order.customer_id) ?? { name: customerName(map.get(order.customer_id)), orders: 0, revenue: 0 }; item.orders++; item.revenue += finiteNumber(order.total); result.set(order.customer_id, item); }); return [...result.values()].sort((a, b) => b.revenue - a.revenue); }
function timeSeries(orders: Order[], group: "day" | "month") { const map = new Map<string, { label: string; revenue: number; orders: number }>(); orders.forEach((order) => { const date = new Date(`${order.order_date.slice(0, 10)}T12:00:00`); const key = group === "day" ? localKey(date) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; const label = group === "day" ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date) : new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date); const item = map.get(key) ?? { label, revenue: 0, orders: 0 }; item.revenue += finiteNumber(order.total); item.orders++; map.set(key, item); }); return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(group === "day" ? -14 : -12).map(([, value]) => value); }
function growthSeries(customers: Customer[]) { const map = new Map<string, number>(); customers.forEach((customer) => { const date = new Date(customer.created_at); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; map.set(key, (map.get(key) ?? 0) + 1); }); let total = 0; return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([key, count]) => { total += count; const [year, month] = key.split("-"); return { label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(Number(year), Number(month) - 1, 1)), value: total }; }); }
function aggregateInventory(history: InventoryHistory[], bounds: { start: Date; end: Date }) { const map = new Map<string, { ingredient: string; used: number; unit: string }>(); history.filter((item) => new Date(item.date) >= bounds.start && new Date(item.date) <= bounds.end && finiteNumber(item.quantityChange) < 0).forEach((entry) => { const item = map.get(entry.ingredient) ?? { ingredient: entry.ingredient, used: 0, unit: entry.unit }; item.used += Math.abs(finiteNumber(entry.quantityChange)); map.set(entry.ingredient, item); }); return [...map.values()].sort((a, b) => b.used - a.used); }
function buildReportRows(type: string, orders: Order[], customers: Customer[], meals: Meal[], ingredients: Ingredient[], deliveries: Delivery[], inventory: ReturnType<typeof aggregateInventory>, mealStats: ReturnType<typeof aggregateMeals>, customerStats: ReturnType<typeof aggregateCustomers>): ReportRow[] {
  if (type === "Customer Report") return customerStats.map((item) => ({ Customer: item.name, Orders: item.orders, Revenue: money(item.revenue) }));
  if (type === "Meal Performance") return mealStats.map((item) => ({ Meal: item.name, Orders: item.orders, "Meals Sold": item.meals, Revenue: money(item.revenue) }));
  if (type === "Inventory Usage") return inventory.map((item) => ({ Ingredient: item.ingredient, Used: item.used.toFixed(2), Unit: item.unit }));
  if (type === "Kitchen Production") return orders.map((order) => ({ Date: dateLabel(order.fulfillment_date ?? order.order_date), Order: order.order_number, Meal: meals.find((meal) => meal.id === order.meal_id)?.name ?? "Not specified", "Meal Count": order.meal_count, Status: order.order_status }));
  if (type === "Delivery Performance") return deliveries.filter((delivery) => orders.some((order) => order.id === delivery.order_id)).map((delivery) => ({ Order: orders.find((order) => order.id === delivery.order_id)?.order_number ?? "", Type: delivery.delivery_type, Driver: delivery.driver_name || "Not Assigned", Status: delivery.status, Scheduled: delivery.scheduled_at ? dateLabel(delivery.scheduled_at) : "Not scheduled", Completed: delivery.completed_at ? dateLabel(delivery.completed_at) : "Not completed" }));
  if (type === "Payments") return orders.map((order) => ({ Date: dateLabel(order.order_date), Order: order.order_number, Status: order.payment_status, Paid: money(finiteNumber(order.amount_paid)), Balance: money(finiteNumber(order.balance_due)) }));
  if (type === "Outstanding Balances") return orders.filter((order) => finiteNumber(order.balance_due) > 0).map((order) => ({ Customer: customerName(customers.find((customer) => customer.id === order.customer_id)), Order: order.order_number, Balance: money(finiteNumber(order.balance_due)), Status: order.payment_status }));
  if (type === "Subscription Report") return customers.map((customer) => ({ Customer: customerName(customer), Subscription: customer.dietary_notes?.match(/^Subscription Status:\s*(.+)$/im)?.[1] ?? "No Subscription", Status: customer.customer_status }));
  if (type === "Revenue by Month") return timeSeries(orders, "month").map((item) => ({ Month: item.label, Orders: item.orders, Revenue: money(item.revenue) }));
  return orders.map((order) => ({ Date: dateLabel(order.order_date), Order: order.order_number, Customer: customerName(customers.find((customer) => customer.id === order.customer_id)), Meal: meals.find((meal) => meal.id === order.meal_id)?.name ?? "Not specified", Total: money(finiteNumber(order.total)), Payment: order.payment_status, Status: order.order_status }));
}
function printDataset(label: string, orders: Order[], customers: Customer[], meals: Meal[], ingredients: Ingredient[], deliveries: Delivery[], inventory: ReturnType<typeof aggregateInventory>, mealStats: ReturnType<typeof aggregateMeals>, customerStats: ReturnType<typeof aggregateCustomers>): ReportRow[] {
  if (label === "Production Report") return buildReportRows("Kitchen Production", orders, customers, meals, ingredients, deliveries, inventory, mealStats, customerStats);
  if (label === "Customer Report") return buildReportRows("Customer Report", orders, customers, meals, ingredients, deliveries, inventory, mealStats, customerStats);
  if (label === "Financial Summary") {
    const revenue = orders.reduce((sum, order) => sum + finiteNumber(order.total), 0);
    const paid = orders.reduce((sum, order) => sum + finiteNumber(order.amount_paid), 0);
    const balance = orders.reduce((sum, order) => sum + finiteNumber(order.balance_due), 0);
    return [{ Revenue: money(revenue), Payments: money(paid), "Outstanding Balance": money(balance), Orders: orders.length, "Average Order Value": money(safeDivide(revenue, orders.length)) }];
  }
  return buildReportRows("Sales Report", orders, customers, meals, ingredients, deliveries, inventory, mealStats, customerStats);
}
function exportCsv(rows: ReportRow[], name: string) { if (!rows.length) return; const headers = Object.keys(rows[0]); const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((line) => line.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(",")).join("\n"); download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`); }
function exportExcel(rows: ReportRow[], name: string) { if (!rows.length) return; const headers = Object.keys(rows[0]); const table = `<table><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr>${rows.map((row) => `<tr>${headers.map((item) => `<td>${escapeHtml(String(row[item]))}</td>`).join("")}</tr>`).join("")}</table>`; download(new Blob([table], { type: "application/vnd.ms-excel" }), `${name}.xls`); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
function printReport(title: string, rows: ReportRow[], mode: "PDF" | "Print") { const popup = window.open("", "_blank", "width=1000,height=750"); if (!popup) return; const headers = rows.length ? Object.keys(rows[0]) : ["Result"]; popup.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial;padding:36px;color:#081c35}h1{border-bottom:4px solid #d6a817;padding-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#081c35;color:white}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}.note{color:#64748b}</style></head><body><h1>Miz Rita HQ · ${escapeHtml(title)}</h1><p class="note">Generated ${new Date().toLocaleString()}${mode === "PDF" ? " · Choose Save as PDF in the print dialog" : ""}</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(String(row[header]))}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`); popup.document.close(); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character); }
