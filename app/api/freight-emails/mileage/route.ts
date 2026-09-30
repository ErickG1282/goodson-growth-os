import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createMileageService } from "@/lib/freight-email/mileage-service"

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 })
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const token = authorization.replace(/^Bearer\s+/i, ""), { data: { user }, error: authError } = await client.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { opportunityId } = await request.json() as { opportunityId?: string }
  if (!opportunityId) return NextResponse.json({ error: "Load opportunity is required." }, { status: 400 })
  const { data: opportunity, error } = await client.from("gbgs_load_opportunities").select("*").eq("id", opportunityId).eq("user_id", user.id).single()
  if (error || !opportunity) return NextResponse.json({ error: "Load opportunity not found." }, { status: 404 })
  const addressOpportunity = opportunity as typeof opportunity & { origin_street_address?: string | null; destination_street_address?: string | null }
  const origin = { city: opportunity.origin_city, state: opportunity.origin_state, zip: opportunity.origin_zip, streetAddress: addressOpportunity.origin_street_address }
  const destination = { city: opportunity.destination_city, state: opportunity.destination_state, zip: opportunity.destination_zip, streetAddress: addressOpportunity.destination_street_address }
  const result = await createMileageService().calculateRouteMiles(origin, destination)
  const metadata = { ...result.providerMetadata, ...(result.reason ? { reason: result.reason } : {}) }
  const { error: historyError } = await client.from("gbgs_truck_mileage_calculations").insert({ user_id: user.id, load_opportunity_id: opportunity.id, provider: result.provider, status: result.status, route_type: result.routeType, vehicle_profile: result.vehicleProfile, origin_used: origin, destination_used: destination, calculated_miles: result.miles, warnings: result.warnings, provider_metadata: metadata })
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 400 })
  const { error: updateError } = await client.from("gbgs_load_opportunities").update({ calculated_miles: result.miles, mileage_status: result.status }).eq("id", opportunity.id).eq("user_id", user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
  return NextResponse.json(result)
}
