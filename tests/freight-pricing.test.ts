import test from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateFreightQuote } from "../lib/freight-quoting/pricing-service"
import type { QuoteInput } from "../lib/freight-quoting/types"

const records: Record<string, unknown> = {
  gbgs_quote_settings: { short_haul_max_miles: 100, short_haul_minimum: 600, max_weight_lbs: 40000, additional_stop_charge: 100, target_rpm: 2.5, hard_floor_rpm: 2.25, round_quote_to: 25, auto_quote_enabled: false, auto_decline_overweight: true },
  gbgs_quote_distance_rules: [
    { min_miles: 0, max_miles: 100, opening_rpm: null, minimum_charge: 600 },
    { min_miles: 101, max_miles: 250, opening_rpm: 3.25, minimum_charge: null },
    { min_miles: 251, max_miles: 500, opening_rpm: 3, minimum_charge: null },
    { min_miles: 501, max_miles: 750, opening_rpm: 2.9, minimum_charge: null },
    { min_miles: 751, max_miles: 1000, opening_rpm: 2.8, minimum_charge: null },
    { min_miles: 1001, max_miles: null, opening_rpm: 2.75, minimum_charge: null },
  ],
  gbgs_quote_lane_rules: [
    { origin_state: "GA", destination_region: "Georgia", premium_per_mile: 0 },
    { origin_state: "GA", destination_region: "Alabama", premium_per_mile: 0.1 },
    { origin_state: "GA", destination_region: "North Florida", premium_per_mile: 0.15 },
    { origin_state: "GA", destination_region: "Central Florida", premium_per_mile: 0.25 },
    { origin_state: "GA", destination_region: "South Florida", premium_per_mile: 0.5 },
  ],
  gbgs_quote_equipment_rules: [{ equipment_type: "Dry Van" }, { equipment_type: "Power Only" }],
}

function fakeClient() {
  return { from(table: string) { const result = { data: records[table], error: null }; const builder = { select() { return builder }, eq() { return builder }, order() { return builder }, single() { return Promise.resolve(result) }, then(resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject) } }; return builder } } as unknown as SupabaseClient
}

const base: QuoteInput = { originCity: "Atlanta", originState: "GA", originZip: "30303", destinationCity: "Macon", destinationState: "GA", destinationZip: "31201", loadedMiles: 80, weightLbs: 35000, equipmentType: "Dry Van", pickupCount: 1, deliveryCount: 1 }
const price = (changes: Partial<QuoteInput>) => calculateFreightQuote(fakeClient(), "test-user", { ...base, ...changes })

test("A: 80-mile Georgia short haul quotes $600", async () => { const result = await price({}); assert.equal(result.decision, "QUOTE"); assert.equal(result.calculatedQuote, 600) })
test("B: 200-mile Alabama lane quotes $675", async () => { const result = await price({ destinationCity: "Birmingham", destinationState: "AL", destinationZip: "35203", loadedMiles: 200 }); assert.equal(result.baseRate, 650); assert.equal(result.lanePremium, 20); assert.equal(result.calculatedQuote, 675) })
test("C: 501-mile Georgia lane rounds $1,452.90 up to $1,475", async () => { const result = await price({ loadedMiles: 501 }); assert.ok(Math.abs((result.baseRate ?? 0) - 1452.9) < 0.001); assert.equal(result.calculatedQuote, 1475) })
test("D: two pickups and two deliveries add two $100 stops", async () => { const result = await price({ loadedMiles: 300, pickupCount: 2, deliveryCount: 2 }); assert.equal(result.baseRate, 900); assert.equal(result.additionalStops, 2); assert.equal(result.stopCharges, 200); assert.equal(result.calculatedQuote, 1100) })
test("E: 40,001 lbs is declined without a quote", async () => { const result = await price({ loadedMiles: 300, weightLbs: 40001 }); assert.equal(result.decision, "DECLINE"); assert.equal(result.calculatedQuote, null); assert.equal(result.declineReason, "Weight exceeds 40,000 lb maximum.") })
test("F: exactly 40,000 lbs is allowed", async () => { const result = await price({ loadedMiles: 300, weightLbs: 40000 }); assert.equal(result.decision, "QUOTE"); assert.equal(result.baseRate, 900); assert.equal(result.calculatedQuote, 900) })
