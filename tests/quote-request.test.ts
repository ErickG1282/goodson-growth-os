import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { createQuoteRequest, previewQuoteRequest } from "../lib/freight-quoting/quote-request-service"
import { POST as createRoute } from "../app/api/freight-emails/quote-request/route"
import { quoteFixture, userId, opportunityId } from "./fixtures/quote-request-fixture"
import type { QuoteRequestInput } from "../lib/freight-quoting/quote-request-types"

const originalFetch = globalThis.fetch
before(() => { globalThis.fetch = async () => { throw new Error("Network is forbidden in Quote Request tests") } })
after(() => { globalThis.fetch = originalFetch })
const input: QuoteRequestInput = { opportunityId, pickupCount: 1, deliveryCount: 1 }
async function approved(f = quoteFixture(), counts = input) {
  const preview = await previewQuoteRequest(f.client, userId, counts)
  assert.equal(preview.decision, "QUOTE")
  return { f, request: { ...counts, approvalFingerprint: preview.approvalFingerprint! }, preview }
}
test("valid opportunity creates one internal quote with complete authoritative snapshot", async () => {
  const { f, request } = await approved()
  const result = await createQuoteRequest(f.client, userId, request)
  assert.equal(result.outcome, "CREATED")
  assert.equal(f.records.gbgs_quote_requests.length, 1)
  const row = f.records.gbgs_quote_requests[0], s = row.pricing_snapshot
  assert.equal(row.source, "Email"); assert.equal(row.status, "New")
  assert.equal(s.source_opportunity_id, opportunityId); assert.equal(s.user_id, userId)
  assert.deepEqual(s.origin, { city: "Buford", state: "GA", zip: "30519", streetAddress: null })
  assert.deepEqual(s.destination, { city: "Macon", state: "GA", zip: "31201", streetAddress: null })
  assert.equal(s.equipment_type, "Dry Van"); assert.equal(s.weight_lbs, 18082)
  assert.equal(s.trimble_truck_miles, 585); assert.equal(row.loaded_miles, 585)
  assert.equal(s.broker_reported_miles, 600); assert.equal(s.broker_offered_rate, 1400)
  assert.equal(s.pickup_count, 1); assert.equal(s.delivery_count, 1); assert.equal(s.additional_stops, 0)
  assert.equal(s.destination_pricing_region, "Georgia"); assert.equal(s.opening_distance_rpm, 2.9)
  assert.equal(s.unrounded_base_rate, 585 * 2.9); assert.equal(s.lane_premium, 0); assert.equal(s.stop_charges, 0)
  assert.equal(s.recommended_quote, 1700); assert.equal(s.effective_rpm, 1700 / 585)
  assert.equal(s.pricing_decision, "QUOTE"); assert.equal(s.status, "New"); assert.equal(s.mileage_provider, "TRIMBLE")
  assert.equal(s.mileage_calculation_id, "mileage-1"); assert.equal(s.created_at, row.created_at); assert.ok(Date.parse(s.calculated_at))
  assert.equal(f.records.gbgs_quote_history.length, 1)
})
test("duplicate retry returns existing quote even when current opportunity changes", async () => {
  const { f, request } = await approved()
  await createQuoteRequest(f.client, userId, request)
  f.records.gbgs_load_opportunities[0].weight_lbs = 40001
  const repeat = await createQuoteRequest(f.client, userId, request)
  assert.equal(repeat.outcome, "EXISTING"); assert.equal(f.records.gbgs_quote_requests.length, 1); assert.equal(f.records.gbgs_quote_history.length, 1)
})
test("concurrent double creation resolves unique-constraint race to the existing request", async () => {
  const { f, request } = await approved()
  const results = await Promise.all([createQuoteRequest(f.client, userId, request), createQuoteRequest(f.client, userId, request)])
  assert.deepEqual(results.map(r => r.outcome).sort(), ["CREATED", "EXISTING"])
  assert.equal(f.records.gbgs_quote_requests.length, 1); assert.equal(f.records.gbgs_quote_history.length, 1)
})
for (const [name, change] of [
  ["review status", { extraction_status: "NEEDS_REVIEW" }],
  ["unresolved HIGH conflict despite READY status", { extraction_issues: [{ field: "weight_lbs", severity: "HIGH" }] }],
  ["missing mileage", { calculated_miles: null }],
  ["unavailable mileage", { mileage_status: "UNAVAILABLE" }],
  ["over 40,000 lb", { weight_lbs: 40001 }],
  ["non-approved equipment", { equipment_type: "Reefer" }],
  ["invalid weight", { weight_lbs: -1 }],
] as const) {
  test(name + " blocks quote creation", async () => {
    const { f, request } = await approved()
    Object.assign(f.records.gbgs_load_opportunities[0], change)
    const result = await createQuoteRequest(f.client, userId, request)
    assert.equal(result.outcome, "BLOCKED"); assert.equal(f.records.gbgs_quote_requests.length, 0)
  })
}
for (const [name, change] of [
  ["PTV", { provider: "PTV" }], ["unavailable", { status: "UNAVAILABLE" }],
  ["car route", { route_type: "CAR" }], ["wrong distance", { calculated_miles: 100 }],
  ["unsafe metadata", { provider_metadata: { routingType: "Practical", vehicleType: "Truck", overrideRestrictions: true } }],
  ["old lane", { origin_used: { city: "Atlanta", state: "GA", zip: "30303" } }],
] as const) {
  test(name + " mileage cannot create a quote", async () => {
    const { f, request } = await approved()
    Object.assign(f.records.gbgs_truck_mileage_calculations[0], change)
    assert.equal((await createQuoteRequest(f.client, userId, request)).outcome, "BLOCKED")
    assert.equal(f.records.gbgs_quote_requests.length, 0)
  })
}
test("latest failed mileage prevents reusing an older AVAILABLE record", async () => {
  const { f, request } = await approved()
  f.records.gbgs_truck_mileage_calculations.push({ ...f.records.gbgs_truck_mileage_calculations[0], id: "mileage-2", status: "UNAVAILABLE", calculated_at: "2026-09-15T12:00:00Z" })
  assert.equal((await createQuoteRequest(f.client, userId, request)).outcome, "BLOCKED")
})
test("saved matching correction resolves HIGH evidence without deleting original conflict", async () => {
  const f = quoteFixture()
  f.records.gbgs_load_opportunities[0].extraction_issues = [{ field: "weight_lbs", severity: "HIGH" }]
  f.records.gbgs_load_opportunity_corrections.push({ user_id: userId, load_opportunity_id: opportunityId, field_name: "weight_lbs", corrected_value: 18082 })
  const { request } = await approved(f)
  assert.equal((await createQuoteRequest(f.client, userId, request)).outcome, "CREATED")
})
test("changed price returns a fresh preview and requires explicit second confirmation", async () => {
  const { f, request } = await approved()
  f.records.gbgs_quote_distance_rules[0].opening_rpm = 3
  const stale = await createQuoteRequest(f.client, userId, request)
  assert.equal(stale.outcome, "REVIEW_REQUIRED")
  if (stale.outcome !== "REVIEW_REQUIRED") throw new Error("expected review")
  assert.equal(stale.preview.calculatedQuote, 1775); assert.equal(f.records.gbgs_quote_requests.length, 0)
  const confirmed = await createQuoteRequest(f.client, userId, { ...request, approvalFingerprint: stale.preview.approvalFingerprint! })
  assert.equal(confirmed.outcome, "CREATED"); assert.equal(f.records.gbgs_quote_requests[0].calculated_quote, 1775)
})
test("breakdown change with the same rounded quote still requires review", async () => {
  const { f, request } = await approved()
  f.records.gbgs_quote_distance_rules[0].opening_rpm = 2.901
  const result = await createQuoteRequest(f.client, userId, request)
  assert.equal(result.outcome, "REVIEW_REQUIRED")
  if (result.outcome === "REVIEW_REQUIRED") assert.equal(result.preview.calculatedQuote, 1700)
})
test("human counts are inputs; forged additional stops and charges are ignored", async () => {
  const { f, request } = await approved(quoteFixture(), { ...input, pickupCount: 2, deliveryCount: 3 })
  const result = await createQuoteRequest(f.client, userId, { ...request, ...{ additional_stops: 0, stop_charges: 0, calculated_quote: 1, user_id: "attacker" } })
  assert.equal(result.outcome, "CREATED")
  const s = f.records.gbgs_quote_requests[0].pricing_snapshot
  assert.equal(s.additional_stops, 3); assert.equal(s.stop_charges, 300); assert.equal(s.recommended_quote, 2000); assert.equal(s.user_id, userId)
})
test("changed counts invalidate the approved preview", async () => {
  const { f, request } = await approved()
  assert.equal((await createQuoteRequest(f.client, userId, { ...request, pickupCount: 2 })).outcome, "REVIEW_REQUIRED")
})
test("missing, fractional, zero and nonnumeric stop counts are rejected", async () => {
  for (const count of [null, 0, -1, 1.5, NaN, Infinity, "2"]) {
    const f = quoteFixture()
    const result = await createQuoteRequest(f.client, userId, { ...input, pickupCount: count as number })
    assert.equal(result.outcome, "BLOCKED"); assert.equal(f.writes.length, 0)
  }
})
test("missing approval cannot create a quote", async () => {
  const f = quoteFixture()
  assert.equal((await createQuoteRequest(f.client, userId, input)).outcome, "REVIEW_REQUIRED"); assert.equal(f.writes.length, 0)
})
test("broker miles and offered rate remain reference-only", async () => {
  const f = quoteFixture()
  f.records.gbgs_load_opportunities[0].broker_reported_miles = 10000
  f.records.gbgs_load_opportunities[0].broker_offered_rate = 1
  const { request } = await approved(f)
  await createQuoteRequest(f.client, userId, request)
  const s = f.records.gbgs_quote_requests[0].pricing_snapshot
  assert.equal(s.trimble_truck_miles, 585); assert.equal(s.recommended_quote, 1700); assert.equal(s.broker_reported_miles, 10000)
})
test("unknown lane region blocks creation", async () => {
  const { f, request } = await approved()
  Object.assign(f.records.gbgs_load_opportunities[0], { destination_state: "FL", destination_city: "Unknown", destination_zip: "99999" })
  assert.equal((await createQuoteRequest(f.client, userId, request)).outcome, "BLOCKED")
})
test("current rules and lane classification are reloaded on creation", async () => {
  const { f, request } = await approved()
  f.reads.length = 0
  await createQuoteRequest(f.client, userId, request)
  for (const table of ["gbgs_quote_settings", "gbgs_quote_distance_rules", "gbgs_quote_lane_rules", "gbgs_quote_equipment_rules"]) assert.ok(f.reads.includes(table))
})
test("other user cannot create or retrieve another user's quote", async () => {
  const { f, request } = await approved()
  await createQuoteRequest(f.client, userId, request)
  await assert.rejects(createQuoteRequest(f.client, "other-user", request), /not found/)
  assert.equal(f.records.gbgs_quote_requests.length, 1)
})
test("unauthenticated API request returns 401 without a database or network call", async () => {
  const response = await createRoute(new Request("http://localhost/api/freight-emails/quote-request", { method: "POST", body: JSON.stringify(input) }))
  assert.equal(response.status, 401)
})
test("history failure retains the official quote and complete snapshot", async () => {
  const { f, request } = await approved(); f.controls.failHistory = true
  const result = await createQuoteRequest(f.client, userId, request)
  assert.equal(result.outcome, "CREATED")
  assert.ok("warning" in result && result.warning)
  assert.ok(f.records.gbgs_quote_requests[0].pricing_snapshot)
  assert.equal((await createQuoteRequest(f.client, userId, request)).outcome, "EXISTING")
})
test("quote insert failure does not write history or report success", async () => {
  const { f, request } = await approved(); f.controls.failQuote = true
  await assert.rejects(createQuoteRequest(f.client, userId, request), /Unable to save/)
  assert.equal(f.records.gbgs_quote_history.length, 0)
})
test("no email, provider or booking action occurs; only quote and history tables are written", async () => {
  const { f, request } = await approved()
  await createQuoteRequest(f.client, userId, request)
  assert.deepEqual(f.writes, ["gbgs_quote_requests", "gbgs_quote_history"])
  assert.equal(f.records.gbgs_quote_requests[0].status, "New")
})
