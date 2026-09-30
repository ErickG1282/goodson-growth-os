import type { SupabaseClient } from "@supabase/supabase-js"

export const userId = "user-1", opportunityId = "opportunity-1"
type Row = Record<string, any>
export function quoteFixture() {
  const records: Record<string, Row[]> = {
    gbgs_load_opportunities: [{
      id: opportunityId, user_id: userId, origin_city: "Buford", origin_state: "GA", origin_zip: "30519",
      destination_city: "Macon", destination_state: "GA", destination_zip: "31201",
      origin_street_address: null, destination_street_address: null, equipment_type: "Dry Van",
      weight_lbs: 18082, broker_reported_miles: 600, broker_offered_rate: 1400,
      calculated_miles: 585, mileage_status: "AVAILABLE", extraction_status: "READY_TO_QUOTE", extraction_issues: [],
      broker_contact_name: "Test Broker", broker_name: "Fixture", broker_email: "broker@example.test",
    }],
    gbgs_load_opportunity_corrections: [],
    gbgs_truck_mileage_calculations: [{
      id: "mileage-1", user_id: userId, load_opportunity_id: opportunityId,
      provider: "TRIMBLE", status: "AVAILABLE", route_type: "COMMERCIAL_TRUCK", calculated_miles: 585,
      calculated_at: "2026-09-04T12:00:00Z",
      origin_used: { city: "Buford", state: "GA", zip: "30519", streetAddress: null },
      destination_used: { city: "Macon", state: "GA", zip: "31201", streetAddress: null },
      provider_metadata: { routingType: "Practical", vehicleType: "Truck", overrideRestrictions: false },
    }],
    gbgs_quote_settings: [{ user_id: userId, short_haul_max_miles: 100, short_haul_minimum: 600, max_weight_lbs: 40000, additional_stop_charge: 100, target_rpm: 2.5, hard_floor_rpm: 2.25, round_quote_to: 25 }],
    gbgs_quote_distance_rules: [{ user_id: userId, active: true, min_miles: 501, max_miles: 750, opening_rpm: 2.9, minimum_charge: null, sort_order: 1 }],
    gbgs_quote_lane_rules: [{ user_id: userId, active: true, origin_state: "GA", destination_region: "Georgia", premium_per_mile: 0 }],
    gbgs_quote_equipment_rules: [{ user_id: userId, active: true, equipment_type: "Dry Van" }],
    gbgs_quote_requests: [], gbgs_quote_history: [],
  }
  const writes: string[] = [], reads: string[] = []
  const controls = { failHistory: false, failQuote: false }
  const client = { from(table: string) {
    if (!(table in records)) throw new Error("Unexpected table: " + table)
    const filters: Array<[string, unknown]> = []
    let maximum: number | undefined, sortKey: string | undefined, ascending = true, payload: Row | undefined
    const rows = () => {
      let result = records[table].filter(row => filters.every(([key, value]) => row[key] === value))
      if (sortKey) result = [...result].sort((a, b) => String(a[sortKey!]).localeCompare(String(b[sortKey!])) * (ascending ? 1 : -1))
      return result.slice(0, maximum)
    }
    const execute = () => {
      if (!payload) { reads.push(table); return { data: rows(), error: null } }
      writes.push(table)
      if (table === "gbgs_quote_history" && controls.failHistory) return { data: null, error: { code: "500", message: "history failure" } }
      if (table === "gbgs_quote_requests" && controls.failQuote) return { data: null, error: { code: "500", message: "insert failure" } }
      if (table === "gbgs_quote_requests" && records[table].some(row => row.source_opportunity_id === payload!.source_opportunity_id)) return { data: null, error: { code: "23505", message: "duplicate" } }
      const row = structuredClone({ id: "quote-" + (records[table].length + 1), ...payload })
      records[table].push(row)
      return { data: [row], error: null }
    }
    const builder = {
      select() { return builder }, eq(key: string, value: unknown) { filters.push([key, value]); return builder },
      order(key: string, options?: { ascending?: boolean }) { sortKey = key; ascending = options?.ascending !== false; return builder },
      limit(value: number) { maximum = value; return builder }, insert(value: Row) { payload = value; return builder },
      single() { const r = execute(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error ?? (!r.data?.length ? { code: "404", message: "not found" } : null) }) },
      maybeSingle() { const r = execute(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }) },
      then(resolve: (value: ReturnType<typeof execute>) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(execute()).then(resolve, reject) },
    }
    return builder
  } } as unknown as SupabaseClient
  return { client, records, writes, reads, controls }
}
