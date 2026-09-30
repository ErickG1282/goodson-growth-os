import type { EmailIntakePricingDecision } from "./email-intake-pricing"

export type QuoteRequestInput = {
  opportunityId: string
  pickupCount: number | null
  deliveryCount: number | null
}
export type QuoteRequestPreview = EmailIntakePricingDecision & { approvalFingerprint: string | null }
export type QuoteLocation = { city: string | null; state: string | null; zip: string | null; streetAddress: string | null }
export type PricingSnapshot = {
  schema_version: 1
  source_opportunity_id: string
  origin: QuoteLocation
  destination: QuoteLocation
  equipment_type: string
  weight_lbs: number
  trimble_truck_miles: number
  broker_reported_miles: number | null
  broker_offered_rate: number | null
  pickup_count: number
  delivery_count: number
  additional_stops: number
  destination_pricing_region: string
  opening_distance_rpm: number | null
  unrounded_base_rate: number
  lane_premium_per_mile: number
  lane_premium: number
  stop_charges: number
  recommended_quote: number
  effective_rpm: number
  pricing_decision: "QUOTE"
  status: "New"
  mileage_provider: "TRIMBLE"
  mileage_calculation_id: string
  user_id: string
  calculated_at: string
  created_at: string
}
export type QuoteRequestRecord = {
  id: string; user_id: string; source_opportunity_id: string | null; source: string
  origin_city: string; origin_state: string; destination_city: string; destination_state: string
  loaded_miles: number; calculated_quote: number | null; calculated_rpm: number | null
  status: string; created_at: string; pricing_snapshot: PricingSnapshot | null
}
export type CreateQuoteRequestResult =
  | { outcome: "CREATED" | "EXISTING"; quoteRequest: QuoteRequestRecord; warning?: string }
  | { outcome: "REVIEW_REQUIRED" | "BLOCKED"; preview: QuoteRequestPreview; message: string }
