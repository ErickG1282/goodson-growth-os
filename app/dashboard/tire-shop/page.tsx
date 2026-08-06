"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react"
import { SidebarContent } from "@/components/dashboard/sidebar"
import { supabase } from "@/lib/supabase"

type LeadStatus = "New" | "Contacted" | "Follow-up" | "Quote Sent" | "Won" | "Lost"
type CustomerType = "Fleet" | "Owner Operator" | "Carrier" | "Warehouse" | "Trailer Yard" | "Other"
type ServiceInterest = "Tire Quote" | "Roadside Service" | "Fleet Account" | "Price Check" | "Repeat Customer"

type TireLead = {
  id: string
  user_id: string
  company: string
  contact_name: string | null
  phone: string | null
  email: string | null
  customer_type: CustomerType
  status: LeadStatus
  service_interest: ServiceInterest
  fleet_size: number | null
  trailer_count: number | null
  current_vendor: string | null
  current_tire_brand: string | null
  decision_maker: string | null
  closing_probability: number | null
  estimated_annual_value: number | null
  estimated_monthly_value: number | null
  next_follow_up: string | null
  address: string | null
  tire_need: string | null
  last_touch: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type LeadForm = {
  company: string
  contact_name: string
  phone: string
  email: string
  customer_type: CustomerType
  status: LeadStatus
  service_interest: ServiceInterest
  fleet_size: string
  trailer_count: string
  current_vendor: string
  current_tire_brand: string
  decision_maker: string
  closing_probability: string
  estimated_annual_value: string
  estimated_monthly_value: string
  next_follow_up: string
  address: string
  tire_need: string
  last_touch: string
  notes: string
}

const statuses: LeadStatus[] = ["New", "Contacted", "Follow-up", "Quote Sent", "Won", "Lost"]
const customerTypes: CustomerType[] = ["Fleet", "Owner Operator", "Carrier", "Warehouse", "Trailer Yard", "Other"]
const serviceInterests: ServiceInterest[] = ["Tire Quote", "Roadside Service", "Fleet Account", "Price Check", "Repeat Customer"]

const blankForm: LeadForm = {
  company: "",
  contact_name: "",
  phone: "",
  email: "",
  customer_type: "Fleet",
  status: "New",
  service_interest: "Tire Quote",
  fleet_size: "",
  trailer_count: "",
  current_vendor: "",
  current_tire_brand: "",
  decision_maker: "",
  closing_probability: "",
  estimated_annual_value: "",
  estimated_monthly_value: "",
  next_follow_up: "",
  address: "",
  tire_need: "",
  last_touch: "",
  notes: "",
}

const statusStyles: Record<LeadStatus, string> = {
  New: "bg-slate-100 text-slate-800 border-slate-200",
  Contacted: "bg-blue-100 text-blue-800 border-blue-200",
  "Follow-up": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Quote Sent": "bg-orange-100 text-orange-800 border-orange-200",
  Won: "bg-green-100 text-green-800 border-green-200",
  Lost: "bg-red-100 text-red-800 border-red-200",
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function cleanText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatPhone(phone: string | null) {
  if (!phone) return "No phone"
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  return phone
}

function phoneHref(phone: string | null) {
  if (!phone) return "#"
  const digits = phone.replace(/\D/g, "")
  return digits ? `tel:${digits}` : "#"
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[#081C35]">{value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-xl bg-[#081C35] p-3 text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function TireShopHQPage() {
  const [leads, setLeads] = useState<TireLead[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "All">("All")
  const [typeFilter, setTypeFilter] = useState<CustomerType | "All">("All")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<LeadForm>(blankForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<TireLead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function loadLeads() {
    setLoading(true)
    setError("")

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (sessionError) {
      setError(sessionError.message)
      setLoading(false)
      return
    }

    if (!user) {
      setError("You must be signed in to view Tire Shop HQ.")
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("gbgs_tire_sales_leads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
      setLeads([])
      setLoading(false)
      return
    }

    const typedLeads = (data ?? []) as TireLead[]
    setLeads(typedLeads)
    setSelectedLead((current) => (current ? typedLeads.find((lead) => lead.id === current.id) ?? null : null))
    setLoading(false)
  }

  useEffect(() => {
    loadLeads()
  }, [])

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim()

    return leads.filter((lead) => {
      const matchesSearch =
        !q ||
        lead.company.toLowerCase().includes(q) ||
        (lead.contact_name ?? "").toLowerCase().includes(q) ||
        (lead.phone ?? "").toLowerCase().includes(q) ||
        (lead.email ?? "").toLowerCase().includes(q) ||
        (lead.address ?? "").toLowerCase().includes(q) ||
        (lead.tire_need ?? "").toLowerCase().includes(q) ||
        (lead.current_vendor ?? "").toLowerCase().includes(q) ||
        (lead.current_tire_brand ?? "").toLowerCase().includes(q) ||
        (lead.decision_maker ?? "").toLowerCase().includes(q) ||
        (lead.notes ?? "").toLowerCase().includes(q)

      const matchesStatus = statusFilter === "All" || lead.status === statusFilter
      const matchesType = typeFilter === "All" || lead.customer_type === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [leads, search, statusFilter, typeFilter])

  const activePipeline = leads
    .filter((lead) => lead.status !== "Lost")
    .reduce((sum, lead) => sum + Number(lead.estimated_monthly_value ?? 0), 0)
  const wonValue = leads
    .filter((lead) => lead.status === "Won")
    .reduce((sum, lead) => sum + Number(lead.estimated_monthly_value ?? 0), 0)
  const followUps = leads.filter((lead) => lead.status === "Follow-up" || Boolean(lead.next_follow_up)).length
  const quoteCount = leads.filter((lead) => lead.status === "Quote Sent").length

  function updateForm(field: keyof LeadForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openNewLead() {
    setForm(blankForm)
    setEditingId(null)
    setSelectedLead(null)
    setError("")
    setShowModal(true)
  }

  function startEdit(lead: TireLead) {
    setForm({
      company: lead.company ?? "",
      contact_name: lead.contact_name ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      customer_type: lead.customer_type,
      status: lead.status,
      service_interest: lead.service_interest,
      fleet_size: lead.fleet_size ? String(lead.fleet_size) : "",
      trailer_count: lead.trailer_count ? String(lead.trailer_count) : "",
      current_vendor: lead.current_vendor ?? "",
      current_tire_brand: lead.current_tire_brand ?? "",
      decision_maker: lead.decision_maker ?? "",
      closing_probability: lead.closing_probability ? String(lead.closing_probability) : "",
      estimated_annual_value: lead.estimated_annual_value ? String(lead.estimated_annual_value) : "",
      estimated_monthly_value: lead.estimated_monthly_value ? String(lead.estimated_monthly_value) : "",
      next_follow_up: lead.next_follow_up ?? "",
      address: lead.address ?? "",
      tire_need: lead.tire_need ?? "",
      last_touch: lead.last_touch ?? "",
      notes: lead.notes ?? "",
    })
    setEditingId(lead.id)
    setSelectedLead(null)
    setError("")
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(blankForm)
    setError("")
  }

  async function saveLead() {
    const company = form.company.trim()
    if (!company) {
      setError("Company name is required.")
      return
    }

    setSaving(true)
    setError("")

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (sessionError) {
      setError(sessionError.message)
      setSaving(false)
      return
    }

    if (!user) {
      setError("You must be signed in to save tire sales leads.")
      setSaving(false)
      return
    }

    const payload = {
      company,
      contact_name: cleanText(form.contact_name),
      phone: cleanText(form.phone),
      email: cleanText(form.email),
      customer_type: form.customer_type,
      status: form.status,
      service_interest: form.service_interest,
      fleet_size: form.fleet_size ? Number(form.fleet_size) : 0,
      trailer_count: form.trailer_count ? Number(form.trailer_count) : 0,
      current_vendor: cleanText(form.current_vendor),
      current_tire_brand: cleanText(form.current_tire_brand),
      decision_maker: cleanText(form.decision_maker),
      closing_probability: form.closing_probability ? Number(form.closing_probability) : 0,
      estimated_annual_value: form.estimated_annual_value ? Number(form.estimated_annual_value) : 0,
      estimated_monthly_value: form.estimated_monthly_value ? Number(form.estimated_monthly_value) : 0,
      next_follow_up: cleanText(form.next_follow_up),
      address: cleanText(form.address),
      tire_need: cleanText(form.tire_need),
      last_touch: cleanText(form.last_touch),
      notes: cleanText(form.notes),
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const { error } = await supabase.from("gbgs_tire_sales_leads").update(payload).eq("id", editingId)
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from("gbgs_tire_sales_leads").insert({ ...payload, user_id: user.id })
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    }

    // Dashboard calendar sync
if (form.next_follow_up) {
  const { error: calendarError } = await supabase
    .from("gbgs_calendar_events")
    .insert({
      user_id: user.id,
      title: `Tire Follow-up: ${company}`,
      event_date: form.next_follow_up,
      category: "Tire Shop",
    })

  if (calendarError) {
    console.error("Tire Shop calendar sync failed:", calendarError)
    setError(`Lead saved, but calendar sync failed: ${calendarError.message}`)
  }
}

    setSaving(false)
    closeModal()
    loadLeads()
  }

  async function deleteLead(id: string) {
    const confirmed = window.confirm("Delete this tire sales lead?")
    if (!confirmed) return

    const previous = leads
    setLeads((prev) => prev.filter((lead) => lead.id !== id))
    setSelectedLead((current) => (current?.id === id ? null : current))

    const { error } = await supabase.from("gbgs_tire_sales_leads").delete().eq("id", id)
    if (error) {
      setLeads(previous)
      setError(error.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#F1F4F8]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      <main className="min-h-screen p-4 sm:p-6 lg:pl-[17.5rem]">
        <div className="flex max-w-7xl flex-col gap-6">
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#081C35] p-6 text-white shadow-[0_20px_60px_-30px_rgba(8,28,53,0.45)] sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/10 p-3">
                  <Wrench className="h-6 w-6 text-[#C9A227]" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-[#C9A227]">Tire Shop HQ</p>
                  <h1 className="text-3xl font-bold">Sales Pipeline</h1>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
                Track fleet customers, tire quote opportunities, roadside service leads, follow-ups, and potential monthly tire revenue.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewLead}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#C9A227] px-5 text-sm font-bold text-[#081C35] hover:bg-[#D8B84A]"
            >
              <Plus className="h-4 w-4" />
              New Tire Lead
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Building2} label="Tire Leads" value={String(leads.length)} sub="Sales opportunities tracked" />
            <KpiCard icon={CalendarDays} label="Follow Ups" value={String(followUps)} sub="Needs next sales touch" />
            <KpiCard icon={CheckCircle2} label="Quotes Sent" value={String(quoteCount)} sub={`${money(wonValue)} won monthly value`} />
            <KpiCard icon={DollarSign} label="Pipeline Value" value={money(activePipeline)} sub="Potential monthly tire revenue" />
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-[#081C35]" />
                  <h2 className="text-lg font-bold text-[#081C35]">Tire Sales Pipeline</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Focus on fleet accounts, quotes, follow-ups, and repeat tire buyers.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search company, contact, phone..."
                    className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227] sm:w-72"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "All")}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-[#081C35] outline-none focus:border-[#C9A227]"
                >
                  <option value="All">All Statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as CustomerType | "All")}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-[#081C35] outline-none focus:border-[#C9A227]"
                >
                  <option value="All">All Types</option>
                  {customerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1120px] border-separate border-spacing-y-3 text-left">
                <thead>
                  <tr className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3">Company</th>
                    <th className="px-3">Contact</th>
                    <th className="px-3">Need</th>
                    <th className="px-3">Status</th>
                    <th className="px-3">Value</th>
                    <th className="px-3">Next Follow-up</th>
                    <th className="px-3">Last Touch</th>
                    <th className="px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className="cursor-pointer rounded-xl bg-muted align-top text-sm text-[#081C35] transition-colors hover:bg-[#E9EEF5]"
                    >
                      <td className="rounded-l-xl px-3 py-4">
                        <p className="text-base font-extrabold leading-tight text-[#081C35]">{lead.company}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{lead.customer_type} · Tractors: {lead.fleet_size ?? 0} · Trailers: {lead.trailer_count ?? 0}</p>
                        {lead.current_vendor ? <p className="mt-1 text-xs text-muted-foreground">Vendor: {lead.current_vendor}</p> : null}
                        {lead.address ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {lead.address}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold">{lead.contact_name || "—"}</p>
                        {lead.phone ? (
                          <a href={phoneHref(lead.phone)} onClick={(e) => e.stopPropagation()} className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-[#081C35] hover:underline">
                            <Phone className="h-3 w-3" />
                            {formatPhone(lead.phone)}
                          </a>
                        ) : (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />No phone</p>
                        )}
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-[#081C35] hover:underline">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold">{lead.service_interest}</p>
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground line-clamp-2">{lead.tire_need || "No tire need listed."}</p>
                      </td>
                      <td className="px-3 py-4">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[lead.status]}`}>{lead.status}</span>
                      </td>
                      <td className="px-3 py-4 font-bold text-[#081C35]">{money(Number(lead.estimated_monthly_value ?? 0))}</td>
                      <td className="px-3 py-4 font-semibold">{lead.next_follow_up || "—"}</td>
                      <td className="px-3 py-4 text-muted-foreground">{lead.last_touch || "—"}</td>
                      <td className="rounded-r-xl px-3 py-4">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(lead) }} className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-[#081C35]" aria-label="Edit tire lead">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteLead(lead.id) }} className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-red-600" aria-label="Delete tire lead">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && filteredLeads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-semibold text-[#081C35]">No tire sales leads match your filters.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Click New Tire Lead to add a fleet, carrier, warehouse, or owner operator sales opportunity.</p>
                </div>
              ) : null}

              {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading tire sales leads...</p> : null}
            </div>
          </section>
        </div>
      </main>

      {selectedLead ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#C9A227]">Tire Sales Profile</p>
                <h3 className="mt-1 text-3xl font-black text-[#081C35]">{selectedLead.company}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[selectedLead.status]}`}>{selectedLead.status}</span>
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-[#081C35]">{selectedLead.customer_type}</span>
                  <span className="rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-1 text-xs font-bold text-[#7A6115]">{money(Number(selectedLead.estimated_monthly_value ?? 0))}/month</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => startEdit(selectedLead)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#081C35] px-4 text-sm font-bold text-white hover:bg-[#0D2C4F]">
                  <Edit3 className="h-4 w-4" />
                  Edit
                </button>
                <button type="button" onClick={() => setSelectedLead(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-[#081C35]" aria-label="Close tire sales profile">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <section className="rounded-2xl border border-border bg-background p-4 lg:col-span-2">
                <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Sales Details</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contact</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.contact_name || "—"}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Next Follow-up</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.next_follow_up || "—"}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Phone</p>{selectedLead.phone ? <a href={phoneHref(selectedLead.phone)} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#081C35] hover:underline"><Phone className="h-3.5 w-3.5" />{formatPhone(selectedLead.phone)}</a> : <p className="mt-1 text-sm font-bold text-muted-foreground">—</p>}</div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Email</p>{selectedLead.email ? <a href={`mailto:${selectedLead.email}`} className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-[#081C35] hover:underline"><Mail className="h-3.5 w-3.5" />{selectedLead.email}</a> : <p className="mt-1 text-sm font-bold text-muted-foreground">—</p>}</div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tractors / Trucks</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.fleet_size ?? 0}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Trailers</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.trailer_count ?? 0}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Decision Maker</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.decision_maker || "—"}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Service Interest</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.service_interest}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current Vendor</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.current_vendor || "—"}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current Tire Brand</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.current_tire_brand || "—"}</p></div>
                  <div className="rounded-xl bg-muted p-3 sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Address</p><p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#081C35]"><MapPin className="h-3.5 w-3.5" />{selectedLead.address || "—"}</p></div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4">
                <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Sales Snapshot</h4>
                <div className="mt-4 flex flex-col gap-3">
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Potential Monthly Value</p><p className="mt-1 text-2xl font-black text-[#081C35]">{money(Number(selectedLead.estimated_monthly_value ?? 0))}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Estimated Annual Value</p><p className="mt-1 text-lg font-black text-[#081C35]">{money(Number(selectedLead.estimated_annual_value ?? 0) || Number(selectedLead.estimated_monthly_value ?? 0) * 12)}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Probability</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.closing_probability ?? 0}%</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Last Touch</p><p className="mt-1 text-sm font-bold text-[#081C35]">{selectedLead.last_touch || "—"}</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Created</p><p className="mt-1 text-sm font-bold text-[#081C35]">{new Date(selectedLead.created_at).toLocaleDateString()}</p></div>
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-2xl border border-border bg-background p-4">
              <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Tire Need / Notes</h4>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tire Need</p><p className="mt-1 text-sm leading-relaxed text-[#081C35]">{selectedLead.tire_need || "No tire need listed."}</p></div>
                <div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Notes</p><p className="mt-1 text-sm leading-relaxed text-[#081C35]">{selectedLead.notes || "No notes yet."}</p></div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#C9A227]">{editingId ? "Edit Tire Lead" : "New Tire Lead"}</p>
                <h3 className="text-2xl font-bold text-[#081C35]">Fleet Tire Sales Record</h3>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-[#081C35]"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Company<input value={form.company} onChange={(e) => updateForm("company", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Contact Person<input value={form.contact_name} onChange={(e) => updateForm("contact_name", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Phone<input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Email<input value={form.email} onChange={(e) => updateForm("email", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Decision Maker<input value={form.decision_maker} onChange={(e) => updateForm("decision_maker", e.target.value)} placeholder="Owner, fleet manager, maintenance manager" className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Tractors / Trucks<input type="number" value={form.fleet_size} onChange={(e) => updateForm("fleet_size", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Trailers<input type="number" value={form.trailer_count} onChange={(e) => updateForm("trailer_count", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Current Vendor<input value={form.current_vendor} onChange={(e) => updateForm("current_vendor", e.target.value)} placeholder="Who sells them tires now?" className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Current Tire Brand<input value={form.current_tire_brand} onChange={(e) => updateForm("current_tire_brand", e.target.value)} placeholder="Michelin, Bridgestone, Double Coin..." className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Customer Type<select value={form.customer_type} onChange={(e) => updateForm("customer_type", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]">{customerTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Interest<select value={form.service_interest} onChange={(e) => updateForm("service_interest", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]">{serviceInterests.map((interest) => <option key={interest} value={interest}>{interest}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Status<select value={form.status} onChange={(e) => updateForm("status", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Value / Month<input type="number" value={form.estimated_monthly_value} onChange={(e) => updateForm("estimated_monthly_value", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Estimated Annual Value<input type="number" value={form.estimated_annual_value} onChange={(e) => updateForm("estimated_annual_value", e.target.value)} placeholder="Example: 120000" className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Probability of Closing %<input type="number" min="0" max="100" value={form.closing_probability} onChange={(e) => updateForm("closing_probability", e.target.value)} placeholder="Example: 50" className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Follow-up<input type="date" value={form.next_follow_up} onChange={(e) => updateForm("next_follow_up", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Last Touch<input value={form.last_touch} onChange={(e) => updateForm("last_touch", e.target.value)} placeholder="Called, quoted, texted, left voicemail..." className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Address<input value={form.address} onChange={(e) => updateForm("address", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Tire Need<textarea value={form.tire_need} onChange={(e) => updateForm("tire_need", e.target.value)} rows={3} placeholder="Example: Needs 11R22.5 drive tires, trailer tires, roadside quote, fleet pricing..." className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Notes<textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} rows={4} placeholder="Sales notes, objections, pricing request, decision maker info..." className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-[#C9A227]" /></label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} className="h-11 rounded-lg border border-border px-5 text-sm font-semibold text-[#081C35] hover:bg-muted">Cancel</button>
              <button type="button" onClick={saveLead} disabled={saving} className="h-11 rounded-lg bg-[#081C35] px-5 text-sm font-semibold text-white hover:bg-[#0D2C4F] disabled:opacity-60">{saving ? "Saving..." : editingId ? "Save Changes" : "Save Lead"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
