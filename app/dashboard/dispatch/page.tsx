"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Edit3,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
  Truck,
  X,
} from "lucide-react"
import { SidebarContent } from "@/components/dashboard/sidebar"
import { supabase } from "@/lib/supabase"

type ProspectStatus = "New" | "Contacted" | "Follow-up" | "Proposal Sent" | "Won" | "Lost"
type ProspectType = "Warehouse" | "Fleet" | "Carrier" | "Broker" | "Shipper" | "Trailer Yard" | "Tire Customer" | "Other"

type Prospect = {
  id: string
  user_id: string
  company: string
  contact_name: string | null
  phone: string | null
  email: string | null
  type: ProspectType
  status: ProspectStatus
  estimated_value: number | null
  next_follow_up: string | null
  address: string | null
  website: string | null
  notes: string | null
  last_touch: string | null
  created_at: string
  updated_at: string
}

type Activity = {
  id: string
  user_id: string
  prospect_id: string
  activity_type: string
  description: string | null
  created_at: string
}

type ProspectTask = {
  id: string
  user_id: string
  prospect_id: string
  title: string
  description: string | null
  priority: "Low" | "Medium" | "High"
  status: "Open" | "Completed"
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type ProspectForm = {
  company: string
  contact_name: string
  phone: string
  email: string
  type: ProspectType
  status: ProspectStatus
  estimated_value: string
  next_follow_up: string
  address: string
  website: string
  notes: string
  new_note: string
  last_touch: string
}

const statuses: ProspectStatus[] = ["New", "Contacted", "Follow-up", "Proposal Sent", "Won", "Lost"]
const types: ProspectType[] = ["Warehouse", "Fleet", "Carrier", "Broker", "Shipper", "Trailer Yard", "Tire Customer", "Other"]

const blankForm: ProspectForm = {
  company: "",
  contact_name: "",
  phone: "",
  email: "",
  type: "Fleet",
  status: "New",
  estimated_value: "",
  next_follow_up: "",
  address: "",
  website: "",
  notes: "",
  new_note: "",
  last_touch: "",
}

const statusStyles: Record<ProspectStatus, string> = {
  New: "bg-slate-100 text-slate-800 border-slate-200",
  Contacted: "bg-blue-100 text-blue-800 border-blue-200",
  "Follow-up": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Proposal Sent": "bg-orange-100 text-orange-800 border-orange-200",
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
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone
}

function phoneHref(phone: string | null) {
  if (!phone) return "#"
  const digits = phone.replace(/\D/g, "")
  return digits ? `tel:${digits}` : "#"
}

function websiteHref(website: string | null) {
  if (!website) return "#"
  const trimmed = website.trim()
  if (!trimmed) return "#"
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`
}

function makeHistoryEntry(note: string) {
  const stamp = new Date().toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  })
  return `${stamp} - ${note.trim()}`
}

function latestNote(notes: string | null) {
  if (!notes) return "No notes yet."
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean)
  return lines[lines.length - 1] || "No notes yet."
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

export default function DispatchHQPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "All">("All")
  const [typeFilter, setTypeFilter] = useState<ProspectType | "All">("All")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ProspectForm>(blankForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<ProspectTask[]>([])
  const [newActivityType, setNewActivityType] = useState("Called")
  const [newActivityDescription, setNewActivityDescription] = useState("")
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskPriority, setNewTaskPriority] = useState<"Low" | "Medium" | "High">("Medium")
  const [newTaskDueDate, setNewTaskDueDate] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function loadProspects() {
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
      setError("You must be signed in to view Dispatch HQ.")
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("gbgs_fleet_prospects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
      setProspects([])
      setLoading(false)
      return
    }

    const typedProspects = (data ?? []) as Prospect[]
    setProspects(typedProspects)
    setSelectedProspect((current) =>
      current ? typedProspects.find((prospect) => prospect.id === current.id) ?? null : null,
    )
    setLoading(false)
  }

  useEffect(() => {
    loadProspects()
  }, [])

  const filteredProspects = useMemo(() => {
    const q = search.toLowerCase().trim()

    return prospects.filter((prospect) => {
      const matchesSearch =
        !q ||
        prospect.company.toLowerCase().includes(q) ||
        (prospect.contact_name ?? "").toLowerCase().includes(q) ||
        (prospect.phone ?? "").toLowerCase().includes(q) ||
        (prospect.email ?? "").toLowerCase().includes(q) ||
        (prospect.address ?? "").toLowerCase().includes(q) ||
        (prospect.notes ?? "").toLowerCase().includes(q)

      const matchesStatus = statusFilter === "All" || prospect.status === statusFilter
      const matchesType = typeFilter === "All" || prospect.type === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [prospects, search, statusFilter, typeFilter])

  const totalValue = prospects.reduce((sum, p) => sum + Number(p.estimated_value ?? 0), 0)
  const wonValue = prospects
    .filter((p) => p.status === "Won")
    .reduce((sum, p) => sum + Number(p.estimated_value ?? 0), 0)
  const followUps = prospects.filter((p) => p.status === "Follow-up" || Boolean(p.next_follow_up)).length
  const wonAccounts = prospects.filter((p) => p.status === "Won").length

  function updateForm(field: keyof ProspectForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openNewProspect() {
    setForm(blankForm)
    setEditingId(null)
    setSelectedProspect(null)
    setError("")
    setShowModal(true)
  }

  function openProfile(prospect: Prospect) {
    setSelectedProspect(prospect)
    setError("")
  }

  function closeProfile() {
    setSelectedProspect(null)
  }

  function startEdit(prospect: Prospect) {
    setForm({
      company: prospect.company ?? "",
      contact_name: prospect.contact_name ?? "",
      phone: prospect.phone ?? "",
      email: prospect.email ?? "",
      type: prospect.type,
      status: prospect.status,
      estimated_value: prospect.estimated_value ? String(prospect.estimated_value) : "",
      next_follow_up: prospect.next_follow_up ?? "",
      address: prospect.address ?? "",
      website: prospect.website ?? "",
      notes: prospect.notes ?? "",
      new_note: "",
      last_touch: prospect.last_touch ?? "",
    })
    setEditingId(prospect.id)
    setSelectedProspect(null)
    setError("")
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(blankForm)
    setError("")
  }

  async function saveProspect() {
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
      setError("You must be signed in to save prospects.")
      setSaving(false)
      return
    }

    const historyNote = cleanText(form.new_note)
    const nextNotes = historyNote
      ? [form.notes.trim(), makeHistoryEntry(historyNote)].filter(Boolean).join("\n")
      : cleanText(form.notes)

    const payload = {
      company,
      contact_name: cleanText(form.contact_name),
      phone: cleanText(form.phone),
      email: cleanText(form.email),
      type: form.type,
      status: form.status,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : 0,
      next_follow_up: cleanText(form.next_follow_up),
      address: cleanText(form.address),
      website: cleanText(form.website),
      notes: nextNotes,
      last_touch: cleanText(form.last_touch),
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const oldProspect = prospects.find((p) => p.id === editingId)
      const { data, error } = await supabase
        .from("gbgs_fleet_prospects")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .single()

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }

      if (data) {
        if (oldProspect && oldProspect.status !== form.status) {
          await logActivity(editingId, "Status Changed", `${oldProspect.status} → ${form.status}`)
        }
        if (historyNote) {
          await logActivity(editingId, "Note Added", historyNote)
        }
      }
    } else {
      const { data, error } = await supabase.from("gbgs_fleet_prospects").insert({
        ...payload,
        user_id: user.id,
      }).select("*").single()

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }

      if (data) {
        await logActivity((data as Prospect).id, "Created Prospect", company)
        if (historyNote) await logActivity((data as Prospect).id, "Note Added", historyNote)
        if (form.next_follow_up) await logActivity((data as Prospect).id, "Follow-up Scheduled", form.next_follow_up)
      }
    }

    setSaving(false)
    closeModal()
    loadProspects()
  }

  async function deleteProspect(id: string) {
    const confirmed = window.confirm("Delete this prospect?")
    if (!confirmed) return

    const previous = prospects
    setProspects((prev) => prev.filter((prospect) => prospect.id !== id))
    setSelectedProspect((current) => (current?.id === id ? null : current))

    const { error } = await supabase.from("gbgs_fleet_prospects").delete().eq("id", id)

    if (error) {
      setProspects(previous)
      setError(error.message)
    }
  }


  async function loadProspectDetails(prospectId: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return

    const [{ data: activityData, error: activityError }, { data: taskData, error: taskError }] = await Promise.all([
      supabase
        .from("gbgs_prospect_activity")
        .select("*")
        .eq("user_id", user.id)
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("gbgs_prospect_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }),
    ])

    if (activityError) setError(activityError.message)
    else setActivities((activityData ?? []) as Activity[])

    if (taskError) setError(taskError.message)
    else setTasks((taskData ?? []) as ProspectTask[])
  }

  useEffect(() => {
    if (selectedProspect?.id) {
      loadProspectDetails(selectedProspect.id)
    } else {
      setActivities([])
      setTasks([])
    }
  }, [selectedProspect?.id])

  async function logActivity(prospectId: string, activity_type: string, description?: string | null) {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return

    const { data, error } = await supabase
      .from("gbgs_prospect_activity")
      .insert({
        user_id: user.id,
        prospect_id: prospectId,
        activity_type,
        description: cleanText(description ?? ""),
      })
      .select("*")
      .single()

    if (error) {
      setError(error.message)
      return
    }

    if (data) setActivities((prev) => [data as Activity, ...prev])
  }

  async function addManualActivity() {
    if (!selectedProspect) return
    if (!newActivityDescription.trim()) {
      setError("Add an activity note first.")
      return
    }
    await logActivity(selectedProspect.id, newActivityType, newActivityDescription)
    setNewActivityDescription("")
  }

  async function addTask() {
    if (!selectedProspect) return
    if (!newTaskTitle.trim()) {
      setError("Add a task title first.")
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return

    const { data, error } = await supabase
      .from("gbgs_prospect_tasks")
      .insert({
        user_id: user.id,
        prospect_id: selectedProspect.id,
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        due_date: cleanText(newTaskDueDate),
        status: "Open",
      })
      .select("*")
      .single()

    if (error) {
      setError(error.message)
      return
    }

    if (data) {
      setTasks((prev) => [data as ProspectTask, ...prev])
      await logActivity(selectedProspect.id, "Task Added", newTaskTitle.trim())
    }

    setNewTaskTitle("")
    setNewTaskDueDate("")
    setNewTaskPriority("Medium")
  }

  async function toggleTask(task: ProspectTask) {
    const nextStatus = task.status === "Completed" ? "Open" : "Completed"
    const completedAt = nextStatus === "Completed" ? new Date().toISOString() : null

    setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: nextStatus, completed_at: completedAt } : item))

    const { error } = await supabase
      .from("gbgs_prospect_tasks")
      .update({ status: nextStatus, completed_at: completedAt, updated_at: new Date().toISOString() })
      .eq("id", task.id)

    if (error) {
      setError(error.message)
      loadProspectDetails(task.prospect_id)
      return
    }

    if (nextStatus === "Completed") await logActivity(task.prospect_id, "Task Completed", task.title)
  }

  async function deleteTask(task: ProspectTask) {
    const confirmed = window.confirm("Delete this task?")
    if (!confirmed) return

    setTasks((prev) => prev.filter((item) => item.id !== task.id))
    const { error } = await supabase.from("gbgs_prospect_tasks").delete().eq("id", task.id)
    if (error) {
      setError(error.message)
      loadProspectDetails(task.prospect_id)
    }
  }


  async function quickLogActivity(activityType: string, description: string) {
    if (!selectedProspect) return

    await logActivity(selectedProspect.id, activityType, description)
  }

  async function quickUpdateStatus(nextStatus: ProspectStatus, activityLabel: string) {
    if (!selectedProspect) return

    const previousStatus = selectedProspect.status

    setSelectedProspect((prev) => (prev ? { ...prev, status: nextStatus } : prev))
    setProspects((prev) =>
      prev.map((prospect) =>
        prospect.id === selectedProspect.id ? { ...prospect, status: nextStatus } : prospect,
      ),
    )

    const { error } = await supabase
      .from("gbgs_fleet_prospects")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", selectedProspect.id)

    if (error) {
      setError(error.message)
      setSelectedProspect((prev) => (prev ? { ...prev, status: previousStatus } : prev))
      loadProspects()
      return
    }

    await logActivity(selectedProspect.id, "Status Changed", activityLabel)
    loadProspects()
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
                  <Truck className="h-6 w-6 text-[#C9A227]" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-[#C9A227]">Dispatch HQ</p>
                  <h1 className="text-3xl font-bold">Fleet Prospect CRM</h1>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
                Track brokers, warehouses, fleets, shippers, carriers, follow-ups, account value, and relationship notes in one place.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewProspect}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#C9A227] px-5 text-sm font-bold text-[#081C35] hover:bg-[#D8B84A]"
            >
              <Plus className="h-4 w-4" />
              New Prospect
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Building2} label="Prospects" value={String(prospects.length)} sub="Total companies tracked" />
            <KpiCard icon={CalendarDays} label="Follow Ups" value={String(followUps)} sub="Needs next touch" />
            <KpiCard icon={CheckCircle2} label="Won Accounts" value={String(wonAccounts)} sub={`${money(wonValue)} monthly target`} />
            <KpiCard icon={DollarSign} label="Pipeline Value" value={money(totalValue)} sub="Potential monthly revenue" />
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-[#081C35]" />
                  <h2 className="text-lg font-bold text-[#081C35]">Prospect Pipeline</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Focus on accounts that can turn into $2K, $5K, and $10K/month wins.</p>
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
                  onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | "All")}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-[#081C35] outline-none focus:border-[#C9A227]"
                >
                  <option value="All">All Statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ProspectType | "All")}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-[#081C35] outline-none focus:border-[#C9A227]"
                >
                  <option value="All">All Types</option>
                  {types.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1120px] border-separate border-spacing-y-3 text-left">
                <thead>
                  <tr className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3">Company</th>
                    <th className="px-3">Contact</th>
                    <th className="px-3">Type</th>
                    <th className="px-3">Status</th>
                    <th className="px-3">Value</th>
                    <th className="px-3">Next Follow-up</th>
                    <th className="px-3">Last Touch</th>
                    <th className="px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProspects.map((prospect) => (
                    <tr
                      key={prospect.id}
                      onClick={() => openProfile(prospect)}
                      className="cursor-pointer rounded-xl bg-muted align-top text-sm text-[#081C35] transition-colors hover:bg-[#E9EEF5]"
                    >
                      <td className="rounded-l-xl px-3 py-4">
                        <p className="text-base font-extrabold leading-tight text-[#081C35]">{prospect.company}</p>
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground line-clamp-2">{latestNote(prospect.notes)}</p>
                        {prospect.address ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {prospect.address}
                          </p>
                        ) : null}
                        {prospect.website ? (
                          <a
                            href={websiteHref(prospect.website)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 flex w-fit items-center gap-1 text-xs font-semibold text-[#C9A227] hover:underline"
                          >
                            <Globe className="h-3 w-3" />
                            Visit Website
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold">{prospect.contact_name || "—"}</p>
                        {prospect.phone ? (
                          <a
                            href={phoneHref(prospect.phone)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-[#081C35] hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {formatPhone(prospect.phone)}
                          </a>
                        ) : (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />No phone</p>
                        )}
                        {prospect.email ? (
                          <a
                            href={`mailto:${prospect.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-[#081C35] hover:underline"
                          >
                            <Mail className="h-3 w-3" />
                            {prospect.email}
                          </a>
                        ) : (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />No email</p>
                        )}
                      </td>
                      <td className="px-3 py-4 font-semibold">{prospect.type}</td>
                      <td className="px-3 py-4">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[prospect.status]}`}>{prospect.status}</span>
                      </td>
                      <td className="px-3 py-4 font-bold text-[#081C35]">{money(Number(prospect.estimated_value ?? 0))}</td>
                      <td className="px-3 py-4 font-semibold">{prospect.next_follow_up || "—"}</td>
                      <td className="px-3 py-4 text-muted-foreground">{prospect.last_touch || "—"}</td>
                      <td className="rounded-r-xl px-3 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(prospect)
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-[#081C35]"
                            aria-label="Edit prospect"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteProspect(prospect.id)
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-red-600"
                            aria-label="Delete prospect"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && filteredProspects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-semibold text-[#081C35]">No prospects match your filters.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Click New Prospect to add your first fleet, warehouse, broker, or shipper.</p>
                </div>
              ) : null}

              {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading prospects...</p> : null}
            </div>
          </section>
        </div>
      </main>

      {selectedProspect ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#C9A227]">Company Profile</p>
                <h3 className="mt-1 text-3xl font-black text-[#081C35]">{selectedProspect.company}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[selectedProspect.status]}`}>
                    {selectedProspect.status}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-[#081C35]">
                    {selectedProspect.type}
                  </span>
                  <span className="rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-1 text-xs font-bold text-[#7A6115]">
                    {money(Number(selectedProspect.estimated_value ?? 0))}/month
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(selectedProspect)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#081C35] px-4 text-sm font-bold text-white hover:bg-[#0D2C4F]"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={closeProfile}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-[#081C35]"
                  aria-label="Close company profile"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <section className="rounded-2xl border border-border bg-background p-4 lg:col-span-2">
                <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Account Details</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contact</p>
                    <p className="mt-1 text-sm font-bold text-[#081C35]">{selectedProspect.contact_name || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Next Follow-up</p>
                    <p className="mt-1 text-sm font-bold text-[#081C35]">{selectedProspect.next_follow_up || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Phone</p>
                    {selectedProspect.phone ? (
                      <a href={phoneHref(selectedProspect.phone)} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#081C35] hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {formatPhone(selectedProspect.phone)}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm font-bold text-muted-foreground">—</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Email</p>
                    {selectedProspect.email ? (
                      <a href={`mailto:${selectedProspect.email}`} className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-[#081C35] hover:underline">
                        <Mail className="h-3.5 w-3.5" />
                        {selectedProspect.email}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm font-bold text-muted-foreground">—</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-muted p-3 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Address</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#081C35]">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedProspect.address || "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted p-3 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Website</p>
                    {selectedProspect.website ? (
                      <a
                        href={websiteHref(selectedProspect.website)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#C9A227] hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Visit Website
                      </a>
                    ) : (
                      <p className="mt-1 text-sm font-bold text-muted-foreground">—</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4">
                <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Sales Snapshot</h4>
                <div className="mt-4 flex flex-col gap-3">
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Potential Monthly Value</p>
                    <p className="mt-1 text-2xl font-black text-[#081C35]">{money(Number(selectedProspect.estimated_value ?? 0))}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Last Touch</p>
                    <p className="mt-1 text-sm font-bold text-[#081C35]">{selectedProspect.last_touch || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Created</p>
                    <p className="mt-1 text-sm font-bold text-[#081C35]">{new Date(selectedProspect.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Quick Actions</h4>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">Log common sales actions without opening the edit form.</p>
                </div>
                <span className="rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-1 text-xs font-bold text-[#7A6115]">CRM Tools</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <button
                  type="button"
                  onClick={() => quickLogActivity("Called", "Phone conversation logged")}
                  className="rounded-lg bg-[#081C35] px-3 py-3 text-sm font-bold text-white hover:bg-[#0D2C4F]"
                >
                  📞 Log Call
                </button>
                <button
                  type="button"
                  onClick={() => quickLogActivity("Left Voicemail", "Left voicemail")}
                  className="rounded-lg bg-[#C9A227] px-3 py-3 text-sm font-bold text-[#081C35] hover:bg-[#D8B84A]"
                >
                  📬 Voicemail
                </button>
                <button
                  type="button"
                  onClick={() => quickLogActivity("Sent Email", "Email sent")}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-sm font-bold text-[#081C35] hover:bg-muted"
                >
                  ✉️ Email
                </button>
                <button
                  type="button"
                  onClick={() => quickLogActivity("Quote Sent", "Pricing / quote sent")}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-sm font-bold text-[#081C35] hover:bg-muted"
                >
                  💲 Quote
                </button>
                <button
                  type="button"
                  onClick={() => quickUpdateStatus("Won", "Account Won")}
                  className="rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-700"
                >
                  🏆 Won
                </button>
                <button
                  type="button"
                  onClick={() => quickUpdateStatus("Lost", "Account Lost")}
                  className="rounded-lg bg-red-600 px-3 py-3 text-sm font-bold text-white hover:bg-red-700"
                >
                  ❌ Lost
                </button>
              </div>
            </section>


            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Activity Timeline</h4>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{activities.length}</span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                  <select
                    value={newActivityType}
                    onChange={(e) => setNewActivityType(e.target.value)}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-[#081C35] outline-none focus:border-[#C9A227]"
                  >
                    <option>Called</option>
                    <option>Left Voicemail</option>
                    <option>Sent Email</option>
                    <option>Sent Pricing</option>
                    <option>Visited</option>
                    <option>Meeting</option>
                    <option>Quote Sent</option>
                    <option>Other</option>
                  </select>
                  <input
                    value={newActivityDescription}
                    onChange={(e) => setNewActivityDescription(e.target.value)}
                    placeholder="What happened?"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-[#C9A227]"
                  />
                  <button
                    type="button"
                    onClick={addManualActivity}
                    className="h-10 rounded-lg bg-[#081C35] px-4 text-sm font-bold text-white hover:bg-[#0D2C4F]"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4 max-h-80 overflow-y-auto rounded-xl bg-muted p-3">
                  {activities.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {activities.map((activity) => (
                        <div key={activity.id} className="flex gap-3 rounded-lg bg-card px-3 py-2.5">
                          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#C9A227]" />
                          <div>
                            <p className="text-sm font-bold text-[#081C35]">{activity.activity_type}</p>
                            {activity.description ? <p className="mt-0.5 text-sm text-muted-foreground">{activity.description}</p> : null}
                            <p className="mt-1 text-xs text-muted-foreground">{new Date(activity.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No activity logged yet.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Tasks</h4>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{tasks.filter((task) => task.status !== "Completed").length} open</span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_120px_145px_auto]">
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="New task, e.g. Send pricing"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-[#C9A227]"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as "Low" | "Medium" | "High")}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-[#081C35] outline-none focus:border-[#C9A227]"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-[#C9A227]"
                  />
                  <button
                    type="button"
                    onClick={addTask}
                    className="h-10 rounded-lg bg-[#081C35] px-4 text-sm font-bold text-white hover:bg-[#0D2C4F]"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4 max-h-80 overflow-y-auto rounded-xl bg-muted p-3">
                  {tasks.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {tasks.map((task) => {
                        const overdue = task.due_date && task.status !== "Completed" && task.due_date < new Date().toISOString().slice(0, 10)
                        return (
                          <div key={task.id} className="flex items-start gap-3 rounded-lg bg-card px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={task.status === "Completed"}
                              onChange={() => toggleTask(task)}
                              className="mt-1 h-4 w-4"
                            />
                            <div className="min-w-0 flex-1">
                              <p className={task.status === "Completed" ? "text-sm font-bold text-muted-foreground line-through" : "text-sm font-bold text-[#081C35]"}>{task.title}</p>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
                                <span className={task.priority === "High" ? "text-red-600" : task.priority === "Medium" ? "text-[#C9A227]" : "text-green-700"}>{task.priority}</span>
                                {task.due_date ? <span className={overdue ? "text-red-600" : "text-muted-foreground"}>{overdue ? "Overdue: " : "Due: "}{task.due_date}</span> : null}
                                <span className="text-muted-foreground">{task.status}</span>
                              </div>
                            </div>
                            <button type="button" onClick={() => deleteTask(task)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tasks yet.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4 lg:col-span-2">
                <h4 className="text-sm font-black uppercase tracking-wide text-[#081C35]">Notes History</h4>
                <div className="mt-4 max-h-72 overflow-y-auto rounded-xl bg-muted p-3">
                  {selectedProspect.notes ? (
                    <div className="flex flex-col gap-3">
                      {selectedProspect.notes.split("\n").filter(Boolean).reverse().map((note, index) => (
                        <div key={`${selectedProspect.id}-note-${index}`} className="rounded-lg bg-card px-3 py-2 text-sm leading-relaxed text-[#081C35]">
                          {note}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes have been added yet.</p>
                  )}
                </div>
              </section>
            </div>          </div>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#C9A227]">
                  {editingId ? "Edit Prospect" : "New Prospect"}
                </p>
                <h3 className="text-2xl font-bold text-[#081C35]">Fleet Account Record</h3>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-[#081C35]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Company
                  <input value={form.company} onChange={(e) => updateForm("company", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Contact Person
                  <input value={form.contact_name} onChange={(e) => updateForm("contact_name", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Phone
                  <input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Email
                  <input value={form.email} onChange={(e) => updateForm("email", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Website
                  <input value={form.website} onChange={(e) => updateForm("website", e.target.value)} placeholder="company.com" className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Type
                  <select value={form.type} onChange={(e) => updateForm("type", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]">
                    {types.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Status
                  <select value={form.status} onChange={(e) => updateForm("status", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]">
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Value / Month
                  <input type="number" value={form.estimated_value} onChange={(e) => updateForm("estimated_value", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Follow-up
                  <input type="date" value={form.next_follow_up} onChange={(e) => updateForm("next_follow_up", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Address
                <input value={form.address} onChange={(e) => updateForm("address", e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Last Touch
                <input value={form.last_touch} onChange={(e) => updateForm("last_touch", e.target.value)} placeholder="Called, emailed, visited, left voicemail..." className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227]" />
              </label>

              {form.notes ? (
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">Notes History
                  <textarea value={form.notes} readOnly rows={5} className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm font-normal leading-relaxed text-muted-foreground outline-none" />
                </label>
              ) : null}

              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                {editingId ? "Add New Note" : "Initial Note"}
                <textarea
                  value={form.new_note}
                  onChange={(e) => updateForm("new_note", e.target.value)}
                  rows={4}
                  placeholder="Type the newest conversation, quote request, follow-up, or next action..."
                  className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-[#C9A227]"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} className="h-11 rounded-lg border border-border px-5 text-sm font-semibold text-[#081C35] hover:bg-muted">Cancel</button>
              <button type="button" onClick={saveProspect} disabled={saving} className="h-11 rounded-lg bg-[#081C35] px-5 text-sm font-semibold text-white hover:bg-[#0D2C4F] disabled:opacity-60">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Prospect"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
