"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardList,
  Package,
  PackageCheck,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  parLevel: number;
  costPerUnit: number;
  vendor: string;
  lastUpdated: string;
};

type InventoryHistory = {
  id: string;
  date: string;
  ingredient: string;
  quantityChange: number;
  unit: string;
  reason: string;
};

type IngredientForm = {
  name: string;
  quantity: string;
  unit: string;
  parLevel: string;
  costPerUnit: string;
  vendor: string;
};

const today = () => new Date().toISOString();

const emptyIngredientForm: IngredientForm = {
  name: "",
  quantity: "",
  unit: "lb",
  parLevel: "",
  costPerUnit: "",
  vendor: "",
};

const formatQuantity = (value: number, unit: string) =>
  unit === "lb" ? value.toFixed(2) : Math.round(value).toString();

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

const getStatus = (item: InventoryItem) => {
  if (item.quantity <= 0) return "Out of Stock";
  if (item.quantity < item.parLevel) return "Low";
  return "Healthy";
};

const statusClasses = {
  Healthy: "bg-emerald-100 text-emerald-800",
  Low: "bg-amber-100 text-amber-800",
  "Out of Stock": "bg-red-100 text-red-800",
};

export default function InventoryPage() {
  const [businessId, setBusinessId] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<InventoryHistory[]>([]);
  const [message, setMessage] = useState("");
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [purchaseListOpen, setPurchaseListOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ingredientForm, setIngredientForm] = useState(emptyIngredientForm);
  const [receiveIngredientId, setReceiveIngredientId] = useState("");
  const [receivedQuantity, setReceivedQuantity] = useState("");

  const loadInventory = useCallback(async () => {
    try {
      const { data: business, error: businessError } = await supabase.from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle();
      if (businessError || !business) throw businessError ?? new Error("Business not found.");
      setBusinessId(business.id);
      const [itemResult, historyResult] = await Promise.all([
        supabase.from("gbgs_inventory_items").select("*").eq("business_id", business.id).order("name"),
        supabase.from("gbgs_inventory_history").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (itemResult.error || historyResult.error) throw itemResult.error ?? historyResult.error;
      setItems((itemResult.data ?? []).map((item) => ({ id: item.id, name: item.name, category: item.category, quantity: Number(item.quantity), unit: item.unit, parLevel: Number(item.par_level), costPerUnit: Number(item.cost_per_unit), vendor: item.vendor ?? "Not set", lastUpdated: item.updated_at })));
      setHistory((historyResult.data ?? []).map((entry) => ({ id: entry.id, date: entry.created_at, ingredient: entry.ingredient, quantityChange: Number(entry.quantity_change), unit: entry.unit, reason: entry.reason })));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Inventory could not be loaded.");
    }
  }, []);
  useEffect(() => { void loadInventory(); }, [loadInventory]);
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`inventory-hq-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_inventory_items", filter: `business_id=eq.${businessId}` }, () => void loadInventory())
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_inventory_history", filter: `business_id=eq.${businessId}` }, () => void loadInventory())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadInventory]);

  const addHistory = async (
    inventoryItemId: string,
    ingredient: string,
    quantityChange: number,
    unit: string,
    reason: string,
  ) => {
    await supabase.from("gbgs_inventory_history").insert({ business_id: businessId, inventory_item_id: inventoryItemId, ingredient, quantity_change: quantityChange, unit, reason });
  };

  const purchaseItems = useMemo(
    () => items.filter((item) => getStatus(item) !== "Healthy"),
    [items],
  );
  const inventoryValue = items.reduce(
    (sum, item) => sum + item.quantity * item.costPerUnit,
    0,
  );
  const lowStock = items.filter((item) => getStatus(item) === "Low").length;
  const outOfStock = items.filter((item) => getStatus(item) === "Out of Stock").length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const wasteThisWeek = history
    .filter((entry) => entry.reason === "Waste" && new Date(entry.date).getTime() >= weekAgo)
    .reduce((sum, entry) => sum + Math.abs(entry.quantityChange), 0);

  const openAddIngredient = () => {
    setEditingId(null);
    setIngredientForm(emptyIngredientForm);
    setIngredientModalOpen(true);
  };

  const openEditIngredient = (item: InventoryItem) => {
    setEditingId(item.id);
    setIngredientForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      parLevel: String(item.parLevel),
      costPerUnit: String(item.costPerUnit),
      vendor: item.vendor,
    });
    setIngredientModalOpen(true);
  };

  const saveIngredient = async (event: FormEvent) => {
    event.preventDefault();
    const timestamp = today();
    const nextItem: InventoryItem = {
      id: editingId ?? "",
      name: ingredientForm.name.trim(),
      category: editingId
        ? items.find((item) => item.id === editingId)?.category ?? "Ingredient"
        : "Ingredient",
      quantity: Math.max(0, Number(ingredientForm.quantity)),
      unit: ingredientForm.unit,
      parLevel: Math.max(0, Number(ingredientForm.parLevel)),
      costPerUnit: Math.max(0, Number(ingredientForm.costPerUnit)),
      vendor: ingredientForm.vendor.trim() || "Not set",
      lastUpdated: timestamp,
    };

    if (editingId) {
      const oldItem = items.find((item) => item.id === editingId);
      const { error: updateError } = await supabase.from("gbgs_inventory_items").update({ name: nextItem.name, quantity: nextItem.quantity, unit: nextItem.unit, par_level: nextItem.parLevel, cost_per_unit: nextItem.costPerUnit, vendor: nextItem.vendor, updated_at: timestamp }).eq("id", editingId);
      if (updateError) { setMessage(updateError.message); return; }
      if (oldItem && oldItem.quantity !== nextItem.quantity) {
        await addHistory(editingId, nextItem.name, nextItem.quantity - oldItem.quantity, nextItem.unit, "Count adjustment");
      }
      setMessage("Ingredient updated.");
    } else {
      const { data, error: insertError } = await supabase.from("gbgs_inventory_items").insert({ business_id: businessId, name: nextItem.name, category: nextItem.category, quantity: nextItem.quantity, unit: nextItem.unit, par_level: nextItem.parLevel, cost_per_unit: nextItem.costPerUnit, vendor: nextItem.vendor }).select("id").single();
      if (insertError || !data) { setMessage(insertError?.message ?? "Ingredient could not be added."); return; }
      await addHistory(data.id, nextItem.name, nextItem.quantity, nextItem.unit, "Ingredient added");
      setMessage("Ingredient added.");
    }
    await loadInventory();
    setIngredientModalOpen(false);
  };

  const receiveInventory = async (event: FormEvent) => {
    event.preventDefault();
    const selected = items.find((item) => item.id === receiveIngredientId);
    const quantity = Math.max(0, Number(receivedQuantity));
    if (!selected || quantity <= 0) return;

    const { error: updateError } = await supabase.rpc("gbgs_receive_inventory", {
      p_business_id: businessId,
      p_inventory_item_id: selected.id,
      p_quantity: quantity,
      p_reason: "Inventory received",
    });
    if (updateError) { setMessage(updateError.message); return; }
    await loadInventory();
    setMessage("Inventory received.");
    setReceiveModalOpen(false);
    setReceivedQuantity("");
  };

  const openReceiveInventory = () => {
    setReceiveIngredientId(items[0]?.id ?? "");
    setReceivedQuantity("");
    setReceiveModalOpen(true);
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb] p-4 text-slate-900 md:p-8">
      <section className="rounded-3xl bg-[#081c35] p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#d6a817]">Miz Rita HQ</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Inventory</h1>
            <p className="mt-2 text-slate-300">Know what you have, what is low, and what to buy.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={openAddIngredient} className="rounded-xl bg-[#d6a817] px-4 py-3 font-bold text-[#081c35]">
              <Plus size={18} className="mr-2 inline" />Add Ingredient
            </button>
            <button onClick={openReceiveInventory} className="rounded-xl border border-white/20 px-4 py-3 font-bold hover:bg-white/10">
              <PackageCheck size={18} className="mr-2 inline" />Receive Inventory
            </button>
            <button onClick={() => setPurchaseListOpen(true)} className="rounded-xl border border-white/20 px-4 py-3 font-bold hover:bg-white/10">
              <ShoppingCart size={18} className="mr-2 inline" />Generate Purchase List
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="fixed bottom-6 right-6 z-[90] flex items-center justify-between gap-4 rounded-2xl bg-[#081c35] px-5 py-4 text-sm font-semibold text-white shadow-2xl">
          <span>{message}</span>
          <button onClick={() => setMessage("")} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Total Inventory Value", value: `$${inventoryValue.toFixed(2)}`, icon: CircleDollarSign },
          { label: "Total Ingredients", value: items.length, icon: Package },
          { label: "Low Stock", value: lowStock, icon: AlertTriangle },
          { label: "Out of Stock", value: outOfStock, icon: Trash2 },
          { label: "Purchase List Items", value: purchaseItems.length, icon: ShoppingCart },
          { label: "Waste This Week", value: `${wasteThisWeek.toFixed(1)} units`, icon: ClipboardList },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-3 text-2xl font-bold text-[#081c35]">{card.value}</p>
                </div>
                <Icon size={20} className="shrink-0 text-[#d6a817]" />
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-2xl font-bold">Ingredients</h2>
          <p className="mt-1 text-sm text-slate-500">Production use is deducted automatically when a production plan is saved.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-[#081c35] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                {["Ingredient", "On Hand", "Minimum", "Status", "Last Updated", "Action"].map((heading) => (
                  <th key={heading} className="px-5 py-4">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const status = getStatus(item);
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-5 font-bold">{item.name}</td>
                    <td className="px-5 py-5 text-lg font-bold">{formatQuantity(item.quantity, item.unit)} {item.unit}</td>
                    <td className="px-5 py-5 text-slate-600">{formatQuantity(item.parLevel, item.unit)} {item.unit}</td>
                    <td className="px-5 py-5">
                      <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${statusClasses[status]}`}>{status}</span>
                    </td>
                    <td className="px-5 py-5 text-slate-600">{formatDate(item.lastUpdated)}</td>
                    <td className="px-5 py-5">
                      <button onClick={() => openEditIngredient(item)} className="rounded-xl border border-slate-300 px-4 py-2 font-bold hover:bg-slate-100">Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-2xl font-bold">Inventory History</h2>
          <p className="mt-1 text-sm text-slate-500">The most recent inventory changes.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                {["Date", "Ingredient", "Quantity Change", "Reason"].map((heading) => (
                  <th key={heading} className="px-5 py-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length ? history.slice(0, 12).map((entry) => (
                <tr key={entry.id}>
                  <td className="px-5 py-4 text-slate-600">{formatDate(entry.date)}</td>
                  <td className="px-5 py-4 font-bold">{entry.ingredient}</td>
                  <td className={`px-5 py-4 font-bold ${entry.quantityChange < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {entry.quantityChange > 0 ? "+" : ""}{formatQuantity(entry.quantityChange, entry.unit)} {entry.unit}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{entry.reason}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No inventory changes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {ingredientModalOpen && (
        <Modal title={editingId ? "Edit Ingredient" : "Add Ingredient"} onClose={() => setIngredientModalOpen(false)}>
          <form onSubmit={saveIngredient} className="grid gap-4 sm:grid-cols-2">
            <Field label="Ingredient Name">
              <input required value={ingredientForm.name} onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })} className="input" />
            </Field>
            <Field label="Current Quantity">
              <input required type="number" min="0" step="0.01" value={ingredientForm.quantity} onChange={(event) => setIngredientForm({ ...ingredientForm, quantity: event.target.value })} className="input" />
            </Field>
            <Field label="Unit">
              <select value={ingredientForm.unit} onChange={(event) => setIngredientForm({ ...ingredientForm, unit: event.target.value })} className="input">
                <option value="lb">lb</option><option value="oz">oz</option><option value="each">each</option><option value="case">case</option>
              </select>
            </Field>
            <Field label="Minimum Quantity">
              <input required type="number" min="0" step="0.01" value={ingredientForm.parLevel} onChange={(event) => setIngredientForm({ ...ingredientForm, parLevel: event.target.value })} className="input" />
            </Field>
            <Field label="Cost Per Unit">
              <input required type="number" min="0" step="0.01" value={ingredientForm.costPerUnit} onChange={(event) => setIngredientForm({ ...ingredientForm, costPerUnit: event.target.value })} className="input" />
            </Field>
            <Field label="Vendor">
              <input required value={ingredientForm.vendor} onChange={(event) => setIngredientForm({ ...ingredientForm, vendor: event.target.value })} className="input" />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setIngredientModalOpen(false)} className="rounded-xl border border-slate-300 px-5 py-3 font-bold">Cancel</button>
              <button type="submit" className="rounded-xl bg-[#081c35] px-5 py-3 font-bold text-white">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {receiveModalOpen && (
        <Modal title="Receive Inventory" onClose={() => setReceiveModalOpen(false)}>
          <form onSubmit={receiveInventory} className="space-y-4">
            <Field label="Ingredient">
              <select required value={receiveIngredientId} onChange={(event) => setReceiveIngredientId(event.target.value)} className="input">
                {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="Quantity Received">
                <input required type="number" min="0.01" step="0.01" value={receivedQuantity} onChange={(event) => setReceivedQuantity(event.target.value)} className="input" />
              </Field>
              <Field label="Unit">
                <input readOnly value={items.find((item) => item.id === receiveIngredientId)?.unit ?? ""} className="input bg-slate-100" />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReceiveModalOpen(false)} className="rounded-xl border border-slate-300 px-5 py-3 font-bold">Cancel</button>
              <button type="submit" className="rounded-xl bg-[#081c35] px-5 py-3 font-bold text-white">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {purchaseListOpen && (
        <Modal title="Purchase List" onClose={() => setPurchaseListOpen(false)} wide>
          <p className="mb-4 text-slate-500">Only ingredients below their minimum are shown.</p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[680px] text-left">
              <thead className="bg-[#081c35] text-xs uppercase text-slate-300">
                <tr>{["Ingredient", "Current Quantity", "Minimum Quantity", "Quantity Needed", "Vendor"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseItems.length ? purchaseItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4 font-bold">{item.name}</td>
                    <td className="px-4 py-4">{formatQuantity(item.quantity, item.unit)} {item.unit}</td>
                    <td className="px-4 py-4">{formatQuantity(item.parLevel, item.unit)} {item.unit}</td>
                    <td className="px-4 py-4 font-bold text-[#081c35]">{formatQuantity(item.parLevel - item.quantity, item.unit)} {item.unit}</td>
                    <td className="px-4 py-4">{item.vendor}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nothing needs to be purchased.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex justify-end"><button onClick={() => setPurchaseListOpen(false)} className="rounded-xl bg-[#081c35] px-5 py-3 font-bold text-white">Done</button></div>
        </Modal>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.75rem;
          padding: 0.75rem;
          background-color: white;
          color: rgb(15 23 42);
          outline: none;
        }
        .input:focus {
          border-color: #d6a817;
          box-shadow: 0 0 0 3px rgb(214 168 23 / 0.18);
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#020b16]/75 p-4 backdrop-blur-sm">
      <div className={`mx-auto my-8 overflow-hidden rounded-3xl bg-white shadow-2xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <header className="flex items-center justify-between bg-[#081c35] p-6 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#d6a817]">Miz Rita HQ</p>
            <h2 className="mt-1 text-2xl font-bold">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/20 p-2 hover:bg-white/10" aria-label={`Close ${title}`}><X /></button>
        </header>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
