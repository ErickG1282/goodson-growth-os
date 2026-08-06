"use client";

import { CreditCard, FileText, Mail, Pencil, Plus, Printer, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = { id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null };
type Order = { id: string; customer_id: string; order_number: string; order_date: string; payment_status: string; amount_paid: number | null; total: number; balance_due: number; notes: string | null };
type Delivery = { order_id: string; delivery_type: "Pickup" | "Delivery"; status: string; scheduled_at: string | null };
type Payment = {
  id: string; business_id: string; order_id: string; customer_id: string | null; invoice_number: string; payment_number: string;
  payment_date: string; payment_method: PaymentMethod; amount: number; transaction_number: string | null; internal_notes: string | null;
  status: "Unpaid" | "Partially Paid" | "Paid" | "Completed" | "Refunded"; record_type: "Order Summary" | "Transaction";
  amount_due: number; balance: number; parent_payment_id: string | null; created_at: string; updated_at: string;
};
type PaymentMethod = "Cash" | "Credit Card" | "Debit Card" | "Cash App" | "Zelle" | "Venmo" | "PayPal" | "Square";
type Row = { payment: Payment; order?: Order; customer?: Customer; delivery?: Delivery };
type PaymentForm = { orderId: string; date: string; method: PaymentMethod; amount: string; transaction: string; notes: string };

const methods: PaymentMethod[] = ["Cash", "Credit Card", "Debit Card", "Cash App", "Zelle", "Venmo", "PayPal", "Square"];
const blankForm: PaymentForm = { orderId: "", date: new Date().toISOString().slice(0, 16), method: "Credit Card", amount: "", transaction: "", notes: "" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const localDate = (value: string) => new Date(value).toLocaleDateString("en-CA");

export default function PaymentsPage() {
  const [businessId, setBusinessId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<"new" | Payment | null>(null);
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);
  const [form, setForm] = useState<PaymentForm>(blankForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const { data: business, error: businessError } = await supabase.from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);
      const [orderResult, customerResult, paymentResult, deliveryResult] = await Promise.all([
        supabase.from("gbgs_orders").select("id, customer_id, order_number, order_date, payment_status, amount_paid, total, balance_due, notes").eq("business_id", business.id).order("created_at", { ascending: false }),
        supabase.from("gbgs_customers").select("id, first_name, last_name, phone, email").eq("business_id", business.id),
        supabase.from("gbgs_payments").select("*").eq("business_id", business.id).order("payment_date", { ascending: false }),
        supabase.from("gbgs_deliveries").select("order_id, delivery_type, status, scheduled_at").eq("business_id", business.id),
      ]);
      const firstError = orderResult.error ?? customerResult.error ?? paymentResult.error ?? deliveryResult.error;
      if (firstError) throw firstError;
      setOrders((orderResult.data ?? []) as Order[]); setCustomers((customerResult.data ?? []) as Customer[]); setPayments((paymentResult.data ?? []) as Payment[]); setDeliveries((deliveryResult.data ?? []) as Delivery[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Payments could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`payments-hq-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_payments", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_orders", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_deliveries", filter: `business_id=eq.${businessId}` }, () => void loadData())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadData]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const rows = useMemo<Row[]>(() => payments.map((payment) => {
    const order = orders.find((item) => item.id === payment.order_id);
    return { payment, order, customer: customers.find((item) => item.id === (payment.customer_id ?? order?.customer_id)), delivery: deliveries.find((item) => item.order_id === payment.order_id) };
  }), [payments, orders, customers, deliveries]);
  const now = new Date(); const today = localDate(now.toISOString()); const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const transactions = payments.filter((payment) => payment.record_type === "Transaction");
  const net = (items: Payment[]) => items.reduce((sum, item) => sum + (item.status === "Refunded" ? -Number(item.amount) : Number(item.amount)), 0);
  const metrics = [
    ["Revenue Today", money(net(transactions.filter((payment) => localDate(payment.payment_date) === today)))],
    ["Revenue This Week", money(net(transactions.filter((payment) => new Date(payment.payment_date) >= weekStart)))],
    ["Revenue This Month", money(net(transactions.filter((payment) => new Date(payment.payment_date) >= monthStart)))],
    ["Outstanding Balances", money(orders.reduce((sum, order) => sum + Number(order.balance_due || 0), 0))],
    ["Paid Orders", orders.filter((order) => order.payment_status === "Paid").length],
    ["Unpaid Orders", orders.filter((order) => order.payment_status === "Unpaid").length],
    ["Partial Payments", orders.filter((order) => order.payment_status === "Partial").length],
    ["Refunds", money(transactions.filter((payment) => payment.status === "Refunded").reduce((sum, payment) => sum + Number(payment.amount), 0))],
  ];
  const filtered = rows.filter((row) => {
    const customer = customerName(row.customer); const haystack = [customer, row.order?.order_number, row.payment.invoice_number, row.customer?.phone, row.payment.payment_method].join(" ").toLowerCase();
    if (!haystack.includes(search.toLowerCase())) return false;
    if (filter === "All") return true;
    if (methods.includes(filter as PaymentMethod)) return row.payment.payment_method === filter;
    if (["Paid", "Unpaid", "Partially Paid"].includes(filter)) return row.payment.status === filter;
    if (filter === "Today") return localDate(row.payment.payment_date) === today;
    if (filter === "This Week") return new Date(row.payment.payment_date) >= weekStart;
    if (filter === "This Month") return new Date(row.payment.payment_date) >= monthStart;
    return true;
  });
  const selectedRow = rows.find((row) => row.payment.id === selected);

  const openNew = (orderId = "") => {
    const order = orders.find((item) => item.id === orderId);
    setForm({ ...blankForm, orderId, amount: order ? String(order.balance_due) : "", date: new Date().toISOString().slice(0, 16) }); setEditor("new");
  };
  const openEdit = (payment: Payment) => {
    setForm({ orderId: payment.order_id, date: new Date(payment.payment_date).toISOString().slice(0, 16), method: payment.payment_method, amount: String(payment.amount), transaction: payment.transaction_number ?? "", notes: payment.internal_notes ?? "" }); setEditor(payment);
  };
  const savePayment = async (event: FormEvent) => {
    event.preventDefault(); const order = orders.find((item) => item.id === form.orderId); if (!order) return;
    const amount = Number(form.amount); if (!(amount > 0)) return;
    setSaving(true);
    const values = { business_id: businessId, order_id: order.id, customer_id: order.customer_id, invoice_number: `INV-${order.order_number}`, payment_date: new Date(form.date).toISOString(), payment_method: form.method, amount, transaction_number: form.transaction.trim() || null, internal_notes: form.notes.trim() || null, updated_at: new Date().toISOString() };
    const result = editor === "new" ? await supabase.from("gbgs_payments").insert(values) : await supabase.from("gbgs_payments").update(values).eq("id", editor!.id);
    if (result.error) setError(result.error.message); else { setToast(editor === "new" ? "Payment recorded" : "Payment updated"); setEditor(null); await loadData(); }
    setSaving(false);
  };
  const createRefund = async (event: FormEvent) => {
    event.preventDefault(); if (!refundPayment) return; const amount = Number(form.amount); const refundable = remainingRefundable(refundPayment, payments);
    if (!(amount > 0) || amount > refundable) { setError(`Refund cannot exceed ${money(refundable)}.`); return; }
    setSaving(true);
    const { error: insertError } = await supabase.from("gbgs_payments").insert({ business_id: businessId, order_id: refundPayment.order_id, customer_id: refundPayment.customer_id, invoice_number: refundPayment.invoice_number, payment_date: new Date(form.date).toISOString(), payment_method: refundPayment.payment_method, amount, transaction_number: form.transaction.trim() || null, internal_notes: form.notes.trim() || `Refund for ${refundPayment.payment_number}`, status: "Refunded", parent_payment_id: refundPayment.id });
    if (insertError) setError(insertError.message); else { setToast("Refund recorded"); setRefundPayment(null); await loadData(); }
    setSaving(false);
  };
  const deletePayment = async (payment: Payment) => {
    if (!window.confirm("Delete this payment transaction?")) return; setSaving(true);
    const { error: deleteError } = await supabase.from("gbgs_payments").delete().eq("id", payment.id);
    if (deleteError) setError(deleteError.message); else { setToast("Payment deleted"); setSelected(null); await loadData(); }
    setSaving(false);
  };
  const beginRefund = (payment: Payment) => { const amount = remainingRefundable(payment, payments); setForm({ ...blankForm, orderId: payment.order_id, amount: String(amount), date: new Date().toISOString().slice(0, 16), method: payment.payment_method }); setRefundPayment(payment); };

  return <main className="lg:ml-64 min-h-screen bg-slate-100 p-4 text-[#081c35] sm:p-6">
    {toast && <div className="fixed right-5 top-5 z-[90] rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-xl">{toast}</div>}
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-[#d6a817]">Miz Rita HQ</p><h1 className="mt-1 text-3xl font-bold">Payments HQ</h1><p className="mt-1 text-slate-600">Payments, balances, receipts, and refunds in one place.</p></div><button onClick={() => openNew()} className="rounded-xl bg-[#d6a817] px-5 py-3 font-bold"><Plus className="mr-2 inline h-4 w-4" />Record Payment</button></header>
    {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</section>
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, order, invoice, phone, or method" className="w-full rounded-xl border py-3 pl-11 pr-4 outline-none focus:border-[#d6a817]" /></div><div className="flex flex-wrap gap-2">{["All", "Paid", "Unpaid", "Partially Paid", "Today", "This Week", "This Month"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-xl px-3 py-2 text-sm font-bold ${filter === item ? "bg-[#081c35] text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>)}</div></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#081c35] text-xs uppercase text-white"><tr>{["Invoice Number", "Customer", "Order", "Amount Due", "Amount Paid", "Balance", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-4">{heading}</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.payment.id} className="border-b hover:bg-slate-50"><td className="px-4 py-4 font-bold">{row.payment.invoice_number}</td><td className="px-4 py-4">{customerName(row.customer)}</td><td className="px-4 py-4">{row.order?.order_number ?? "Unknown"}</td><td className="px-4 py-4 font-bold">{money(Number(row.payment.amount_due))}</td><td className="px-4 py-4 font-bold text-emerald-700">{money(Number(row.payment.amount))}</td><td className="px-4 py-4 font-bold">{money(Number(row.payment.balance))}</td><td className="px-4 py-4"><Status value={row.payment.status} /></td><td className="px-4 py-4"><button onClick={() => setSelected(row.payment.id)} className="rounded-lg bg-[#081c35] px-3 py-2 font-bold text-white">View</button></td></tr>)}</tbody></table>{!loading && !filtered.length && <p className="p-10 text-center text-slate-500">No payments match this view.</p>}</div>
    </section>
    {selectedRow && <PaymentProfile row={selectedRow} payments={payments} saving={saving} onClose={() => setSelected(null)} onRecord={() => openNew(selectedRow.payment.order_id)} onEdit={() => openEdit(selectedRow.payment)} onRefund={() => beginRefund(selectedRow.payment)} onDelete={() => void deletePayment(selectedRow.payment)} />}
    {editor && <PaymentEditor title={editor === "new" ? "Record Payment" : "Edit Payment"} form={form} orders={orders} customers={customers} saving={saving} lockOrder={editor !== "new"} onChange={setForm} onClose={() => setEditor(null)} onSave={(event) => void savePayment(event)} />}
    {refundPayment && <PaymentEditor title={`Refund ${refundPayment.payment_number}`} form={form} orders={orders} customers={customers} saving={saving} lockOrder onChange={setForm} onClose={() => setRefundPayment(null)} onSave={(event) => void createRefund(event)} refund />}
  </main>;
}

function PaymentProfile({ row, payments, saving, onClose, onRecord, onEdit, onRefund, onDelete }: { row: Row; payments: Payment[]; saving: boolean; onClose: () => void; onRecord: () => void; onEdit: () => void; onRefund: () => void; onDelete: () => void }) {
  const history = payments.filter((item) => item.order_id === row.payment.order_id && item.record_type === "Transaction"); const refunds = history.filter((item) => item.status === "Refunded");
  const details = parseNotes(row.order?.notes ?? null); const receipt = receiptText(row);
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"><div className="h-full w-full max-w-4xl overflow-y-auto bg-slate-100 shadow-2xl"><header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Payment Profile</p><h2 className="text-2xl font-bold">{row.payment.payment_number}</h2></div><button onClick={onClose}><X /></button></header><div className="space-y-5 p-5">
    <section className="rounded-3xl bg-[#081c35] p-6 text-white"><p className="text-slate-300">Amount Due</p><p className="mt-2 text-4xl font-bold">{money(Number(row.payment.amount_due))}</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300"><span>{money(Number(row.payment.balance))} balance</span><Status value={row.payment.status} /></div></section>
    <Info title="Customer Information" rows={[["Customer", customerName(row.customer)], ["Phone", row.customer?.phone || "Not provided"], ["Email", row.customer?.email || "Not provided"]]} />
    <Info title="Order & Invoice" rows={[["Order", row.order?.order_number || "Unknown"], ["Invoice", row.payment.invoice_number], ["Order Total", money(Number(row.order?.total || 0))], ["Remaining Balance", money(Number(row.order?.balance_due || 0))], ["Fulfillment Type", row.delivery?.delivery_type || "Not available"], ["Fulfillment Status", row.delivery?.status || "Not available"], ["Meal Plan", details.mealPlan], ["Payment Method", row.payment.payment_method], ["Transaction Number", row.payment.transaction_number || "Not provided"], ["Internal Notes", row.payment.internal_notes || "None"]]} />
    <History title="Payment History" rows={history.map((item) => [dateTime(item.payment_date), item.payment_number, item.status, `${item.status === "Refunded" ? "−" : ""}${money(Number(item.amount))}`])} />
    <History title="Refund History" rows={refunds.map((item) => [dateTime(item.payment_date), item.payment_number, item.payment_method, money(Number(item.amount))])} />
    <History title="Activity Timeline" rows={[[dateTime(row.payment.created_at), "Payment Created", row.payment.payment_number, money(Number(row.payment.amount))], ...(row.payment.updated_at !== row.payment.created_at ? [[dateTime(row.payment.updated_at), "Payment Updated", row.payment.status, row.payment.payment_method]] : [])]} />
    <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">Quick Actions</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{row.payment.record_type === "Order Summary" ? <Action icon={<CreditCard />} label="Record Payment" onClick={onRecord} /> : <><Action icon={<Pencil />} label="Edit Payment" onClick={onEdit} /><Action icon={<RotateCcw />} label="Refund Payment" onClick={onRefund} disabled={row.payment.status === "Refunded" || remainingRefundable(row.payment, payments) <= 0} /><Action icon={<Trash2 />} label="Delete Payment" onClick={onDelete} danger /></>}<Action icon={<Printer />} label="Print Receipt" onClick={() => printDocument(row, "Receipt")} /><Action icon={<Mail />} label="Email Receipt" href={row.customer?.email ? `mailto:${row.customer.email}?subject=${encodeURIComponent(`Receipt ${row.payment.payment_number}`)}&body=${encodeURIComponent(receipt)}` : undefined} /><Action icon={<Send />} label="Text Receipt" href={row.customer?.phone ? `sms:${row.customer.phone}?body=${encodeURIComponent(receipt)}` : undefined} /><Action icon={<FileText />} label="Print Invoice" onClick={() => printDocument(row, "Invoice")} /></div>{saving && <p className="mt-3 text-sm text-slate-500">Saving changes...</p>}</section>
  </div></div></div>;
}
function PaymentEditor({ title, form, orders, customers, saving, lockOrder, onChange, onClose, onSave, refund }: { title: string; form: PaymentForm; orders: Order[]; customers: Customer[]; saving: boolean; lockOrder: boolean; onChange: (form: PaymentForm) => void; onClose: () => void; onSave: (event: FormEvent) => void; refund?: boolean }) {
  const field = (key: keyof PaymentForm, value: string) => onChange({ ...form, [key]: value });
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4"><form onSubmit={onSave} className="mx-auto my-10 max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6a817]">Payments HQ</p><h2 className="text-2xl font-bold">{title}</h2></div><button type="button" onClick={onClose}><X /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Field label="Order"><select required disabled={lockOrder} value={form.orderId} onChange={(event) => { const order = orders.find((item) => item.id === event.target.value); onChange({ ...form, orderId: event.target.value, amount: order ? String(order.balance_due) : "" }); }} className="payment-input"><option value="">Select order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {customerName(customers.find((item) => item.id === order.customer_id))} · {money(Number(order.balance_due))} due</option>)}</select></Field><Field label={refund ? "Refund Date" : "Payment Date"}><input required type="datetime-local" value={form.date} onChange={(event) => field("date", event.target.value)} className="payment-input" /></Field><Field label="Payment Method"><select disabled={refund} value={form.method} onChange={(event) => field("method", event.target.value)} className="payment-input">{methods.map((method) => <option key={method}>{method}</option>)}</select></Field><Field label={refund ? "Refund Amount" : "Amount"}><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => field("amount", event.target.value)} className="payment-input" /></Field><Field label="Transaction Number"><input value={form.transaction} onChange={(event) => field("transaction", event.target.value)} className="payment-input" /></Field><div className="sm:col-span-2"><Field label="Internal Notes"><textarea rows={4} value={form.notes} onChange={(event) => field("notes", event.target.value)} className="payment-input" /></Field></div><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} className={`rounded-xl px-5 py-3 font-bold disabled:opacity-50 ${refund ? "bg-red-600 text-white" : "bg-[#d6a817]"}`}>{saving ? "Saving..." : refund ? "Record Refund" : "Save Payment"}</button></div>
  </div><style jsx global>{`.payment-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;background:white;outline:none}.payment-input:focus{border-color:#d6a817;box-shadow:0 0 0 3px rgb(214 168 23/.15)}.payment-input:disabled{background:#f1f5f9}`}</style></form></div>;
}

function Info({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">{title}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap font-bold">{value}</p></div>)}</div></section>; }
function History({ title, rows }: { title: string; rows: string[][] }) { return <section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">{title}</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><tbody>{rows.map((row, index) => <tr key={index} className="border-b">{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-3 py-3 ${cellIndex === 1 ? "font-bold" : ""}`}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="py-5 text-slate-500">No activity recorded.</p>}</div></section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }
function Status({ value }: { value: string }) { const style = value === "Paid" || value === "Completed" ? "bg-emerald-100 text-emerald-800" : value === "Partial" ? "bg-amber-100 text-amber-800" : value === "Refunded" ? "bg-purple-100 text-purple-800" : "bg-red-100 text-red-800"; return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${style}`}>{value}</span>; }
function Action({ icon, label, onClick, href, danger, disabled }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; danger?: boolean; disabled?: boolean }) { const classes = `flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200"} ${disabled ? "pointer-events-none opacity-40" : ""}`; return href ? <a href={href} className={classes}>{icon}{label}</a> : <button onClick={onClick} disabled={disabled || !onClick} className={classes}>{icon}{label}</button>; }
function customerName(customer?: Customer) { return customer ? `${customer.first_name} ${customer.last_name ?? ""}`.trim() : "Unknown Customer"; }
function parseNotes(notes: string | null) { return { mealPlan: notes?.match(/^Meal Plan:\s*(.+)$/im)?.[1]?.trim() ?? "Not specified" }; }
function remainingRefundable(payment: Payment, payments: Payment[]) { if (payment.status === "Refunded") return 0; return Math.max(0, Number(payment.amount) - payments.filter((item) => item.parent_payment_id === payment.id && item.status === "Refunded").reduce((sum, item) => sum + Number(item.amount), 0)); }
function receiptText(row: Row) { return `Miz Rita HQ receipt ${row.payment.payment_number}\nOrder: ${row.order?.order_number ?? ""}\nAmount: ${money(Number(row.payment.amount))}\nMethod: ${row.payment.payment_method}\nDate: ${dateTime(row.payment.payment_date)}\nBalance: ${money(Number(row.order?.balance_due || 0))}`; }
function printDocument(row: Row, type: "Receipt" | "Invoice") {
  const popup = window.open("", "_blank", "width=850,height=700"); if (!popup) return;
  popup.document.write(`<html><head><title>${type} ${row.payment.invoice_number}</title><style>body{font-family:Arial;padding:40px;color:#081c35}.header{border-bottom:4px solid #d6a817;padding-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.card{border:1px solid #ddd;border-radius:12px;padding:16px}.label{font-size:11px;color:#64748b;text-transform:uppercase}.value{font-size:18px;font-weight:bold;margin-top:5px}.amount{font-size:32px}</style></head><body><div class="header"><h1>Miz Rita HQ</h1><p>${type} · ${escapeHtml(row.payment.invoice_number)}</p></div><div class="grid"><div class="card"><div class="label">Customer</div><div class="value">${escapeHtml(customerName(row.customer))}</div></div><div class="card"><div class="label">Order</div><div class="value">${escapeHtml(row.order?.order_number ?? "")}</div></div><div class="card"><div class="label">${type === "Receipt" ? "Amount Paid" : "Order Total"}</div><div class="value amount">${money(type === "Receipt" ? Number(row.payment.amount) : Number(row.order?.total || 0))}</div></div><div class="card"><div class="label">Balance Due</div><div class="value amount">${money(Number(row.order?.balance_due || 0))}</div></div><div class="card"><div class="label">Method</div><div class="value">${row.payment.payment_method}</div></div><div class="card"><div class="label">Transaction</div><div class="value">${escapeHtml(row.payment.transaction_number || "Not provided")}</div></div></div><script>window.onload=()=>window.print()</script></body></html>`); popup.document.close();
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character); }
