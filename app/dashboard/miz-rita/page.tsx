"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  DollarSign,
  Plus,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SidebarContent } from "@/components/dashboard/sidebar";

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
  total: number;
  balance_due: number;
};

type CustomerForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  dietary_notes: string;
  customer_status: string;
};
const emptyCustomerForm: CustomerForm = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  dietary_notes: "",
  customer_status: "Active",
};

type OrderForm = {
  customer_id: string;
  fulfillment_date: string;
  order_status: string;
  payment_status: string;
  delivery_method: string;
  subtotal: string;
  delivery_fee: string;
  discount: string;
  amount_paid: string;
  notes: string;
};

const emptyOrderForm: OrderForm = {
  customer_id: "",
  fulfillment_date: "",
  order_status: "Pending",
  payment_status: "Unpaid",
  delivery_method: "Pickup",
  subtotal: "",
  delivery_fee: "",
  discount: "",
  amount_paid: "",
  notes: "",
};

export default function MizRitaPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [error, setError] = useState("");
  const [customerForm, setCustomerForm] =
    useState<CustomerForm>(emptyCustomerForm);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrderForm);
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || "You must be signed in.");
      setLoading(false);
      return;
    }

    const { data: business, error: businessError } = await supabase
      .from("gbgs_businesses")
      .select("id")
      .eq("slug", "miz-ritas-kitchen")
      .maybeSingle();

    if (businessError || !business) {
      setError(
        businessError?.message ||
          "Miz Rita's Kitchen business record was not found.",
      );
      setLoading(false);
      return;
    }

    setBusinessId(business.id);

    const [
      { data: customerData, error: customerError },
      { data: orderData, error: orderError },
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
    ]);

    if (customerError || orderError) {
      setError(
        customerError?.message ||
          orderError?.message ||
          "Unable to load Miz Rita data.",
      );
    } else {
      setCustomers((customerData ?? []) as Customer[]);
      setOrders((orderData ?? []) as Order[]);
    }

    setLoading(false);
  }

  function updateCustomerForm(field: keyof CustomerForm, value: string) {
    setCustomerForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openCustomerModal() {
    setCustomerForm(emptyCustomerForm);
    setError("");
    setShowCustomerModal(true);
  }

  function closeCustomerModal() {
    if (savingCustomer) return;

    setShowCustomerModal(false);
    setCustomerForm(emptyCustomerForm);
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || "You must be signed in.");
      setSavingCustomer(false);
      return;
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
      setError(insertError.message);
      setSavingCustomer(false);
      return;
    }

    setCustomers((current) => [data as Customer, ...current]);
    setCustomerForm(emptyCustomerForm);
    setShowCustomerModal(false);
    setSavingCustomer(false);
  }

  function updateOrderForm(field: keyof OrderForm, value: string) {
    setOrderForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openOrderModal() {
    setOrderForm(emptyOrderForm);
    setError("");
    setShowOrderModal(true);
  }

  function closeOrderModal() {
    if (savingOrder) return;
    setShowOrderModal(false);
    setOrderForm(emptyOrderForm);
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

    const subtotal = Number(orderForm.subtotal || 0);
    const deliveryFee = Number(orderForm.delivery_fee || 0);
    const discount = Number(orderForm.discount || 0);
    const amountPaid = Number(orderForm.amount_paid || 0);
    const total = Math.max(0, subtotal + deliveryFee - discount);
    const balanceDue = Math.max(0, total - amountPaid);

    setSavingOrder(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || "You must be signed in.");
      setSavingOrder(false);
      return;
    }

    const now = new Date();
    const orderNumber = `MR-${now.toISOString().replace(/\D/g, "").slice(0, 14)}`;

    const { data, error: insertError } = await supabase
      .from("gbgs_orders")
      .insert({
        business_id: businessId,
        created_by: user.id,
        customer_id: orderForm.customer_id,
        order_number: orderNumber,
        order_date: now.toISOString().slice(0, 10),
        fulfillment_date: orderForm.fulfillment_date || null,
        order_status: orderForm.order_status,
        payment_status: orderForm.payment_status,
        delivery_method: orderForm.delivery_method,
        subtotal,
        delivery_fee: deliveryFee,
        discount,
        amount_paid: amountPaid,
        total,
        balance_due: balanceDue,
        notes: orderForm.notes.trim() || null,
      })
      .select("*")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSavingOrder(false);
      return;
    }

    setOrders((current) => [data as Order, ...current]);
    setSavingOrder(false);
    closeOrderModal();
  }

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return customers;

    return customers.filter((customer) => {
      const fullName =
        `${customer.first_name} ${customer.last_name ?? ""}`.toLowerCase();

      return (
        fullName.includes(term) ||
        customer.phone?.toLowerCase().includes(term) ||
        customer.email?.toLowerCase().includes(term)
      );
    });
  }, [customers, search]);

  const totalRevenue = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );

  const unpaidBalance = orders.reduce(
    (sum, order) => sum + Number(order.balance_due || 0),
    0,
  );

  const openOrders = orders.filter(
    (order) => !["Completed", "Cancelled"].includes(order.order_status),
  ).length;

  return (
    <div className="min-h-screen bg-[#f1f4f8]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      <main className="px-5 py-6 lg:ml-64 lg:px-8">
        <section className="rounded-3xl bg-[#081c35] p-7 text-white shadow-xl">
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
                onClick={openCustomerModal}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
              >
                <Plus className="h-4 w-4" />
                New Customer
              </button>

              <button
                type="button"
                onClick={openOrderModal}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35]"
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
            detail="Active customer records"
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
            detail="Outstanding customer balances"
            icon={<Clock3 className="h-5 w-5" />}
          />
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#081c35]">
                Customer Directory
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Search customers and review their contact and dietary
                information.
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

          {error && !showCustomerModal ? (
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 py-14 text-center">
              <p className="font-semibold text-[#081c35]">No customers yet</p>

              <p className="mt-1 text-sm text-slate-500">
                Add the first Miz Rita customer to begin tracking orders.
              </p>

              <button
                type="button"
                onClick={openCustomerModal}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35]"
              >
                <Plus className="h-4 w-4" />
                Add First Customer
              </button>
            </div>
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
                      className="border-b border-slate-100 text-sm"
                    >
                      <td className="px-3 py-4 font-semibold text-[#081c35]">
                        {customer.first_name} {customer.last_name}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customer.phone || "—"}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customer.email || "—"}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customer.dietary_notes || "None"}
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                          {customer.customer_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
                  Miz Rita HQ
                </p>

                <h2 className="mt-1 text-2xl font-bold text-[#081c35]">
                  New Customer
                </h2>
              </div>

              <button
                type="button"
                onClick={closeCustomerModal}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
                      placeholder="Allergies, food restrictions, preferences, or health-related meal notes"
                    />
                  </FormField>
                </div>
              </div>

              {error ? (
                <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

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
          </div>
        </div>
      )}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
                  Miz Rita HQ
                </p>
                <h2 className="mt-1 text-2xl font-bold text-[#081c35]">
                  New Order
                </h2>
              </div>

              <button
                type="button"
                onClick={closeOrderModal}
                disabled={savingOrder}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveOrder} className="space-y-5 p-6">
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

              <div className="grid gap-5 md:grid-cols-2">
                <FormField label="Fulfillment Date">
                  <input
                    type="date"
                    value={orderForm.fulfillment_date}
                    onChange={(event) =>
                      updateOrderForm("fulfillment_date", event.target.value)
                    }
                    className="form-input"
                  />
                </FormField>

                <FormField label="Delivery Method">
                  <select
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
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </FormField>

                <FormField label="Payment Status">
                  <select
                    value={orderForm.payment_status}
                    onChange={(event) =>
                      updateOrderForm("payment_status", event.target.value)
                    }
                    className="form-input"
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                  </select>
                </FormField>

                <FormField label="Subtotal">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderForm.subtotal}
                    onChange={(event) =>
                      updateOrderForm("subtotal", event.target.value)
                    }
                    className="form-input"
                    placeholder="0.00"
                  />
                </FormField>

                <FormField label="Delivery Fee">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderForm.delivery_fee}
                    onChange={(event) =>
                      updateOrderForm("delivery_fee", event.target.value)
                    }
                    className="form-input"
                    placeholder="0.00"
                  />
                </FormField>

                <FormField label="Discount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderForm.discount}
                    onChange={(event) =>
                      updateOrderForm("discount", event.target.value)
                    }
                    className="form-input"
                    placeholder="0.00"
                  />
                </FormField>

                <FormField label="Amount Paid">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderForm.amount_paid}
                    onChange={(event) =>
                      updateOrderForm("amount_paid", event.target.value)
                    }
                    className="form-input"
                    placeholder="0.00"
                  />
                </FormField>
              </div>

              <FormField label="Order Notes">
                <textarea
                  value={orderForm.notes}
                  onChange={(event) =>
                    updateOrderForm("notes", event.target.value)
                  }
                  className="form-input min-h-28 resize-y"
                  placeholder="Meals, quantities, special instructions, delivery notes..."
                />
              </FormField>

              {error ? (
                <div className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeOrderModal}
                  disabled={savingOrder}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOrder || customers.length === 0}
                  className="rounded-xl bg-[#d6a817] px-5 py-3 text-sm font-bold text-[#081c35] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingOrder ? "Saving..." : "Save Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .form-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
          color: #081c35;
          outline: none;
        }

        .form-input:focus {
          border-color: #d6a817;
          box-shadow: 0 0 0 3px rgba(214, 168, 23, 0.12);
        }
      `}</style>
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
      <div className="flex items-start justify-between">
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}