"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { QuoteRequestRecord } from "@/lib/freight-quoting/quote-request-types"
import { BrokerReplyDraft } from "./broker-reply-draft"
import { ManualQuoteTester } from "./manual-quote-tester"
import { EmptyState, money, QuotePage } from "./quoting-ui"

export function QuoteRequests({ requestId }: { requestId?: string }) {
  const [rows, setRows] = useState<QuoteRequestRecord[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("You must be signed in.")
        let query = supabase.from("gbgs_quote_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
        if (requestId) query = query.eq("id", requestId)
        const result = await query
        if (result.error) throw new Error("Unable to load quote requests.")
        if (!cancelled) setRows((result.data ?? []) as QuoteRequestRecord[])
      } catch (failure) { if (!cancelled) setError(failure instanceof Error ? failure.message : "Unable to load quote requests.") }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [requestId])
  return <>
    <QuotePage title={requestId ? "Quote Request Details" : "Quote Requests"} description="Internal quote requests and the pricing approved at creation. Creating a request does not send an email or book freight."
      action={requestId ? <Link href="/dashboard/dispatch/quoting/requests" className="font-bold underline">All Quote Requests</Link> : undefined}>
      {error ? <p role="alert">{error}</p> : loading ? <p>Loading quote requests…</p> : !rows.length ? <EmptyState message={requestId ? "Quote request not found or not accessible." : "No quote requests yet. Create one from a reviewed Email Intake opportunity or use the manual tester below."} /> :
        <div className="grid gap-4">{rows.map(row => <QuoteRequestDetails key={row.id} row={row} expanded={Boolean(requestId)} />)}</div>}
    </QuotePage>
    {!requestId && <details className="mx-auto mb-8 max-w-7xl rounded-xl border border-border"><summary className="cursor-pointer p-5 font-bold text-[#081C35]">Manual Quote Tester</summary><ManualQuoteTester /></details>}
  </>
}
function QuoteRequestDetails({ row, expanded }: { row: QuoteRequestRecord; expanded: boolean }) {
  const snapshot = row.pricing_snapshot
  return <article className="rounded-xl border border-border bg-card p-5 text-[#081C35]">
    <p className="text-xs font-black uppercase tracking-wider">Source: {row.source === "Email" ? "Email Intake" : row.source}</p>
    <h2 className="mt-2 text-xl font-bold">{row.origin_city}, {row.origin_state} → {row.destination_city}, {row.destination_state}</h2>
    <p className="mt-2">Status: <b>{row.status}</b> · Recommended Quote: <b>{money(snapshot?.recommended_quote ?? row.calculated_quote)}</b></p>
    <p className="mt-1 text-sm">Truck miles: {snapshot?.trimble_truck_miles ?? row.loaded_miles} · Effective RPM: {row.calculated_rpm == null ? "—" : Number(snapshot?.effective_rpm ?? row.calculated_rpm).toFixed(2)}</p>
    <p className="mt-2 break-all text-xs">Quote Request ID: {row.id}</p>
    {row.source_opportunity_id && <Link className="mt-3 inline-block text-sm font-bold underline" href={`/dashboard/dispatch/quoting/email-intake?opportunityId=${row.source_opportunity_id}`}>Original load opportunity: {row.source_opportunity_id}</Link>}
    {!expanded && <Link className="mt-4 block font-bold underline" href={`/dashboard/dispatch/quoting/requests/${row.id}`}>OPEN QUOTE REQUEST</Link>}
    {expanded && (snapshot ? <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
      {Object.entries({
        "Origin": [snapshot.origin.streetAddress, snapshot.origin.city, snapshot.origin.state, snapshot.origin.zip].filter(Boolean).join(", "),
        "Destination": [snapshot.destination.streetAddress, snapshot.destination.city, snapshot.destination.state, snapshot.destination.zip].filter(Boolean).join(", "),
        "Equipment": snapshot.equipment_type, "Cargo weight (lb)": snapshot.weight_lbs,
        "Trimble truck miles used": snapshot.trimble_truck_miles,
        "Broker-reported miles (reference only)": snapshot.broker_reported_miles ?? "Not provided",
        "Broker offered rate (reference only)": snapshot.broker_offered_rate == null ? "Not provided" : money(snapshot.broker_offered_rate),
        "Verified pickups": snapshot.pickup_count, "Verified deliveries": snapshot.delivery_count, "Additional stops": snapshot.additional_stops,
        "Destination pricing region": snapshot.destination_pricing_region, "Opening distance RPM": snapshot.opening_distance_rpm ?? "Minimum",
        "Unrounded base rate": snapshot.unrounded_base_rate, "Lane premium": money(snapshot.lane_premium), "Stop charges": money(snapshot.stop_charges),
        "Recommended Quote": money(snapshot.recommended_quote), "Effective RPM (full precision)": snapshot.effective_rpm,
        "Pricing decision": snapshot.pricing_decision, "Status at creation": snapshot.status, "Mileage provider": snapshot.mileage_provider,
        "Mileage calculation ID": snapshot.mileage_calculation_id, "Authenticated user ID": snapshot.user_id,
        "Calculated at": snapshot.calculated_at, "Created at": snapshot.created_at,
      }).map(([label, value]) => <div key={label}><dt className="text-sm font-semibold text-muted-foreground">{label}</dt><dd className="break-words font-bold">{value}</dd></div>)}
    </dl> : <p className="mt-4 text-sm text-muted-foreground">This legacy/manual quote has no complete pricing snapshot.</p>)}
    {expanded && row.source === "Email" && <BrokerReplyDraft key={row.id} quoteRequestId={row.id} />}
  </article>
}
