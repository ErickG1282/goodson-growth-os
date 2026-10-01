import assert from "node:assert/strict"
import { test } from "node:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { canReadFinancials, collectPages, loadBenData, summarizeFinancials, type FinancialData } from "../app/ben/data"

const now = new Date(2026, 9, 1, 12)
const empty: FinancialData = { businesses: [], transactions: [], receivables: [], bills: [] }
type Row = Record<string, unknown>
function fakeClient(role = "owner", changes: Record<string, Row[]> = {}, errorTable = "") {
  const calls: { table: string; filters: [string, unknown][]; columns: string; rpc?: Record<string, unknown> }[] = []
  const rows: Record<string, Row[]> = {
    ben_organization_members: [{ organization_id: "org-a", role }],
    ben_organizations: [{ id: "org-a", name: "Client A", owner_name: "Owner A", status: "active" }],
    ben_business_directory: [{ id: "business-a", organization_id: "org-a", name: "Business A", business_type: "other", status: "active", description: null }],
    ben_business_financials: [{ id: "business-a", organization_id: "org-a", ownership_percentage: null, monthly_revenue: 0, monthly_expenses: 0 }],
    ben_financial_transactions: [], ben_receivables: [], ben_bills: [], ...changes,
  }
  function builder(table: string, rpc?: Record<string, unknown>) {
    const call = { table, filters: [] as [string, unknown][], columns: "", rpc }
    calls.push(call)
    let start = 0, end = 499, single = false
    const query = {
      select(columns: string) { call.columns = columns; return query },
      eq(column: string, value: unknown) { call.filters.push([column, value]); return query },
      gte() { return query }, lte() { return query }, order() { return query },
      abortSignal() { return query }, returns() { return query },
      range(from: number, to: number) { start = from; end = to; return query },
      single() { single = true; return query },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        const data = rows[table] ?? []
        return Promise.resolve({
          data: table === errorTable ? null : single ? data.find(row => call.filters.every(([key, value]) => row[key] === value)) : data.slice(start, end + 1),
          count: data.length, error: table === errorTable ? { message: "Unavailable" } : null,
        }).then(resolve, reject)
      },
    }
    return query
  }
  return { client: { from: (table: string) => builder(table), rpc: (table: string, args: Record<string, unknown>) => builder(table, args) } as unknown as SupabaseClient, calls }
}

test("only organization owners/admins/managers qualify for financial requests", () => {
  for (const role of ["owner", "admin", "manager"]) assert.equal(canReadFinancials(role), true)
  for (const role of ["staff", "viewer", "", "unknown"]) assert.equal(canReadFinancials(role), false)
})
test("empty financial tables produce accurate zero totals and empty record counts", () => {
  const summary = summarizeFinancials(empty, "month", now)
  for (const key of ["revenue", "expenses", "net", "owed", "bills", "transactionCount", "receivableCount", "billCount"] as const) assert.equal(summary[key], 0)
  assert.equal(summary.chart.length, 6)
  assert.ok(summary.chart.every(row => row.revenue === 0 && row.expenses === 0))
})
test("totals exclude pending/cancelled/future transactions and clamp overpaid receivables", () => {
  const transaction = { id: "t", organization_id: "org-a", business_id: null, transaction_type: "income", amount: "0.10", transaction_date: "2026-10-01", status: "completed" }
  const data: FinancialData = {
    ...empty,
    transactions: [transaction, { ...transaction, id: "t2", amount: "0.20" }, { ...transaction, status: "pending", amount: 900 }, { ...transaction, status: "cancelled", amount: 800 }, { ...transaction, transaction_date: "2026-10-02", amount: 700 }, { ...transaction, transaction_date: "2026-09-30", amount: 500 }],
    receivables: [{ id: "r", organization_id: "org-a", amount_due: 50, amount_paid: 60, status: "open" }, { id: "r2", organization_id: "org-a", amount_due: 100, amount_paid: 40, status: "partial" }, { id: "r3", organization_id: "org-a", amount_due: 900, amount_paid: 0, status: "cancelled" }],
    bills: [{ id: "b", organization_id: "org-a", amount: 50, due_date: "2026-09-01", status: "overdue" }, { id: "b2", organization_id: "org-a", amount: 500, due_date: "2026-11-01", status: "open" }, { id: "b3", organization_id: "org-a", amount: 100, due_date: "2026-10-02", status: "paid" }],
  }
  const summary = summarizeFinancials(data, "month", now)
  assert.equal(summary.revenue, .3)
  assert.equal(summary.owed, 60)
  assert.equal(summary.bills, 50)
  assert.equal(summary.chart.at(-2)?.revenue, 500)
})
test("quarter boundary includes earlier quarter records while month does not", () => {
  const data: FinancialData = { ...empty, transactions: [{ id: "t", organization_id: "a", business_id: null, transaction_type: "expense", amount: 12, transaction_date: "2026-08-01", status: "completed" }] }
  const date = new Date(2026, 8, 30, 12)
  assert.equal(summarizeFinancials(data, "quarter", date).expenses, 12)
  assert.equal(summarizeFinancials(data, "month", date).expenses, 0)
})
test("pagination handles a configured API limit smaller than the requested range", async () => {
  const source = Array.from({ length: 9 }, (_, i) => i)
  const rows = await collectPages(async from => ({ data: source.slice(from, from + 2), count: source.length, error: null }))
  assert.deepEqual(rows, source)
  await assert.rejects(collectPages(async () => ({ data: [], count: 9, error: null })), /Incomplete/)
})
for (const role of ["staff", "viewer"]) {
  test(`${role} loads directory only, without any financial RPC/table requests`, async () => {
    const fake = fakeClient(role)
    const data = await loadBenData(fake.client, "signed-in-user", null, new AbortController().signal, now)
    assert.equal(data.status, "ready")
    if (data.status === "ready") { assert.equal(data.financials, null); assert.equal(data.businesses.length, 1) }
    assert.deepEqual(fake.calls.map(row => row.table), ["ben_organization_members", "ben_organizations", "ben_business_directory"])
    assert.deepEqual(fake.calls[0].filters, [["user_id", "signed-in-user"]])
    assert.deepEqual(fake.calls[2].filters, [["organization_id", "org-a"]])
  })
}
for (const role of ["owner", "admin", "manager"]) {
  test(`${role} loads controlled RPC and explicitly tenant-scoped financial tables`, async () => {
    const fake = fakeClient(role)
    const data = await loadBenData(fake.client, "user", null, new AbortController().signal, now)
    assert.equal(data.status, "ready")
    if (data.status === "ready") assert.ok(data.financials)
    assert.deepEqual(fake.calls.find(row => row.table === "ben_business_financials")?.rpc, { target_organization_id: "org-a" })
    for (const table of ["ben_financial_transactions", "ben_receivables", "ben_bills"]) assert.ok(fake.calls.find(row => row.table === table)?.filters.some(([key, value]) => key === "organization_id" && value === "org-a"))
    assert.ok(fake.calls.every(row => row.table !== "ben_businesses" && !row.columns.includes("*")))
  })
}
test("multiple memberships require a choice; an unowned selection is not queried", async () => {
  const changes = {
    ben_organization_members: [{ organization_id: "org-a", role: "owner" }, { organization_id: "org-b", role: "viewer" }],
    ben_organizations: [{ id: "org-a", name: "A", owner_name: "A", status: "active" }, { id: "org-b", name: "B", owner_name: "B", status: "active" }],
  }
  for (const selected of [null, "unowned-org"]) {
    const fake = fakeClient("owner", changes)
    assert.equal((await loadBenData(fake.client, "user", selected, new AbortController().signal, now)).status, "choose")
    assert.ok(!fake.calls.some(row => row.table === "ben_business_directory"))
  }
})
test("no membership returns empty without organization/business/financial queries", async () => {
  const fake = fakeClient("owner", { ben_organization_members: [] })
  assert.equal((await loadBenData(fake.client, "user", null, new AbortController().signal, now)).status, "empty")
  assert.equal(fake.calls.length, 1)
})
test("unexpected tenant data fails closed", async () => {
  const fake = fakeClient("owner", { ben_business_directory: [{ id: "b", organization_id: "other-org", name: "Secret" }] })
  await assert.rejects(loadBenData(fake.client, "user", null, new AbortController().signal, now), /Unexpected organization/)
})
test("financial failure or revoked RPC access never becomes a fake zero balance", async () => {
  for (const fake of [fakeClient("owner", {}, "ben_receivables"), fakeClient("owner", { ben_business_financials: [] }), fakeClient("owner", { ben_business_financials: [{ id: "business-a", organization_id: "other-org", monthly_revenue: 100, monthly_expenses: 1 }] })]) {
    const data = await loadBenData(fake.client, "user", null, new AbortController().signal, now)
    assert.equal(data.status, "ready")
    if (data.status === "ready") { assert.equal(data.businesses.length, 1); assert.equal(data.financials, null); assert.ok(data.financialError) }
  }
})
