import type { SupabaseClient } from "@supabase/supabase-js"

export type Membership = { organization_id: string; role: string }
export type Organization = { id: string; name: string; owner_name: string; status: string }
export type Business = { id: string; organization_id: string; name: string; business_type: string; status: string; description: string | null }
export type BusinessFinancial = { id: string; organization_id: string; ownership_percentage: number | string | null; monthly_revenue: number | string; monthly_expenses: number | string }
export type Transaction = { id: string; organization_id: string; business_id: string | null; transaction_type: string; amount: number | string; transaction_date: string; status: string; category?: string | null; description?: string | null }
export type Receivable = { id: string; organization_id: string; amount_due: number | string; amount_paid: number | string; status: string; business_id?: string | null; customer_name?: string; due_date?: string | null }
export type Bill = { id: string; organization_id: string; amount: number | string; due_date: string; status: string; business_id?: string | null; vendor_name?: string }
export type FinancialData = { businesses: BusinessFinancial[]; transactions: Transaction[]; receivables: Receivable[]; bills: Bill[] }
export type OrganizationOption = Organization & { role: string }
export type BenData =
  | { status: "empty" }
  | { status: "choose"; organizations: OrganizationOption[] }
  | { status: "ready"; userId: string; userEmail?: string; organizations: OrganizationOption[]; organization: OrganizationOption; businesses: Business[]; financials: FinancialData | null; financialError: string | null }

export const canReadFinancials = (role: string) => ["owner", "admin", "manager"].includes(role)
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)
export function numeric(value: number | string) {
  const number = Number(value)
  if (!Number.isFinite(number) || (typeof value === "string" && !value.trim())) throw new Error("Invalid financial amount")
  return number
}
const cents = (value: number | string) => Math.round(numeric(value) * 100)
export const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
export function reportingDates(now: Date) {
  return {
    today: day(now),
    chartStart: day(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
    monthStart: day(new Date(now.getFullYear(), now.getMonth(), 1)),
    quarterStart: day(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)),
    billEnd: day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)),
  }
}
export function summarizeFinancials(financials: FinancialData, period: "month" | "quarter", now: Date) {
  const dates = reportingDates(now)
  const start = period === "month" ? dates.monthStart : dates.quarterStart
  const posted = financials.transactions.filter(row => row.status === "completed" && row.transaction_date >= start && row.transaction_date <= dates.today)
  const revenue = posted.filter(row => row.transaction_type === "income").reduce((sum, row) => sum + cents(row.amount), 0) / 100
  const expenses = posted.filter(row => row.transaction_type === "expense").reduce((sum, row) => sum + cents(row.amount), 0) / 100
  const openReceivables = financials.receivables.filter(row => !["paid", "cancelled"].includes(row.status))
  const dueBills = financials.bills.filter(row => !["paid", "cancelled"].includes(row.status) && row.due_date <= dates.billEnd)
  const owed = openReceivables.reduce((sum, row) => sum + Math.max(0, cents(row.amount_due) - cents(row.amount_paid)), 0) / 100
  const bills = dueBills.reduce((sum, row) => sum + cents(row.amount), 0) / 100
  const chart = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    const prefix = day(date).slice(0, 7)
    const rows = financials.transactions.filter(row => row.status === "completed" && row.transaction_date.startsWith(prefix) && row.transaction_date <= dates.today)
    return {
      key: prefix, label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      revenue: rows.filter(row => row.transaction_type === "income").reduce((sum, row) => sum + cents(row.amount), 0) / 100,
      expenses: rows.filter(row => row.transaction_type === "expense").reduce((sum, row) => sum + cents(row.amount), 0) / 100,
    }
  })
  return { revenue, expenses, net: revenue - expenses, owed, bills, transactionCount: posted.length, receivableCount: openReceivables.length, billCount: dueBills.length, chart }
}

type Page<T> = { data: T[] | null; error: { message: string } | null; count: number | null }
export async function collectPages<T>(request: (from: number, to: number) => PromiseLike<Page<T>>) {
  const rows: T[] = []
  // Count prevents silently accepting Supabase's configurable response row cap.
  while (true) {
    const result = await request(rows.length, rows.length + 499)
    if (result.error) throw new Error(result.error.message)
    if (result.count === null) throw new Error("Missing result count")
    rows.push(...(result.data ?? []))
    if (rows.length >= result.count) return rows
    if (!result.data?.length) throw new Error("Incomplete result set; reload the dashboard")
  }
}
function assertTenant(rows: { organization_id: string }[], organizationId: string) {
  if (rows.some(row => row.organization_id !== organizationId)) throw new Error("Unexpected organization in response")
}

export async function loadBenData(client: SupabaseClient, userId: string, selectedOrganizationId: string | null, signal: AbortSignal, now = new Date()): Promise<BenData> {
  const memberships = await collectPages<Membership>((from, to) => client.from("ben_organization_members")
    .select("organization_id,role", { count: "exact" }).eq("user_id", userId).order("organization_id").range(from, to).abortSignal(signal))
  if (!memberships.length) return { status: "empty" }
  const organizations: OrganizationOption[] = []
  // Fetch only organizations discovered through the caller's own memberships.
  for (const member of memberships) {
    const result = await client.from("ben_organizations").select("id,name,owner_name,status").eq("id", member.organization_id).abortSignal(signal).single()
    if (result.error || !result.data || result.data.id !== member.organization_id) throw new Error("Unable to load your organization")
    organizations.push({ ...(result.data as Organization), role: member.role })
  }
  const organization = selectedOrganizationId
    ? organizations.find(row => row.id === selectedOrganizationId)
    : organizations.length === 1 ? organizations[0] : undefined
  if (!organization) return { status: "choose", organizations }
  const organizationId = organization.id
  const businesses = await collectPages<Business>((from, to) => client.from("ben_business_directory")
    .select("id,organization_id,name,business_type,status,description", { count: "exact" })
    .eq("organization_id", organizationId).order("id").range(from, to).abortSignal(signal))
  assertTenant(businesses, organizationId)
  businesses.sort((a, b) => a.name.localeCompare(b.name))
  let financials: FinancialData | null = null
  let financialError: string | null = null
  if (canReadFinancials(organization.role)) {
    const dates = reportingDates(now)
    try {
      const [figures, transactions, receivables, bills] = await Promise.all([
        collectPages<BusinessFinancial>(async (from, to) => {
          const result = await client.rpc("ben_business_financials", { target_organization_id: organizationId }, { count: "exact" })
            .select("id,organization_id,ownership_percentage,monthly_revenue,monthly_expenses").order("id").range(from, to).abortSignal(signal)
          if (result.data !== null && !Array.isArray(result.data)) throw new Error("Unexpected financial response")
          return { ...result, data: result.data as BusinessFinancial[] | null }
        }),
        collectPages<Transaction>((from, to) => client.from("ben_financial_transactions")
          .select("id,organization_id,business_id,transaction_type,amount,transaction_date,status,category,description", { count: "exact" })
          .eq("organization_id", organizationId).gte("transaction_date", dates.chartStart).lte("transaction_date", dates.today)
          .order("id").range(from, to).abortSignal(signal)),
        collectPages<Receivable>((from, to) => client.from("ben_receivables")
          .select("id,organization_id,business_id,customer_name,amount_due,amount_paid,due_date,status", { count: "exact" })
          .eq("organization_id", organizationId).order("id").range(from, to).abortSignal(signal)),
        collectPages<Bill>((from, to) => client.from("ben_bills")
          .select("id,organization_id,business_id,vendor_name,amount,due_date,status", { count: "exact" })
          .eq("organization_id", organizationId).order("id").range(from, to).abortSignal(signal)),
      ])
      for (const rows of [figures, transactions, receivables, bills]) assertTenant(rows, organizationId)
      // Role revocation can make the controlled RPC return no rows. Never show
      // zero financial balances as a fallback for incomplete authorization.
      const ids = new Set(figures.map(row => row.id))
      if (ids.size !== businesses.length || businesses.some(row => !ids.has(row.id))) throw new Error("Business financial access changed")
      financials = { businesses: figures, transactions, receivables, bills }
      summarizeFinancials(financials, "month", now)
      figures.forEach(row => { numeric(row.monthly_revenue); numeric(row.monthly_expenses) })
    } catch {
      if (signal.aborted) throw new Error("Cancelled")
      financialError = "Financial data could not be loaded. Refresh to check your access and try again."
    }
  }
  return { status: "ready", userId, organizations, organization, businesses, financials, financialError }
}
