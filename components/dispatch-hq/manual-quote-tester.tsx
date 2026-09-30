"use client"
import { useEffect, useState } from "react"
import { Calculator, Plus, Save } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { QuoteBreakdown } from "@/lib/freight-quoting/types"
import { fieldClass, money, QuotePage } from "./quoting-ui"

const initial = { customer_name: "", customer_company: "", customer_email: "", origin_city: "", origin_state: "GA", origin_zip: "", destination_city: "", destination_state: "", destination_zip: "", loaded_miles: "", deadhead_miles: "0", weight_lbs: "", equipment_type: "Dry Van", pickup_at: "", delivery_at: "", pickup_count: "1", delivery_count: "1" }

export function ManualQuoteTester() {
  const [form, setForm] = useState(initial)
  const [result, setResult] = useState<QuoteBreakdown | null>(null)
  const [equipment, setEquipment] = useState(["Dry Van", "Power Only"])
  const [busy, setBusy] = useState<"calculate" | "save" | null>(null)
  const [message, setMessage] = useState("")
  useEffect(() => { void (async () => { const { data } = await supabase.from("gbgs_quote_equipment_rules").select("equipment_type").eq("active", true).order("equipment_type"); if (data?.length) setEquipment(data.map((r) => r.equipment_type)) })() }, [])
  const set = (key: keyof typeof initial, value: string) => { setForm((f) => ({ ...f, [key]: value })); setResult(null); setMessage("") }
  const input = (label: string, key: keyof typeof initial, type = "text") => <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">{label}<input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} className={fieldClass} /></label>

  async function calculate() {
    setBusy("calculate"); setMessage("")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setMessage("You must be signed in."); setBusy(null); return }
    const response = await fetch("/api/freight-quotes/calculate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ originCity: form.origin_city, originState: form.origin_state, originZip: form.origin_zip, destinationCity: form.destination_city, destinationState: form.destination_state, destinationZip: form.destination_zip, loadedMiles: Number(form.loaded_miles), weightLbs: Number(form.weight_lbs), equipmentType: form.equipment_type, pickupCount: Number(form.pickup_count), deliveryCount: Number(form.delivery_count) }) })
    const body = await response.json()
    if (response.ok) setResult(body as QuoteBreakdown); else setMessage(body.error ?? "Unable to calculate quote.")
    setBusy(null)
  }

  async function save() {
    if (!result) return
    setBusy("save"); setMessage("")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setMessage("You must be signed in."); setBusy(null); return }
    const status = result.decision === "DECLINE" ? "Declined" : result.decision === "NEEDS_REVIEW" ? "Needs Review" : "Quoted"
    const payload = { user_id: session.user.id, customer_name: form.customer_name || null, customer_company: form.customer_company || null, customer_email: form.customer_email || null, origin_city: form.origin_city, origin_state: form.origin_state, origin_zip: form.origin_zip || null, destination_city: form.destination_city, destination_state: form.destination_state, destination_zip: form.destination_zip || null, loaded_miles: Number(form.loaded_miles), deadhead_miles: Number(form.deadhead_miles), weight_lbs: Number(form.weight_lbs), equipment_type: form.equipment_type, pickup_at: form.pickup_at || null, delivery_at: form.delivery_at || null, pickup_count: Number(form.pickup_count), delivery_count: Number(form.delivery_count), source: "Manual", base_rate: result.baseRate, opening_distance_rpm: result.openingDistanceRpm, lane_premium: result.lanePremium, stop_charges: result.stopCharges, calculated_quote: result.calculatedQuote, calculated_rpm: result.effectiveRpm, status, decline_reason: result.declineReason, review_reason: result.reviewReason }
    const { data, error } = await supabase.from("gbgs_quote_requests").insert(payload).select("id").single()
    if (error) setMessage(error.message)
    else { await supabase.from("gbgs_quote_history").insert({ user_id: session.user.id, quote_request_id: data.id, action: "Manual quote saved", to_status: status, quoted_amount: result.calculatedQuote, details: result }); setMessage("Quote saved successfully.") }
    setBusy(null)
  }

  return <QuotePage title="Quote Requests" description="Create and save manual quotes while automated email intake remains disabled." action={<div className="inline-flex items-center gap-2 rounded-lg bg-[#C9A227] px-4 py-2 text-sm font-bold text-[#081C35]"><Plus className="h-4 w-4" />New Manual Quote</div>}>
    {message && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{message}</div>}
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="rounded-2xl bg-card p-5 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.22)]"><h2 className="text-lg font-bold text-[#081C35]">Manual Quote Tester</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {input("Customer", "customer_name")}{input("Customer Company", "customer_company")}{input("Customer Email", "customer_email", "email")}
        {input("Origin City", "origin_city")}{input("Origin State", "origin_state")}{input("Origin ZIP", "origin_zip")}
        {input("Destination City", "destination_city")}{input("Destination State", "destination_state")}{input("Destination ZIP", "destination_zip")}
        {input("Loaded Miles", "loaded_miles", "number")}{input("Deadhead Miles", "deadhead_miles", "number")}{input("Weight (lbs)", "weight_lbs", "number")}
        <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Equipment<select value={form.equipment_type} onChange={(e) => set("equipment_type", e.target.value)} className={fieldClass}>{equipment.map((e) => <option key={e}>{e}</option>)}</select></label>
        {input("Pickup Date / Time", "pickup_at", "datetime-local")}{input("Delivery Date / Time", "delivery_at", "datetime-local")}{input("Number of Pickups", "pickup_count", "number")}{input("Number of Deliveries", "delivery_count", "number")}
      </div><button type="button" disabled={busy !== null} onClick={calculate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[#081C35] px-5 text-sm font-black text-white disabled:opacity-60"><Calculator className="h-4 w-4 text-[#C9A227]" />{busy === "calculate" ? "CALCULATING..." : "CALCULATE QUOTE"}</button></section>
      <aside className={`w-full max-w-md justify-self-start rounded-2xl p-5 text-white ${result?.decision === "DECLINE" ? "bg-red-950" : "bg-[#081C35]"}`}><p className="text-xs font-bold uppercase tracking-widest text-[#C9A227]">Pricing Decision</p>
        {!result ? <p className="mt-4 text-sm text-white/60">Complete the load details and calculate to see the database-driven pricing breakdown.</p> : <><p className="mt-2 text-3xl font-black">{result.decision}</p>{result.declineReason && <p className="mt-2 text-sm text-red-200">{result.declineReason}</p>}{result.reviewReason && <p className="mt-2 text-sm text-amber-200">{result.reviewReason}</p>}{result.detectedLaneRegion && <p className="mt-3 text-sm"><span className="font-semibold text-white/75">Detected Lane:</span> <span className="font-bold text-white">{result.detectedLaneRegion}</span></p>}{result.decision === "QUOTE" && <dl className="mt-5 space-y-3 text-sm">
          <Line label="Base Rate" value={result.baseRate == null ? "—" : money(result.baseRate)} />
          <Line label="Opening Distance RPM" value={result.openingDistanceRpm == null ? "Minimum" : `$${result.openingDistanceRpm.toFixed(2)}`} />
          <Line label="Lane Premium" value={result.lanePremium == null ? "—" : money(result.lanePremium)} />
          <Line label="Stop Charges" value={result.stopCharges == null ? "—" : money(result.stopCharges)} />
          <Line label="Calculated Quote" value={result.calculatedQuote == null ? "—" : money(result.calculatedQuote)} highlight />
          <Line label="Effective RPM" value={result.effectiveRpm == null ? "—" : `$${result.effectiveRpm.toFixed(2)}`} emphasized />
        </dl>}<button type="button" onClick={save} disabled={busy !== null} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#C9A227] text-sm font-black text-[#081C35] disabled:opacity-60"><Save className="h-4 w-4" />{busy === "save" ? "SAVING..." : "SAVE QUOTE"}</button></>}</aside>
    </div>
  </QuotePage>
}

function Line({ label, value, highlight, emphasized }: { label: string; value: string; highlight?: boolean; emphasized?: boolean }) {
  return <div className={`flex flex-wrap items-baseline gap-x-2 ${highlight ? "border-y border-white/10 py-3" : ""}`}><dt className={`font-semibold ${highlight ? "text-white" : "text-white/75"}`}>{label}:</dt><dd className={highlight ? "text-xl font-black text-[#C9A227]" : emphasized ? "text-base font-black text-white" : "font-bold text-white"}>{value}</dd></div>
}
