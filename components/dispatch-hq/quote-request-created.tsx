"use client"
import Link from "next/link"
import { useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { CreateQuoteRequestResult, QuoteRequestPreview, QuoteRequestRecord } from "@/lib/freight-quoting/quote-request-types"
import { money } from "./quoting-ui"

export function QuoteRequestCreated({ opportunityId, pickupCount, deliveryCount, preview, setPreview, dirty, busy, setBusy }: {
  opportunityId: string; pickupCount: string; deliveryCount: string; preview: QuoteRequestPreview | null
  setPreview: (preview: QuoteRequestPreview) => void; dirty: boolean; busy: boolean; setBusy: (busy: boolean) => void
}) {
  const inFlight = useRef(false)
  const [created, setCreated] = useState<QuoteRequestRecord | null>(null)
  const [message, setMessage] = useState("")
  async function create() {
    if (inFlight.current || busy || dirty || !preview?.approvalFingerprint) return
    inFlight.current = true; setBusy(true); setMessage("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setMessage("You must be signed in."); return }
      const response = await fetch("/api/freight-emails/quote-request", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ opportunityId, pickupCount: Number(pickupCount), deliveryCount: Number(deliveryCount), approvalFingerprint: preview.approvalFingerprint }),
      })
      const body = await response.json() as CreateQuoteRequestResult & { error?: string }
      if (body.outcome === "REVIEW_REQUIRED" || body.outcome === "BLOCKED") { setPreview(body.preview); setMessage(body.message); return }
      if (!response.ok || !("quoteRequest" in body)) { setMessage(body.error ?? "Unable to create quote request. Retry safely."); return }
      setCreated(body.quoteRequest)
      setMessage(body.warning ?? (body.outcome === "EXISTING" ? "This opportunity already has a quote request. Showing the existing record." : ""))
    } catch { setMessage("The server could not be reached. Retry safely; an existing quote request will be returned.") }
    finally { inFlight.current = false; setBusy(false) }
  }
  if (created) return <section role="status" className="mt-5 rounded-xl border border-green-300 bg-green-50 p-5 text-[#081C35]">
    <h3 className="text-xl font-black">QUOTE REQUEST CREATED</h3>
    {message && <p className="mt-2">{message}</p>}
    <dl className="mt-3 grid gap-2 text-sm">
      <div><dt className="font-bold">Quote Request ID</dt><dd className="break-all">{created.id}</dd></div>
      <div><dt className="font-bold">Lane</dt><dd>{created.origin_city}, {created.origin_state} → {created.destination_city}, {created.destination_state}</dd></div>
      <div><dt className="font-bold">Truck miles</dt><dd>{created.pricing_snapshot?.trimble_truck_miles ?? created.loaded_miles}</dd></div>
      <div><dt className="font-bold">Recommended Quote</dt><dd>{money(created.pricing_snapshot?.recommended_quote ?? created.calculated_quote)}</dd></div>
      <div><dt className="font-bold">Effective RPM</dt><dd>{Number(created.pricing_snapshot?.effective_rpm ?? created.calculated_rpm ?? 0).toFixed(2)}</dd></div>
      <div><dt className="font-bold">Status</dt><dd>{created.status} — internal request, not sent</dd></div>
    </dl>
    <Link className="mt-4 inline-block rounded-lg bg-[#081C35] px-4 py-3 text-sm font-bold text-white" href={`/dashboard/dispatch/quoting/requests/${created.id}`}>OPEN QUOTE REQUEST</Link>
  </section>
  return <section className="mt-4">
    {message && <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">{message}</p>}
    {preview?.decision === "QUOTE" && preview.approvalFingerprint && <>
      <button type="button" onClick={create} disabled={busy || dirty} className="rounded-lg bg-[#C9A227] px-5 py-3 text-sm font-black text-[#081C35] disabled:opacity-50">{inFlight.current ? "CREATING…" : "CREATE QUOTE REQUEST"}</button>
      <p className="mt-2 text-sm text-muted-foreground">Creates an internal quote record only. Nothing will be emailed to the broker.</p>
      {dirty && <p className="mt-2 text-sm text-amber-800">Save corrections and calculate a new preview before creating the quote request.</p>}
    </>}
  </section>
}
