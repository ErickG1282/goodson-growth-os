import type { SupabaseClient } from "@supabase/supabase-js"
import type { QuoteBreakdown, QuoteInput, QuoteSettings } from "./types"
import { classifyDestinationPricingRegion, normalizeState } from "./lane-classifier"

type DistanceRule = { min_miles: number; max_miles: number | null; opening_rpm: number | null; minimum_charge: number | null }
type LaneRule = { origin_state: string; destination_region: string; premium_per_mile: number }

function roundUp(value: number, increment: number) {
  return Math.ceil(value / increment) * increment
}

export async function calculateFreightQuote(client: SupabaseClient, userId: string, input: QuoteInput): Promise<QuoteBreakdown> {
  const [settingsResult, distanceResult, laneResult, equipmentResult] = await Promise.all([
    client.from("gbgs_quote_settings").select("*").eq("user_id", userId).single(),
    client.from("gbgs_quote_distance_rules").select("min_miles,max_miles,opening_rpm,minimum_charge").eq("user_id", userId).eq("active", true).order("sort_order"),
    client.from("gbgs_quote_lane_rules").select("origin_state,destination_region,premium_per_mile").eq("user_id", userId).eq("active", true),
    client.from("gbgs_quote_equipment_rules").select("equipment_type").eq("user_id", userId).eq("active", true),
  ])

  const firstError = settingsResult.error ?? distanceResult.error ?? laneResult.error ?? equipmentResult.error
  if (firstError) throw new Error(firstError.message)

  const settings = settingsResult.data as QuoteSettings
  const equipment = (equipmentResult.data ?? []).map((rule) => rule.equipment_type)
  const empty = { baseRate: null, openingDistanceRpm: null, lanePremiumPerMile: null, lanePremium: null, additionalStops: 0, stopCharges: null, calculatedQuote: null, effectiveRpm: null, detectedLaneRegion: null }

  if (!equipment.includes(input.equipmentType)) return { decision: "DECLINE", declineReason: "Equipment type is not approved.", reviewReason: null, ...empty }
  if (input.weightLbs > settings.max_weight_lbs) return { decision: "DECLINE", declineReason: `Weight exceeds ${settings.max_weight_lbs.toLocaleString()} lb maximum.`, reviewReason: null, ...empty }
  if (input.loadedMiles <= 0) return { decision: "NEEDS_REVIEW", declineReason: null, reviewReason: "Loaded miles must be greater than zero.", ...empty }
  if (input.pickupCount < 1 || input.deliveryCount < 1) return { decision: "NEEDS_REVIEW", declineReason: null, reviewReason: "At least one pickup and one delivery are required.", ...empty }

  const destinationRegion = classifyDestinationPricingRegion(input)
  if (!destinationRegion) return { decision: "NEEDS_REVIEW", declineReason: null, reviewReason: "Unable to determine destination pricing region.", ...empty }

  const distanceRule = (distanceResult.data as DistanceRule[]).find((rule) => input.loadedMiles >= rule.min_miles && (rule.max_miles === null || input.loadedMiles <= rule.max_miles))
  if (!distanceRule) return { decision: "NEEDS_REVIEW", declineReason: null, reviewReason: "No active distance pricing rule matches this load.", ...empty }

  const baseRate = input.loadedMiles <= settings.short_haul_max_miles
    ? Math.max(settings.short_haul_minimum, distanceRule.minimum_charge ?? 0)
    : input.loadedMiles * Number(distanceRule.opening_rpm ?? 0)
  const originState = normalizeState(input.originState)
  const laneRule = (laneResult.data as LaneRule[]).find((rule) => rule.origin_state.toUpperCase() === originState && rule.destination_region.toLowerCase() === destinationRegion.toLowerCase())
  if (!laneRule) return { decision: "NEEDS_REVIEW", declineReason: null, reviewReason: "No active lane pricing rule matches this origin and destination region.", ...empty }
  const lanePremiumPerMile = Number(laneRule?.premium_per_mile ?? 0)
  const lanePremium = input.loadedMiles * lanePremiumPerMile
  const additionalStops = Math.max(0, input.pickupCount - 1) + Math.max(0, input.deliveryCount - 1)
  const stopCharges = additionalStops * settings.additional_stop_charge
  const calculatedQuote = roundUp(baseRate + lanePremium + stopCharges, settings.round_quote_to)

  return {
    decision: "QUOTE", declineReason: null, reviewReason: null,
    baseRate, openingDistanceRpm: distanceRule.opening_rpm, lanePremiumPerMile, lanePremium,
    additionalStops, stopCharges, calculatedQuote, effectiveRpm: calculatedQuote / input.loadedMiles, detectedLaneRegion: destinationRegion,
  }
}
