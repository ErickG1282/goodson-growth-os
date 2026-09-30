import test from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"
import { previewEmailIntakePrice } from "../lib/freight-quoting/email-intake-pricing"

const userId = "user-1", opportunityId = "opportunity-1"
const opportunity = {
  id: opportunityId, user_id: userId, origin_city: "Buford", origin_state: "GA", origin_zip: "30519",
  destination_city: "Macon", destination_state: "GA", destination_zip: "31201",
  pickup_date: "2026-09-05", pickup_datetime_raw: null, delivery_date: "2026-09-06", delivery_datetime_raw: null,
  equipment_type: "Dry Van", weight_lbs: 18082, broker_reported_miles: 585,
  calculated_miles: 585, mileage_status: "AVAILABLE", extraction_status: "READY_TO_QUOTE",
}
const mileage = { load_opportunity_id: opportunityId, user_id: userId, provider: "TRIMBLE", status: "AVAILABLE", route_type: "COMMERCIAL_TRUCK", calculated_miles: 585, provider_metadata: { routingType: "Practical", vehicleType: "Truck", overrideRestrictions: false }, calculated_at: "2026-09-04T12:00:00Z" }
const settings = { user_id: userId, short_haul_max_miles: 100, short_haul_minimum: 600, max_weight_lbs: 40000, additional_stop_charge: 100, target_rpm: 2.5, hard_floor_rpm: 2.25, round_quote_to: 25, auto_quote_enabled: false, auto_decline_overweight: true }
const distance = [
  { user_id: userId, active: true, min_miles: 0, max_miles: 100, opening_rpm: null, minimum_charge: 600, sort_order: 1 },
  { user_id: userId, active: true, min_miles: 101, max_miles: 250, opening_rpm: 3.25, minimum_charge: null, sort_order: 2 },
  { user_id: userId, active: true, min_miles: 251, max_miles: 500, opening_rpm: 3, minimum_charge: null, sort_order: 3 },
  { user_id: userId, active: true, min_miles: 501, max_miles: 750, opening_rpm: 2.9, minimum_charge: null, sort_order: 4 },
  { user_id: userId, active: true, min_miles: 751, max_miles: 1000, opening_rpm: 2.8, minimum_charge: null, sort_order: 5 },
  { user_id: userId, active: true, min_miles: 1001, max_miles: null, opening_rpm: 2.75, minimum_charge: null, sort_order: 6 },
]

function fakeClient(changes: { opportunity?: Record<string, unknown>; mileage?: Record<string, unknown> | null } = {}) {
  let mutations = 0
  const records: Record<string, Record<string, unknown>[]> = {
    gbgs_load_opportunities: [{ ...opportunity, ...changes.opportunity }],
    gbgs_truck_mileage_calculations: changes.mileage === null ? [] : [{ ...mileage, ...changes.mileage }],
    gbgs_quote_settings: [settings], gbgs_quote_distance_rules: distance,
    gbgs_quote_lane_rules: [{ user_id: userId, active: true, origin_state: "GA", destination_region: "Georgia", premium_per_mile: 0 }],
    gbgs_quote_equipment_rules: [{ user_id: userId, active: true, equipment_type: "Dry Van" }, { user_id: userId, active: true, equipment_type: "Power Only" }],
    gbgs_quote_requests: [], gbgs_quote_history: [],
  }
  const client = { from(table: string) {
    const filters: Array<[string, unknown]> = []; let maximum: number | null = null
    const rows = () => (records[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value)).slice(0, maximum ?? undefined)
    const result = () => ({ data: rows(), error: null })
    const builder = {
      select() { return builder }, eq(key: string, value: unknown) { filters.push([key, value]); return builder }, order() { return builder }, limit(value: number) { maximum = value; return builder },
      single() { const data = rows()[0] ?? null; return Promise.resolve({ data, error: data ? null : { message: "not found" } }) },
      maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }) },
      insert() { mutations++; throw new Error("preview attempted insert") }, update() { mutations++; throw new Error("preview attempted update") }, delete() { mutations++; throw new Error("preview attempted delete") },
      then(resolve: (value: ReturnType<typeof result>) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject) },
    }
    return builder
  } } as unknown as SupabaseClient
  return { client, mutationCount: () => mutations }
}

const preview = (client: SupabaseClient, counts: { opportunityId: string; pickupCount: number | null; deliveryCount: number | null } = { opportunityId, pickupCount: 1, deliveryCount: 1 }) => previewEmailIntakePrice(client, userId, counts)

test("AVAILABLE Trimble commercial-truck mileage reaches pricing", async () => { const { client } = fakeClient(); const result = await preview(client); assert.equal(result.decision, "QUOTE"); assert.equal(result.mileageUsed, 585); assert.equal(result.calculatedQuote, 1700) })
test("broker mileage alone cannot reach pricing", async () => { const { client } = fakeClient({ opportunity: { calculated_miles: null, mileage_status: "NOT_CONFIGURED" }, mileage: null }); const result = await preview(client); assert.equal(result.decision, "NEEDS_MILEAGE"); assert.equal(result.calculatedQuote, null) })
test("missing calculated mileage returns NEEDS MILEAGE", async () => { const { client } = fakeClient({ opportunity: { calculated_miles: null } }); assert.equal((await preview(client)).decision, "NEEDS_MILEAGE") })
test("UNAVAILABLE mileage returns NEEDS MILEAGE", async () => { const { client } = fakeClient({ opportunity: { mileage_status: "UNAVAILABLE", calculated_miles: null }, mileage: { status: "UNAVAILABLE", calculated_miles: null } }); assert.equal((await preview(client)).decision, "NEEDS_MILEAGE") })
test("HIGH extraction conflict blocks pricing", async () => { const { client } = fakeClient({ opportunity: { extraction_status: "NEEDS_REVIEW" } }); const result = await preview(client); assert.equal(result.decision, "NEEDS_REVIEW"); assert.match(result.reviewReason ?? "", /HIGH/) })
test("over 40,000 lb declines before mileage calculation", async () => { const { client } = fakeClient({ opportunity: { weight_lbs: 40001, calculated_miles: null, mileage_status: "UNAVAILABLE" }, mileage: null }); const result = await preview(client); assert.equal(result.decision, "DECLINE"); assert.equal(result.declineReason, "Weight exceeds 40,000 lb maximum.") })
test("unknown lane region blocks pricing", async () => { const { client } = fakeClient({ opportunity: { destination_state: "FL", destination_city: "Unknown Place", destination_zip: "99999" } }); const result = await preview(client); assert.equal(result.decision, "NEEDS_REVIEW"); assert.equal(result.calculatedQuote, null) })
test("broker and truck mileage remain independent", async () => { const { client } = fakeClient({ opportunity: { broker_reported_miles: 600 } }); const result = await preview(client); assert.equal(result.mileageUsed, 585); assert.equal(result.brokerReportedMiles, 600); assert.equal(result.mileageDifference, -15) })
test("missing human-verified stop counts blocks pricing", async () => { const { client } = fakeClient(); const result = await preview(client, { opportunityId, pickupCount: null, deliveryCount: null }); assert.equal(result.decision, "NEEDS_REVIEW"); assert.equal(result.stopCharges, null) })
test("pricing preview creates neither quote requests nor quote history", async () => { const fake = fakeClient(); await preview(fake.client); assert.equal(fake.mutationCount(), 0) })
