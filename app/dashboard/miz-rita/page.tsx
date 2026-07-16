"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  ChefHat,
  Clock3,
  Container,
  Copy,
  DollarSign,
  FileText,
  Mail,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  UtensilsCrossed,
  ShoppingBag,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { SidebarContent } from "@/components/dashboard/sidebar";
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
  delivery_method?: string | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  discount?: number | null;
  amount_paid?: number | null;
  total: number;
  balance_due: number;
  notes?: string | null;
  created_at?: string;
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


const MEAL_PLANS = [
  {
    id: "6-meal",
    name: "6 Meal Plan",
    meals: 6,
    price: 95,
  },
  {
    id: "8-meal",
    name: "8 Meal Plan",
    meals: 8,
    price: 120,
  },
  {
    id: "10-meal",
    name: "10 Meal Plan",
    meals: 10,
    price: 150,
  },
  {
    id: "family-plan",
    name: "Family Plan",
    meals: 20,
    price: 280,
  },
] as const;


export default function MizRitaPage() {
  const [businessId, setBusinessId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

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
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [orderForm, setOrderForm] =
    useState<OrderFormState>(EMPTY_ORDER_FORM);

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
        throw new Error(
          customerError?.message ||
            orderError?.message ||
            "Unable to load Miz Rita data.",
        );
      }

      setCustomers((customerData ?? []) as Customer[]);
      setOrders((orderData ?? []) as Order[]);
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

    return orders.filter(
      (order) => order.customer_id === selectedCustomer.id,
    );
  }, [orders, selectedCustomer]);


  const productionOrders = useMemo(() => {
    return orders
      .filter(
        (order) =>
          !["Completed", "Cancelled"].includes(order.order_status),
      )
      .map((order) => {
        const details = parseOrderDetails(order.notes);
        const meals = Number(details.numberOfMeals);

        return {
          ...order,
          customer_name:
            customerNames.get(order.customer_id) || "Unknown customer",
          meal_plan: details.mealPlan,
          meals: Number.isFinite(meals) ? meals : 0,
          production_status: getProductionStatus(order.fulfillment_date),
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
        .filter((order) => order.production_status === "Prep Today")
        .reduce((sum, order) => sum + order.meals, 0),
    [productionOrders],
  );

  const upcomingMeals = useMemo(
    () =>
      productionOrders.reduce((sum, order) => sum + order.meals, 0),
    [productionOrders],
  );

  const containersNeeded = upcomingMeals;

  const totalRevenue = useMemo(
    () =>
      orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders],
  );

  const unpaidBalance = useMemo(
    () =>
      orders.reduce(
        (sum, order) => sum + Number(order.balance_due || 0),
        0,
      ),
    [orders],
  );

  const openOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          !["Completed", "Cancelled"].includes(order.order_status),
      ).length,
    [orders],
  );

  function updateCustomerForm(
    field: keyof CustomerFormState,
    value: string,
  ) {
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

    const selectedPlan = MEAL_PLANS.find((plan) => plan.id === planId);

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
          notes: buildOrderNotes(orderForm),
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      setOrders((current) => [data as Order, ...current]);
      setOrderForm(EMPTY_ORDER_FORM);
      setOrderStep(1);
      setShowOrderModal(false);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setSavingOrder(false);
    }
  }

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

              <h1 className="mt-2 text-3xl font-bold">
                Customers & Orders
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Manage customers, meal-prep orders, balances,
                fulfillment dates, and repeat business.
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
                  className={`h-4 w-4 ${
                    refreshing ? "animate-spin" : ""
                  }`}
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

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#081c35]">
                Customer Directory
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Search customers and review contact and dietary
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
                        {customer.phone || "—"}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {customer.email || "—"}
                      </td>

                      <td className="max-w-sm px-3 py-4 text-slate-600">
                        {customer.dietary_notes || "None"}
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
                See what needs to be prepared, how many meals are due, and when each order is scheduled.
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
                          value={order.production_status}
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
                These plans automatically fill the meal count and subtotal when creating an order.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MEAL_PLANS.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <p className="text-sm font-bold text-[#081c35]">
                  {plan.name}
                </p>
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
            <h2 className="text-xl font-bold text-[#081c35]">
              Recent Orders
            </h2>

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
              onAction={
                customers.length > 0 ? openOrderModal : undefined
              }
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
                    updateCustomerForm(
                      "customer_status",
                      event.target.value,
                    )
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
                      updateCustomerForm(
                        "dietary_notes",
                        event.target.value,
                      )
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
                      MEAL_PLANS.find(
                        (plan) => plan.name === orderForm.meal_plan,
                      )?.id || ""
                    }
                    onChange={(event) => selectMealPlan(event.target.value)}
                    className="form-input"
                  >
                    <option value="">Select meal plan</option>
                    {MEAL_PLANS.map((plan) => (
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
                        updateOrderForm(
                          "delivery_method",
                          event.target.value,
                        )
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
                        updateOrderForm(
                          "fulfillment_date",
                          event.target.value,
                        )
                      }
                      className="form-input"
                    />
                  </FormField>

                  <FormField label="Pickup/Delivery Time">
                    <input
                      type="time"
                      value={orderForm.pickup_time}
                      onChange={(event) =>
                        updateOrderForm(
                          "pickup_time",
                          event.target.value,
                        )
                      }
                      className="form-input"
                    />
                  </FormField>

                  <FormField label="Order Status">
                    <select
                      value={orderForm.order_status}
                      onChange={(event) =>
                        updateOrderForm(
                          "order_status",
                          event.target.value,
                        )
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
                        updateOrderForm(
                          "payment_status",
                          event.target.value,
                        )
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
                    onChange={(value) =>
                      updateOrderForm("amount_paid", value)
                    }
                  />

                  <MoneyInput
                    label="Delivery Fee"
                    value={orderForm.delivery_fee}
                    onChange={(value) =>
                      updateOrderForm("delivery_fee", value)
                    }
                  />

                  <MoneyInput
                    label="Discount"
                    value={orderForm.discount}
                    onChange={(value) =>
                      updateOrderForm("discount", value)
                    }
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
                      The order will not save until you check this box and press Finish & Save Order.
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
          customer={selectedCustomer}
          orders={selectedCustomerOrders}
          onClose={() => setSelectedCustomer(null)}
          onCreateOrder={() => {
            setSelectedCustomer(null);
            setOrderForm({
              ...EMPTY_ORDER_FORM,
              customer_id: selectedCustomer.id,
            });
            setError("");
            setOrderStep(2);
            setShowOrderModal(true);
          }}
        />
      ) : null}

      {selectedOrder ? (
        <OrderDetailsModal
          order={selectedOrder}
          customerName={
            customerNames.get(selectedOrder.customer_id) ||
            "Unknown customer"
          }
          updating={updatingOrder}
          onClose={() => setSelectedOrder(null)}
          onMarkCompleted={async () => {
            setUpdatingOrder(true);
            setError("");

            const { data, error: updateError } = await supabase
              .from("gbgs_orders")
              .update({
                order_status: "Completed",
              })
              .eq("id", selectedOrder.id)
              .select("*")
              .single();

            if (updateError) {
              setError(updateError.message);
              setUpdatingOrder(false);
              return;
            }

            const updatedOrder = data as Order;

            setOrders((current) =>
              current.map((order) =>
                order.id === updatedOrder.id ? updatedOrder : order,
              ),
            );
            setSelectedOrder(updatedOrder);
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

            const { data, error: duplicateError } = await supabase
              .from("gbgs_orders")
              .insert({
                business_id: businessId,
                created_by: user.id,
                customer_id: selectedOrder.customer_id,
                order_number: orderNumber,
                order_date: now.toISOString().slice(0, 10),
                fulfillment_date: selectedOrder.fulfillment_date,
                order_status: "Pending",
                payment_status: "Unpaid",
                delivery_method: selectedOrder.delivery_method || "Pickup",
                subtotal: Number(selectedOrder.subtotal || 0),
                delivery_fee: Number(selectedOrder.delivery_fee || 0),
                discount: Number(selectedOrder.discount || 0),
                amount_paid: 0,
                total: Number(selectedOrder.total || 0),
                balance_due: Number(selectedOrder.total || 0),
                notes: selectedOrder.notes || null,
              })
              .select("*")
              .single();

            if (duplicateError) {
              setError(duplicateError.message);
              setUpdatingOrder(false);
              return;
            }

            const duplicatedOrder = data as Order;
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



function OrderDetailsModal({
  order,
  customerName,
  updating,
  onClose,
  onMarkCompleted,
  onDuplicate,
  onDelete,
}: {
  order: Order;
  customerName: string;
  updating: boolean;
  onClose: () => void;
  onMarkCompleted: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const orderDetails = parseOrderDetails(order.notes);

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
              <div class="value">${escapeHtml(
                orderDetails.numberOfMeals,
              )}</div>
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
                      <td>${formatMoney(
                        Number(order.amount_paid || 0),
                      )}</td>
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

          <section className="grid gap-4 sm:grid-cols-2">
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
            <h3 className="text-lg font-bold text-[#081c35]">
              Order Notes
            </h3>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {orderDetails.freeformNotes}
            </p>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">
              Order Actions
            </h3>

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
        className={
          bold ? "font-bold text-[#081c35]" : "text-sm text-slate-600"
        }
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function CustomerDetailsModal({
  customer,
  orders,
  onClose,
  onCreateOrder,
}: {
  customer: Customer;
  orders: Order[];
  onClose: () => void;
  onCreateOrder: () => void;
}) {
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-[#f1f4f8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6a817]">
              Customer Profile
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
                onClick={onCreateOrder}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d6a817] px-4 py-3 text-sm font-bold text-[#081c35]"
              >
                <Plus className="h-4 w-4" />
                Create Order
              </button>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <ProfileStat
              label="Total Orders"
              value={orders.length.toString()}
            />
            <ProfileStat
              label="Completed"
              value={completedOrders.toString()}
            />
            <ProfileStat
              label="Total Spent"
              value={formatMoney(totalSpent)}
            />
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">
              Contact Information
            </h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <ContactItem
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={customer.phone || "Not provided"}
              />

              <ContactItem
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={customer.email || "Not provided"}
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#081c35]">
              Dietary Notes
            </h3>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {customer.dietary_notes || "No dietary notes recorded."}
            </p>
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
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-[#081c35]">
                          {order.order_number}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Ordered {formatDate(order.order_date)}
                          {order.fulfillment_date
                            ? ` • Fulfillment ${formatDate(
                                order.fulfillment_date,
                              )}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={order.order_status} />
                        <StatusBadge value={order.payment_status} />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Total
                        </p>
                        <p className="mt-1 font-bold text-[#081c35]">
                          {formatMoney(Number(order.total || 0))}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Balance
                        </p>
                        <p className="mt-1 font-bold text-red-700">
                          {formatMoney(Number(order.balance_due || 0))}
                        </p>
                      </div>
                    </div>

                    {order.notes ? (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {order.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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
  const steps = [
    "Customer",
    "Meal Plan",
    "Schedule",
    "Payment",
    "Review",
  ];

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

function validateOrderStep(
  step: number,
  form: OrderFormState,
): string | null {
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

            <h2 className="mt-1 text-2xl font-bold text-[#081c35]">
              {title}
            </h2>
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

          <p className="mt-2 text-2xl font-bold text-[#081c35]">
            {value}
          </p>

          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>

        <div className="rounded-xl bg-[#081c35] p-3 text-white">
          {icon}
        </div>
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
          <p className="mt-2 text-3xl font-bold text-[#081c35]">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>

        <div className="rounded-xl bg-[#d6a817] p-3 text-[#081c35]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProductionStatusBadge({ value }: { value: string }) {
  let className =
    "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";

  if (value === "Prep Today") {
    className =
      "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
  } else if (value === "Prep Tomorrow") {
    className =
      "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  } else if (value === "Upcoming") {
    className =
      "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
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
        <span className="font-bold text-[#081c35]">
          {formatMoney(total)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500">Balance Due</span>
        <span className="font-bold text-red-700">
          {formatMoney(balance)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();

  let className =
    "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";

  if (
    ["active", "completed", "paid", "confirmed"].includes(normalized)
  ) {
    className =
      "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200";
  } else if (
    ["pending", "partial", "in progress", "lead"].includes(normalized)
  ) {
    className =
      "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  } else if (
    ["cancelled", "inactive", "unpaid"].includes(normalized)
  ) {
    className =
      "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${className}`}
    >
      {value}
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

  if (differenceInDays <= 0) {
    return "Prep Today";
  }

  if (differenceInDays === 1) {
    return "Prep Tomorrow";
  }

  return "Upcoming";
}

function buildOrderNotes(form: OrderFormState) {
  const metadata = [
    `Meal Plan: ${form.meal_plan.trim() || "Not specified"}`,
    `Number of Meals: ${form.number_of_meals.trim() || "Not specified"}`,
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

function parseOrderDetails(notes?: string | null) {
  const value = notes || "";

  const mealPlan =
    value.match(/^Meal Plan:\s*(.+)$/im)?.[1]?.trim() || "Not specified";

  const numberOfMeals =
    value.match(/^Number of Meals:\s*(.+)$/im)?.[1]?.trim() ||
    "Not specified";

  const pickupDeliveryDate =
    value.match(/^Pickup\/Delivery Date:\s*(.+)$/im)?.[1]?.trim() ||
    "Not scheduled";

  const pickupDeliveryTime =
    value.match(/^Pickup\/Delivery Time:\s*(.+)$/im)?.[1]?.trim() ||
    "Not scheduled";

  const freeformNotes = value.includes("Notes:")
    ? value.split(/Notes:\s*/i).slice(1).join("Notes:").trim()
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
