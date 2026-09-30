import type { SupabaseClient } from "@supabase/supabase-js"
import type { PricingSnapshot } from "../../lib/freight-quoting/quote-request-types"

export const draftUser = "owner-1", draftQuote = "saved-quote-1", draftOpportunity = "load-1"
export const draftTable = "gbgs_broker_reply_draft_revisions"
export const snapshot: PricingSnapshot = {
  schema_version: 1, source_opportunity_id: draftOpportunity, user_id: draftUser,
  origin: { city: "Atlanta", state: "GA", zip: "30303", streetAddress: null },
  destination: { city: "Orlando", state: "FL", zip: "32801", streetAddress: null },
  equipment_type: "Dry Van", weight_lbs: 18082, trimble_truck_miles: 439, broker_reported_miles: 400,
  broker_offered_rate: 1000, pickup_count: 1, delivery_count: 1, additional_stops: 0,
  destination_pricing_region: "Central Florida", opening_distance_rpm: 3, unrounded_base_rate: 1317,
  lane_premium_per_mile: 0.25, lane_premium: 109.75, stop_charges: 0, recommended_quote: 1450,
  effective_rpm: 1450 / 439, pricing_decision: "QUOTE", status: "New", mileage_provider: "TRIMBLE",
  mileage_calculation_id: "mileage-saved-1", calculated_at: "2026-09-15T15:00:00Z", created_at: "2026-09-15T15:00:00Z",
}
type Row = Record<string, any>
export function brokerFixture() {
  const records: Record<string, Row[]> = {
    gbgs_quote_requests: [{ id: draftQuote, user_id: draftUser, source: "Email", status: "New", source_opportunity_id: draftOpportunity, pricing_snapshot: structuredClone(snapshot), calculated_quote: 999 }],
    gbgs_load_opportunities: [{ id: draftOpportunity, user_id: draftUser, source_email_id: "email-1", broker_email: "wrong@example.test" }],
    gbgs_incoming_load_emails: [{ id: "email-1", user_id: draftUser, sender_email: "broker@example.test", subject: "Atlanta to Orlando load", external_message_id: "original-message-1" }],
    [draftTable]: [],
  }
  const reads: string[] = [], writes: string[] = []
  const controls = { failInsert: false, failRead: false }
  const client = { from(table: string) {
    if (!records[table]) throw new Error("Forbidden table or external workflow: " + table)
    const filters: Array<[string, unknown]> = []
    let limit: number | undefined, order: string | undefined, ascending = true, payload: Row | undefined
    const execute = () => {
      if (payload) {
        if (table !== draftTable) throw new Error("Only draft revisions may be written")
        writes.push(table)
        if (controls.failInsert) return { data: null, error: { code: "500", message: "simulated insert failure" } }
        if (records[table].some(row => row.quote_request_id === payload!.quote_request_id && row.revision === payload!.revision)) return { data: null, error: { code: "23505", message: "duplicate revision" } }
        const row = structuredClone({ id: "revision-" + (records[table].length + 1), ...payload })
        records[table].push(row)
        return { data: [structuredClone(row)], error: null }
      }
      reads.push(table)
      if (controls.failRead) return { data: null, error: { code: "500", message: "simulated read failure" } }
      let rows = records[table].filter(row => filters.every(([k, v]) => row[k] === v))
      if (order) rows = [...rows].sort((a,b) => (typeof a[order!] === "number" ? a[order!] - b[order!] : String(a[order!]).localeCompare(String(b[order!]))) * (ascending ? 1 : -1))
      return { data: structuredClone(rows.slice(0, limit)), error: null }
    }
    const builder = {
      select() { return builder }, eq(k: string, v: unknown) { filters.push([k,v]); return builder },
      order(k: string, opts?: { ascending?: boolean }) { order = k; ascending = opts?.ascending !== false; return builder },
      limit(n: number) { limit=n; return builder }, insert(row: Row) { payload=row; return builder },
      single() { const r=execute(); return Promise.resolve({ data:r.data?.[0] ?? null,error:r.error ?? (!r.data?.length ? {code:"404",message:"not found"} : null) }) },
      maybeSingle() { const r=execute(); return Promise.resolve({data:r.data?.[0] ?? null,error:r.error}) },
      then(resolve: (v: ReturnType<typeof execute>)=>unknown,reject: (e:unknown)=>unknown) { return Promise.resolve(execute()).then(resolve,reject) },
    }
    return builder
  } } as unknown as SupabaseClient
  return { client, records, reads, writes, controls }
}
