import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { previewEmailIntakePrice, type Opportunity, type EmailIntakePricingDecision } from "./email-intake-pricing"
import type { CreateQuoteRequestResult, PricingSnapshot, QuoteLocation, QuoteRequestInput, QuoteRequestPreview, QuoteRequestRecord } from "./quote-request-types"

type IntakeOpportunity = Opportunity & {
  user_id: string; broker_offered_rate: number | null; broker_contact_name: string | null
  broker_name: string | null; broker_email: string | null
  origin_street_address: string | null; destination_street_address: string | null
  extraction_issues: Array<{ field: string; severity: string }>
}
type Mileage = {
  id: string; provider: string; status: string; route_type: string; calculated_miles: number | null
  origin_used: QuoteLocation; destination_used: QuoteLocation
  provider_metadata: Record<string, unknown>
}
type SnapshotValues = Omit<PricingSnapshot, "calculated_at" | "created_at">
const empty = { baseRate: null, openingDistanceRpm: null, lanePremiumPerMile: null, lanePremium: null, additionalStops: 0, stopCharges: null, calculatedQuote: null, effectiveRpm: null, detectedLaneRegion: null }
const normalized = (value: unknown) => String(value ?? "").trim().toUpperCase()
function sameEndpoint(stored: QuoteLocation | null, current: QuoteLocation) {
  return stored != null && (["city", "state", "zip", "streetAddress"] as const).every(key => normalized(stored[key]) === normalized(current[key]))
}
function endpoint(opportunity: IntakeOpportunity, side: "origin" | "destination"): QuoteLocation {
  return { city: opportunity[`${side}_city`], state: opportunity[`${side}_state`], zip: opportunity[`${side}_zip`], streetAddress: opportunity[`${side}_street_address`] ?? null }
}
function blocked(decision: "NEEDS_REVIEW" | "NEEDS_MILEAGE", reason: string, brokerMiles: number | null): QuoteRequestPreview {
  return { ...empty, decision, declineReason: null, reviewReason: reason, mileageUsed: null, brokerReportedMiles: brokerMiles, mileageDifference: null, mileageProvider: null, approvalFingerprint: null }
}
function fingerprint(snapshot: SnapshotValues) {
  // Comparison only: this fingerprint is never an authorization credential.
  // All persisted values are independently recomputed on the server.
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
}
async function evaluate(client: SupabaseClient, userId: string, input: QuoteRequestInput): Promise<{
  preview: QuoteRequestPreview; snapshot: SnapshotValues | null; opportunity: IntakeOpportunity
}> {
  if (!userId || !input || typeof input.opportunityId !== "string" || !input.opportunityId.trim()) throw new Error("Load opportunity is required.")
  const { data, error } = await client.from("gbgs_load_opportunities").select("*").eq("id", input.opportunityId).eq("user_id", userId).single()
  if (error || !data) throw new Error("Load opportunity not found.")
  const opportunity = data as IntakeOpportunity
  const stop = (decision: "NEEDS_REVIEW" | "NEEDS_MILEAGE", reason: string) => ({ opportunity, snapshot: null, preview: blocked(decision, reason, opportunity.broker_reported_miles) })
  if (!Number.isSafeInteger(input.pickupCount) || !Number.isSafeInteger(input.deliveryCount) || (input.pickupCount ?? 0) < 1 || (input.deliveryCount ?? 0) < 1) return stop("NEEDS_REVIEW", "Enter verified pickup and delivery stop counts before pricing.")
  if (!Number.isFinite(opportunity.weight_lbs) || opportunity.weight_lbs! <= 0) return stop("NEEDS_REVIEW", "A valid cargo weight is required.")
  if (opportunity.extraction_status !== "READY_TO_QUOTE") return stop("NEEDS_REVIEW", "Resolve all HIGH blocking conflicts before creating a quote request.")
  const high = (opportunity.extraction_issues ?? []).filter(issue => issue.severity === "HIGH")
  if (high.length) {
    const corrections = await client.from("gbgs_load_opportunity_corrections").select("field_name,corrected_value,corrected_at").eq("load_opportunity_id", input.opportunityId).eq("user_id", userId).order("corrected_at", { ascending: false })
    if (corrections.error) throw new Error("Unable to verify correction history.")
    const fields: Record<string, string[]> = { origin: ["origin_city", "origin_state", "origin_zip"], destination: ["destination_city", "destination_state", "destination_zip"], pickup: ["pickup_date", "pickup_time"], delivery: ["delivery_date", "delivery_time"], equipment: ["equipment_type"] }
    const current = opportunity as unknown as Record<string, unknown>
    const resolved = high.every(issue => (fields[issue.field] ?? [issue.field]).some(field => {
      const correction = corrections.data?.find(row => row.field_name === field)
      return correction && current[field] != null && normalized(correction.corrected_value) === normalized(current[field])
    }))
    if (!resolved) return stop("NEEDS_REVIEW", "Unresolved HIGH conflicts require saved, verified corrections.")
  }

  // Reuse the existing pricing engine and its current database configuration.
  // This object came from the owner-scoped server query, never from the browser.
  const result: EmailIntakePricingDecision = await previewEmailIntakePrice(client, userId, input, "TRIMBLE", opportunity)
  if (result.decision !== "QUOTE") return { opportunity, snapshot: null, preview: { ...result, approvalFingerprint: null } }
  const latest = await client.from("gbgs_truck_mileage_calculations").select("*").eq("load_opportunity_id", input.opportunityId).eq("user_id", userId).order("calculated_at", { ascending: false }).limit(1).maybeSingle()
  if (latest.error) throw new Error("Unable to verify truck mileage.")
  const mileage = latest.data as Mileage | null
  const origin = endpoint(opportunity, "origin"), destination = endpoint(opportunity, "destination")
  if (!mileage || !mileage.id || mileage.provider !== "TRIMBLE" || mileage.status !== "AVAILABLE" || mileage.route_type !== "COMMERCIAL_TRUCK"
    || !Number.isFinite(mileage.calculated_miles) || mileage.calculated_miles! <= 0 || mileage.calculated_miles !== result.mileageUsed
    || mileage.provider_metadata?.routingType !== "Practical" || mileage.provider_metadata?.vehicleType !== "Truck" || mileage.provider_metadata?.overrideRestrictions !== false
    || !sameEndpoint(mileage.origin_used, origin) || !sameEndpoint(mileage.destination_used, destination)) {
    return stop("NEEDS_MILEAGE", "Validated AVAILABLE Trimble commercial-truck mileage for the current lane is required. Recalculate truck miles after changing locations.")
  }
  if ([result.baseRate, result.lanePremiumPerMile, result.lanePremium, result.stopCharges, result.calculatedQuote, result.effectiveRpm].some(value => !Number.isFinite(value)) || !result.detectedLaneRegion) return stop("NEEDS_REVIEW", "Pricing configuration did not produce a valid quote.")
  const snapshot: SnapshotValues = {
    schema_version: 1, source_opportunity_id: opportunity.id, origin, destination,
    equipment_type: opportunity.equipment_type!, weight_lbs: opportunity.weight_lbs!,
    trimble_truck_miles: result.mileageUsed!, broker_reported_miles: opportunity.broker_reported_miles,
    broker_offered_rate: opportunity.broker_offered_rate ?? null,
    pickup_count: input.pickupCount!, delivery_count: input.deliveryCount!,
    additional_stops: result.additionalStops, destination_pricing_region: result.detectedLaneRegion,
    opening_distance_rpm: result.openingDistanceRpm, unrounded_base_rate: result.baseRate!,
    lane_premium_per_mile: result.lanePremiumPerMile!, lane_premium: result.lanePremium!,
    stop_charges: result.stopCharges!, recommended_quote: result.calculatedQuote!, effective_rpm: result.effectiveRpm!,
    pricing_decision: "QUOTE", status: "New", mileage_provider: "TRIMBLE",
    mileage_calculation_id: mileage.id, user_id: userId,
  }
  return { opportunity, snapshot, preview: { ...result, approvalFingerprint: fingerprint(snapshot) } }
}

export async function previewQuoteRequest(client: SupabaseClient, userId: string, input: QuoteRequestInput) {
  return (await evaluate(client, userId, input)).preview
}
async function existingQuote(client: SupabaseClient, userId: string, opportunityId: string) {
  const { data, error } = await client.from("gbgs_quote_requests").select("*").eq("source_opportunity_id", opportunityId).eq("user_id", userId).maybeSingle()
  if (error) throw new Error("Unable to check for an existing quote request.")
  return data as QuoteRequestRecord | null
}
export async function createQuoteRequest(client: SupabaseClient, userId: string, input: QuoteRequestInput & { approvalFingerprint?: string }): Promise<CreateQuoteRequestResult> {
  if (!userId || !input || typeof input.opportunityId !== "string" || !input.opportunityId.trim()) throw new Error("Load opportunity is required.")
  const existing = await existingQuote(client, userId, input.opportunityId)
  if (existing) return { outcome: "EXISTING", quoteRequest: existing }
  const { preview, snapshot, opportunity } = await evaluate(client, userId, input)
  if (!snapshot) return { outcome: "BLOCKED", preview, message: preview.reviewReason ?? preview.declineReason ?? "Review this opportunity before creating a quote request." }
  if (!input.approvalFingerprint || input.approvalFingerprint !== preview.approvalFingerprint) {
    return { outcome: "REVIEW_REQUIRED", preview, message: "Pricing or load details changed, or the preview is missing. Review the new Recommended Quote and click CREATE QUOTE REQUEST again to confirm." }
  }
  const now = new Date().toISOString()
  const pricingSnapshot: PricingSnapshot = { ...snapshot, calculated_at: now, created_at: now }
  const payload = {
    user_id: userId, source_opportunity_id: opportunity.id, source: "Email", status: "New",
    customer_name: opportunity.broker_contact_name, customer_company: opportunity.broker_name, customer_email: opportunity.broker_email,
    origin_city: snapshot.origin.city, origin_state: snapshot.origin.state, origin_zip: snapshot.origin.zip,
    destination_city: snapshot.destination.city, destination_state: snapshot.destination.state, destination_zip: snapshot.destination.zip,
    equipment_type: snapshot.equipment_type, weight_lbs: snapshot.weight_lbs, loaded_miles: snapshot.trimble_truck_miles,
    pickup_count: snapshot.pickup_count, delivery_count: snapshot.delivery_count,
    base_rate: snapshot.unrounded_base_rate, opening_distance_rpm: snapshot.opening_distance_rpm,
    lane_premium: snapshot.lane_premium, stop_charges: snapshot.stop_charges,
    calculated_quote: snapshot.recommended_quote, calculated_rpm: snapshot.effective_rpm,
    pricing_snapshot: pricingSnapshot, created_at: now,
  }
  const { data, error } = await client.from("gbgs_quote_requests").insert(payload).select("*").single()
  if (error) {
    if (error.code === "23505") {
      const winner = await existingQuote(client, userId, opportunity.id)
      if (winner) return { outcome: "EXISTING", quoteRequest: winner }
    }
    throw new Error("Unable to save quote request. Retry safely; duplicate requests will return the existing quote.")
  }
  const quoteRequest = data as QuoteRequestRecord
  // The complete snapshot is already durable in the quote insert. A secondary
  // history outage must not report the official quote as uncreated.
  try {
    const history = await client.from("gbgs_quote_history").insert({ user_id: userId, quote_request_id: quoteRequest.id, action: "Email Intake quote request created", to_status: "New", quoted_amount: snapshot.recommended_quote, details: pricingSnapshot })
    if (history.error) throw new Error("history unavailable")
  } catch {
    return { outcome: "CREATED", quoteRequest, warning: "Quote request and pricing snapshot were saved, but its separate history entry could not be recorded." }
  }
  return { outcome: "CREATED", quoteRequest }
}
