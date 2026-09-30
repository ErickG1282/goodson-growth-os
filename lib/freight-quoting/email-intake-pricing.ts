import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateFreightQuote } from "./pricing-service"
import type { QuoteBreakdown } from "./types"

export type EmailIntakePricingDecision = Omit<QuoteBreakdown, "decision"> & {
  decision: QuoteBreakdown["decision"] | "NEEDS_MILEAGE"
  mileageUsed: number | null
  brokerReportedMiles: number | null
  mileageDifference: number | null
  mileageProvider: string | null
}

type PreviewInput = { opportunityId: string; pickupCount: number | null; deliveryCount: number | null }
export type Opportunity = {
  id: string; origin_city: string | null; origin_state: string | null; origin_zip: string | null
  destination_city: string | null; destination_state: string | null; destination_zip: string | null
  pickup_date: string | null; pickup_datetime_raw: string | null; delivery_date: string | null; delivery_datetime_raw: string | null
  equipment_type: string | null; weight_lbs: number | null; broker_reported_miles: number | null
  calculated_miles: number | null; mileage_status: string; extraction_status: string
}
type Mileage = { provider: string; status: string; route_type: string; calculated_miles: number | null; provider_metadata: Record<string, unknown> }

const empty = {
  baseRate: null, openingDistanceRpm: null, lanePremiumPerMile: null, lanePremium: null,
  additionalStops: 0, stopCharges: null, calculatedQuote: null, effectiveRpm: null, detectedLaneRegion: null,
}

function stopped(decision: "NEEDS_REVIEW" | "NEEDS_MILEAGE" | "DECLINE", reason: string, brokerReportedMiles: number | null): EmailIntakePricingDecision {
  return {
    decision,
    declineReason: decision === "DECLINE" ? reason : null,
    reviewReason: decision === "DECLINE" ? null : reason,
    mileageUsed: null, brokerReportedMiles, mileageDifference: null, mileageProvider: null,
    ...empty,
  }
}

export async function previewEmailIntakePrice(
  client: SupabaseClient,
  userId: string,
  input: PreviewInput,
  approvedProvider = "TRIMBLE",
  opportunityOverride?: Opportunity,
): Promise<EmailIntakePricingDecision> {
  const opportunityResult = opportunityOverride ? { data: opportunityOverride, error: null } : await client.from("gbgs_load_opportunities").select("id,origin_city,origin_state,origin_zip,destination_city,destination_state,destination_zip,pickup_date,pickup_datetime_raw,delivery_date,delivery_datetime_raw,equipment_type,weight_lbs,broker_reported_miles,calculated_miles,mileage_status,extraction_status").eq("id", input.opportunityId).eq("user_id", userId).single()
  if (opportunityResult.error || !opportunityResult.data) throw new Error(opportunityResult.error?.message ?? "Load opportunity not found.")
  const opportunity = opportunityResult.data as Opportunity

  if (opportunity.extraction_status !== "READY_TO_QUOTE") {
    return stopped("NEEDS_REVIEW", "Resolve all HIGH origin, destination, pickup, delivery, equipment, and weight conflicts before pricing.", opportunity.broker_reported_miles)
  }
  const required = opportunity.origin_city && opportunity.origin_state && opportunity.destination_city && opportunity.destination_state
    && opportunity.equipment_type && opportunity.weight_lbs != null
  if (!required) return stopped("NEEDS_REVIEW", "Origin, destination, equipment, and weight must be reviewed before pricing.", opportunity.broker_reported_miles)

  const settingsResult = await client.from("gbgs_quote_settings").select("max_weight_lbs").eq("user_id", userId).single()
  if (settingsResult.error || !settingsResult.data) throw new Error(settingsResult.error?.message ?? "Pricing settings not found.")
  const maxWeight = Number(settingsResult.data.max_weight_lbs)
  const weightLbs = opportunity.weight_lbs as number
  if (weightLbs > maxWeight) return stopped("DECLINE", `Weight exceeds ${maxWeight.toLocaleString()} lb maximum.`, opportunity.broker_reported_miles)

  if (!Number.isInteger(input.pickupCount) || !Number.isInteger(input.deliveryCount) || (input.pickupCount ?? 0) < 1 || (input.deliveryCount ?? 0) < 1) {
    return stopped("NEEDS_REVIEW", "Enter verified pickup and delivery stop counts before pricing.", opportunity.broker_reported_miles)
  }

  if (approvedProvider !== "TRIMBLE" || opportunity.mileage_status !== "AVAILABLE" || opportunity.calculated_miles == null || opportunity.calculated_miles <= 0) {
    return stopped("NEEDS_MILEAGE", "Validated TRIMBLE commercial-truck mileage is required before pricing.", opportunity.broker_reported_miles)
  }
  const calculatedMiles = opportunity.calculated_miles as number
  const mileageResult = await client.from("gbgs_truck_mileage_calculations").select("provider,status,route_type,calculated_miles,provider_metadata").eq("load_opportunity_id", opportunity.id).eq("user_id", userId).eq("provider", approvedProvider).eq("status", "AVAILABLE").order("calculated_at", { ascending: false }).limit(1).maybeSingle()
  if (mileageResult.error) throw new Error(mileageResult.error.message)
  const mileage = mileageResult.data as Mileage | null
  if (!mileage || mileage.route_type !== "COMMERCIAL_TRUCK" || mileage.calculated_miles !== calculatedMiles
    || mileage.provider_metadata?.routingType !== "Practical" || mileage.provider_metadata?.vehicleType !== "Truck"
    || mileage.provider_metadata?.overrideRestrictions !== false) {
    return stopped("NEEDS_MILEAGE", "Validated TRIMBLE commercial-truck mileage is required before pricing.", opportunity.broker_reported_miles)
  }

  const quote = await calculateFreightQuote(client, userId, {
    originCity: opportunity.origin_city, originState: opportunity.origin_state!, originZip: opportunity.origin_zip,
    destinationCity: opportunity.destination_city!, destinationState: opportunity.destination_state!, destinationZip: opportunity.destination_zip,
    loadedMiles: calculatedMiles, weightLbs,
    equipmentType: opportunity.equipment_type!, pickupCount: input.pickupCount!, deliveryCount: input.deliveryCount!,
  })
  return {
    ...quote,
    mileageUsed: calculatedMiles,
    brokerReportedMiles: opportunity.broker_reported_miles,
    mileageDifference: opportunity.broker_reported_miles == null ? null : calculatedMiles - opportunity.broker_reported_miles,
    mileageProvider: mileage.provider,
  }
}
