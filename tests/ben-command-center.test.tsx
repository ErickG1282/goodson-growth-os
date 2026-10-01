import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { attentionItems, ExecutiveInsights, FinancialRecords } from "../app/ben/command-center"
import { BusinessDetails, type ReadyData } from "../app/ben/workspace"

const now = new Date(2026, 9, 1, 12)
const organization = { id: "org", name: "Fixture Organization", owner_name: "Fixture Owner", status: "active", role: "owner" }
const business = { id: "b", organization_id: "org", name: "Fixture Business", business_type: "trucking", status: "active", description: null }
const data: ReadyData = { status: "ready", userId: "fixture-user", organization, organizations: [organization], businesses: [business], financialError: null, financials: {
  businesses: [{ id: "b", organization_id: "org", monthly_revenue: 4321, monthly_expenses: 1234, ownership_percentage: null }],
  transactions: [{ id: "t", organization_id: "org", business_id: "b", transaction_type: "income", amount: 4321, transaction_date: "2026-10-01", status: "completed" }],
  receivables: [{ id: "r", organization_id: "org", business_id: "b", customer_name: "Fixture Customer", amount_due: 100, amount_paid: 20, due_date: "2026-09-30", status: "partial" }],
  bills: [{ id: "bill", organization_id: "org", business_id: "b", vendor_name: "Fixture Vendor", amount: 70, due_date: "2026-09-30", status: "upcoming" }],
} }
test("priorities use overdue dates and remaining balances; settled records never alert", () => {
  assert.equal(attentionItems([business], data.financials, now).length, 2)
  assert.ok(attentionItems([business], data.financials, now)[0].text.includes("$80"))
  const settled = { ...data.financials!, receivables: data.financials!.receivables.map(row => ({ ...row, amount_paid: 100 })), bills: data.financials!.bills.map(row => ({ ...row, status: "paid" })) }
  assert.equal(attentionItems([business], settled, now).length, 0)
  assert.equal(attentionItems([{ ...business, status: "inactive" }], null, now).length, 1)
})
for (const role of ["staff", "viewer"]) test(`${role} cannot render injected financial records, priorities or detail figures`, () => {
  const restricted = { ...data, organization: { ...organization, role } }
  const html = renderToStaticMarkup(<><ExecutiveInsights data={restricted} now={now} /><FinancialRecords data={restricted} /><BusinessDetails business={business} data={restricted} onClose={() => {}} /></>)
  assert.ok(!html.includes("Fixture Customer"))
  assert.ok(!html.includes("Fixture Vendor"))
  assert.ok(!/\$[0-9]/.test(html))
})
for (const role of ["owner", "admin", "manager"]) test(`${role} sees business-scoped financial detail`, () => {
  const html = renderToStaticMarkup(<BusinessDetails business={business} data={{ ...data, organization: { ...organization, role } }} onClose={() => {}} />)
  assert.ok(html.includes("Fixture Customer"))
  assert.ok(html.includes("Fixture Vendor"))
  assert.ok(html.includes("$4,321"))
})
test("business financial tables exclude other businesses and unassigned organization records", () => {
  const scoped = { ...data, financials: { ...data.financials!, bills: [...data.financials!.bills, { ...data.financials!.bills[0], id: "other", business_id: null, vendor_name: "Other Vendor" }] } }
  const html = renderToStaticMarkup(<FinancialRecords data={scoped} businessId="b" />)
  assert.ok(html.includes("Fixture Vendor"))
  assert.ok(!html.includes("Other Vendor"))
})
