import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BenWorkspace, type ReadyData } from "../app/ben/workspace"
import { BenShell } from "../app/ben/shell"

function fixture(role = "owner", count = 9): ReadyData {
  const organization = { id: "test-org", name: "Test Organization", owner_name: "Test Owner", status: "active", role }
  const businesses = Array.from({ length: count }, (_, index) => ({
    id: `test-business-${index}`, organization_id: organization.id, name: `Business ${index + 1}`,
    business_type: index % 2 ? "transport" : "tire_shop", status: "active", description: null,
  }))
  return {
    status: "ready", userId: "test-user", organization, organizations: [organization], businesses, financialError: null,
    financials: ["owner", "admin", "manager"].includes(role) ? {
      businesses: businesses.map(row => ({ id: row.id, organization_id: row.organization_id, ownership_percentage: null, monthly_revenue: 0, monthly_expenses: 0 })),
      transactions: [], receivables: [], bills: [],
    } : null,
  }
}
const render = (data: ReadyData) => renderToStaticMarkup(<BenWorkspace data={data} refresh={() => {}} selectOrganization={() => {}} onSignOut={async () => null} now={new Date(2026, 9, 1, 12)} />)

test("organization overview and all nine business cards render from supplied data", () => {
  const html = render(fixture())
  assert.ok(html.includes("Test Organization"))
  assert.equal((html.match(/aria-label="View Business \d+"/g) ?? []).length, 9)
  for (const id of ["overview", "businesses", "financials", "receivables", "bills", "cash-flow"]) assert.ok(html.includes(`id="${id}"`))
  assert.ok(html.includes("No completed transactions this period"))
  assert.ok(html.includes("No receivables recorded yet."))
  assert.ok(html.includes("No bills recorded yet."))
  assert.ok(!html.includes("Monthly recorded income and expenses.")) // no fabricated chart
})
test("business presentation is dynamic, with no hard-coded nine-business count", () => {
  assert.equal((render(fixture("owner", 2)).match(/aria-label="View Business \d+"/g) ?? []).length, 2)
  assert.ok(render(fixture("owner", 0)).includes("Your portfolio starts here"))
})
for (const role of ["staff", "viewer"]) {
  test(`${role} sees businesses and protected financial sections without any currency figures`, () => {
    const html = render(fixture(role))
    assert.equal((html.match(/aria-label="View Business \d+"/g) ?? []).length, 9)
    assert.ok(html.includes("Restricted financial access"))
    assert.ok(html.includes("Financial access is protected"))
    assert.ok(!/\$[0-9]/.test(html))
  })
}
test("failed financial loading renders unavailable rather than false zero balances", () => {
  const data = fixture()
  data.financials = null
  data.financialError = "Financial data could not be loaded."
  const html = render(data)
  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes("Financial data unavailable"))
  assert.ok(!html.includes("$0"))
})
test("unauthenticated shell contains branded navigation but no organization records", () => {
  const html = renderToStaticMarkup(<BenShell><p>Sign in</p></BenShell>)
  assert.ok(html.includes("BEN"))
  assert.ok(html.includes("Your business command center"))
  assert.ok(html.includes('aria-label="Open navigation menu"'))
  assert.ok(html.includes('disabled=""'))
  assert.ok(!html.includes("Test Organization"))
})
