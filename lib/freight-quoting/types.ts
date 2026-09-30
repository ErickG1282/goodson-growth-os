export type QuoteInput = {
  originCity?: string | null
  originState: string
  originZip?: string | null
  destinationCity: string
  destinationState: string
  destinationZip?: string | null
  loadedMiles: number
  weightLbs: number
  equipmentType: string
  pickupCount: number
  deliveryCount: number
}

export type QuoteDecision = "QUOTE" | "DECLINE" | "NEEDS_REVIEW"

export type QuoteBreakdown = {
  decision: QuoteDecision
  declineReason: string | null
  reviewReason: string | null
  baseRate: number | null
  openingDistanceRpm: number | null
  lanePremiumPerMile: number | null
  lanePremium: number | null
  additionalStops: number
  stopCharges: number | null
  calculatedQuote: number | null
  effectiveRpm: number | null
  detectedLaneRegion: string | null
}

export type QuoteSettings = {
  short_haul_max_miles: number
  short_haul_minimum: number
  max_weight_lbs: number
  additional_stop_charge: number
  target_rpm: number
  hard_floor_rpm: number
  round_quote_to: number
  auto_quote_enabled: boolean
  auto_decline_overweight: boolean
}
