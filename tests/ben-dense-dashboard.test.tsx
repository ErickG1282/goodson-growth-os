import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BenWorkspace, dashboardActions, type ReadyData } from "../app/ben/workspace"
const now = new Date(2026, 9, 1, 9)
function fixture(role = "owner"): ReadyData {
 const organization = { id: "org", name: "Fixture Organization", owner_name: "Fixture Owner", status: "active", role }
 const businesses = [{ id: "business", organization_id: "org", name: "Fixture Parking", business_type: "parking", status: "active", description: null }]
 return { status: "ready", userId: "fixture-user", organization, organizations: [organization], businesses, financialError: null, financials: { businesses: [{id:"business",organization_id:"org",monthly_revenue:0,monthly_expenses:0,ownership_percentage:null}],transactions:[],receivables:[],bills:[] } }
}
const render = (data: ReadyData) => renderToStaticMarkup(<BenWorkspace data={data} refresh={() => {}} selectOrganization={() => {}} onSignOut={async () => null} now={now} />)
test("dense dashboard renders five KPI modules and full supported/foundation navigation", () => {
 const html = render(fixture())
 for (const text of ["Good Morning", "Total Revenue (MTD)", "Total Expenses (MTD)", "Net Cash Flow (MTD)", "Money Owed to You", "Upcoming Bills", "Profit by Business (MTD)", "Action Center", "Trucks &amp; Trailers", "Parking Lots", "Tire Shop Inventory", "Important Documents", "New Opportunities", "No vehicles added", "No inventory records", "No documents added", "No opportunities yet"]) assert.ok(html.includes(text), text)
 assert.ok(html.includes('aria-label="Search anything"'))
 assert.ok(html.includes('title="Opportunity creation requires backend support"'))
 assert.ok(html.includes("Not recorded"))
 assert.ok(!html.includes("THE BUSINESS COMMAND CENTER"))
 assert.ok(!html.includes("↑"))
})
test("Action Center derives actual pending money records and excludes cancelled/settled records", () => {
 const data = fixture()
 data.financials!.bills = [{ id:"overdue",organization_id:"org",business_id:"business",amount:40,due_date:"2026-09-30",status:"upcoming",vendor_name:"Test vendor" },{id:"paid",organization_id:"org",amount:100,due_date:"2026-09-30",status:"paid"}]
 const actions = dashboardActions(data,now)
 assert.equal(actions.length,1)
 assert.equal(actions[0].overdue,true)
 assert.equal(actions[0].business,"Fixture Parking")
 assert.ok(render(data).includes("Not assigned"))
 assert.ok(render(data).includes("Not set"))
})
for (const role of ["staff","viewer"]) test(`${role} never renders injected money, financial customer/vendor or financial notification counts`, () => {
 const data=fixture(role)
 data.financials!.businesses[0].monthly_revenue=999999
 data.financials!.bills=[{id:"secret",organization_id:"org",amount:123456,due_date:"2026-09-30",status:"overdue",vendor_name:"Secret Vendor"}]
 assert.equal(dashboardActions(data,now).length,0)
 const html=render(data)
 assert.ok(!html.includes("Secret Vendor"))
 assert.ok(!/\$[0-9]/.test(html))
 assert.ok(html.includes("Restricted financial access"))
})
