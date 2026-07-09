"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Church,
  Clock,
  Edit3,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { EditableText } from "@/components/dashboard/editable-text"
import { useDashboard } from "@/lib/dashboard-store"
import { supabase } from "@/lib/supabase"

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl bg-card p-6 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)]">
      {children}
    </div>
  )
}

function CardLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-[#C9A227] hover:underline"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </button>
  )
}

type CalendarEvent = {
  id: string
  user_id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  notes: string | null
  completed: boolean
  created_at: string
  updated_at: string
}

type DispatchTask = {
  id: string
  user_id: string
  prospect_id: string
  title: string
  priority: "Low" | "Medium" | "High"
  status: "Open" | "Completed"
  due_date: string | null
  created_at: string
}

type EventCategory = "Dispatch" | "Tire Shop" | "Miz Rita" | "Family" | "Personal" | "Health" | "Faith"
type EventPriority = "Low" | "Medium" | "High"
type EventRepeat = "None" | "Daily" | "Weekly" | "Monthly"
type EventReminder = "None" | "15 minutes" | "1 hour" | "1 day"

type EventMeta = {
  category: EventCategory
  priority: EventPriority
  repeat: EventRepeat
  reminder: EventReminder
}

type EventForm = EventMeta & {
  title: string
  event_date: string
  start_time: string
  end_time: string
  location: string
  notes: string
}

const defaultMeta: EventMeta = {
  category: "Personal",
  priority: "Medium",
  repeat: "None",
  reminder: "None",
}

function blankForm(date: string): EventForm {
  return {
    title: "",
    event_date: date,
    start_time: "",
    end_time: "",
    location: "",
    notes: "",
    ...defaultMeta,
  }
}

const categories: EventCategory[] = ["Dispatch", "Tire Shop", "Miz Rita", "Family", "Personal", "Health", "Faith"]
const priorities: EventPriority[] = ["Low", "Medium", "High"]
const repeats: EventRepeat[] = ["None", "Daily", "Weekly", "Monthly"]
const reminders: EventReminder[] = ["None", "15 minutes", "1 hour", "1 day"]

const categoryStyles: Record<EventCategory, string> = {
  Dispatch: "bg-blue-100 text-blue-800 border-blue-200",
  "Tire Shop": "bg-green-100 text-green-800 border-green-200",
  "Miz Rita": "bg-purple-100 text-purple-800 border-purple-200",
  Family: "bg-red-100 text-red-800 border-red-200",
  Personal: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Health: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Faith: "bg-[#C9A227]/15 text-[#7A6115] border-[#C9A227]/30",
}


const categoryDotStyles: Record<EventCategory, string> = {
  Dispatch: "bg-blue-700 border-blue-800",
  "Tire Shop": "bg-green-700 border-green-800",
  "Miz Rita": "bg-purple-700 border-purple-800",
  Family: "bg-red-700 border-red-800",
  Personal: "bg-orange-600 border-orange-700",
  Health: "bg-emerald-700 border-emerald-800",
  Faith: "bg-[#081C35] border-[#081C35]",
}

const priorityStyles: Record<EventPriority, string> = {
  Low: "text-muted-foreground",
  Medium: "text-[#C9A227]",
  High: "text-red-600",
}

const metaPrefix = "GBGS_META::"
const metaSeparator = "::GBGS_NOTES::"

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getTodayDate() {
  return formatDateInput(new Date())
}

function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return formatDateInput(date)
}

function addMonths(dateString: string, amount: number) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setMonth(date.getMonth() + amount)
  return formatDateInput(date)
}

function getWeekDates(selectedDate: string) {
  const date = new Date(`${selectedDate}T12:00:00`)
  const day = date.getDay()
  const sunday = new Date(date)
  sunday.setDate(date.getDate() - day)

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(sunday)
    current.setDate(sunday.getDate() + index)
    return formatDateInput(current)
  })
}

function getMonthDates(selectedDate: string) {
  const date = new Date(`${selectedDate}T12:00:00`)
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(start)
    current.setDate(start.getDate() + index)
    return formatDateInput(current)
  })
}

function cleanText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function packNotes(notes: string, meta: EventMeta) {
  return `${metaPrefix}${JSON.stringify(meta)}${metaSeparator}${notes.trim()}`
}

function unpackNotes(rawNotes: string | null): { notes: string; meta: EventMeta } {
  if (!rawNotes) return { notes: "", meta: defaultMeta }

  if (!rawNotes.startsWith(metaPrefix)) {
    return { notes: rawNotes, meta: defaultMeta }
  }

  try {
    const rest = rawNotes.slice(metaPrefix.length)
    const [metaJson, notes = ""] = rest.split(metaSeparator)
    const parsed = JSON.parse(metaJson) as Partial<EventMeta>

    return {
      notes,
      meta: {
        category: categories.includes(parsed.category as EventCategory) ? (parsed.category as EventCategory) : defaultMeta.category,
        priority: priorities.includes(parsed.priority as EventPriority) ? (parsed.priority as EventPriority) : defaultMeta.priority,
        repeat: repeats.includes(parsed.repeat as EventRepeat) ? (parsed.repeat as EventRepeat) : defaultMeta.repeat,
        reminder: reminders.includes(parsed.reminder as EventReminder) ? (parsed.reminder as EventReminder) : defaultMeta.reminder,
      },
    }
  } catch {
    return { notes: rawNotes, meta: defaultMeta }
  }
}

function eventMeta(event: CalendarEvent) {
  return unpackNotes(event.notes).meta
}

function eventDisplayNotes(event: CalendarEvent) {
  return unpackNotes(event.notes).notes
}

function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [monthEvents, setMonthEvents] = useState<CalendarEvent[]>([])
  const [dispatchTasks, setDispatchTasks] = useState<DispatchTask[]>([])
  const [selectedDate, setSelectedDate] = useState(getTodayDate())
  const [form, setForm] = useState<EventForm>(blankForm(getTodayDate()))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "All">("All")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const selectedDateLabel = useMemo(() => {
    const date = new Date(`${selectedDate}T12:00:00`)
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }, [selectedDate])

  const monthLabel = useMemo(() => {
    const date = new Date(`${selectedDate}T12:00:00`)
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }, [selectedDate])

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const monthDates = useMemo(() => getMonthDates(selectedDate), [selectedDate])

  const selectedDispatchTasks = useMemo(() => {
    return dispatchTasks.filter((task) => task.due_date === selectedDate && task.status !== "Completed")
  }, [dispatchTasks, selectedDate])

  const filteredEvents = useMemo(() => {
    if (categoryFilter === "All") return events
    return events.filter((event) => eventMeta(event).category === categoryFilter)
  }, [events, categoryFilter])

  const filteredDispatchTasks = useMemo(() => {
    if (categoryFilter === "All" || categoryFilter === "Dispatch") return selectedDispatchTasks
    return []
  }, [selectedDispatchTasks, categoryFilter])

  const totalDayItems = events.length + selectedDispatchTasks.length
  const totalFilteredItems = filteredEvents.length + filteredDispatchTasks.length

  const workloadLabel = useMemo(() => {
    if (totalDayItems >= 6) return "Heavy"
    if (totalDayItems >= 3) return "Moderate"
    if (totalDayItems >= 1) return "Light"
    return "Open"
  }, [totalDayItems])

  function updateForm(field: keyof EventForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openNewEvent() {
    setForm(blankForm(selectedDate))
    setEditingId(null)
    setError("")
    setShowModal(true)
  }

  function resetForm() {
    setForm(blankForm(selectedDate))
    setEditingId(null)
    setShowModal(false)
    setError("")
  }

  function startEdit(event: CalendarEvent) {
    const { notes, meta } = unpackNotes(event.notes)
    setForm({
      title: event.title ?? "",
      event_date: event.event_date,
      start_time: event.start_time ?? "",
      end_time: event.end_time ?? "",
      location: event.location ?? "",
      notes,
      ...meta,
    })
    setEditingId(event.id)
    setError("")
    setShowModal(true)
  }

  async function loadEvents() {
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
      setError("You must be signed in to view calendar events.")
      setLoading(false)
      return
    }

    const monthStart = monthDates[0]
    const monthEnd = monthDates[41]

    const { data, error } = await supabase
      .from("gbgs_calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .gte("event_date", monthStart)
      .lte("event_date", monthEnd)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      setError(error.message)
      setEvents([])
      setMonthEvents([])
      setDispatchTasks([])
      setLoading(false)
      return
    }

    const typedEvents = (data ?? []) as CalendarEvent[]
    setMonthEvents(typedEvents)
    setEvents(typedEvents.filter((event) => event.event_date === selectedDate))

    const { data: taskData, error: taskError } = await supabase
      .from("gbgs_prospect_tasks")
      .select("id,user_id,prospect_id,title,priority,status,due_date,created_at")
      .eq("user_id", user.id)
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .neq("status", "Completed")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false })

    if (taskError) {
      console.error(taskError)
      setDispatchTasks([])
    } else {
      setDispatchTasks((taskData ?? []) as DispatchTask[])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  async function saveEvent() {
    const title = form.title.trim()

    if (!title) {
      setError("Add an event title first.")
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
      setError("You must be signed in to save calendar events.")
      setSaving(false)
      return
    }

    const meta: EventMeta = {
      category: form.category,
      priority: form.priority,
      repeat: form.repeat,
      reminder: form.reminder,
    }

    const payload = {
      title,
      start_time: cleanText(form.start_time),
      end_time: cleanText(form.end_time),
      location: cleanText(form.location),
      notes: packNotes(form.notes, meta),
      event_date: form.event_date,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const { data, error } = await supabase
        .from("gbgs_calendar_events")
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
        const updatedEvent = data as CalendarEvent
        setSelectedDate(updatedEvent.event_date)
        setEvents((prev) => prev.map((event) => (event.id === editingId ? updatedEvent : event)))
        setMonthEvents((prev) => prev.map((event) => (event.id === editingId ? updatedEvent : event)))
      }
    } else {
      const { data, error } = await supabase
        .from("gbgs_calendar_events")
        .insert({
          ...payload,
          user_id: user.id,
          completed: false,
        })
        .select("*")
        .single()

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }

      if (data) {
        const newEvent = data as CalendarEvent
        setSelectedDate(newEvent.event_date)
        setEvents((prev) => (newEvent.event_date === selectedDate ? [...prev, newEvent] : prev))
        setMonthEvents((prev) => [...prev, newEvent])
      }
    }

    setSaving(false)
    resetForm()
    loadEvents()
  }

  async function toggleCompleted(event: CalendarEvent) {
    const nextCompleted = !event.completed

    setEvents((prev) =>
      prev.map((item) => (item.id === event.id ? { ...item, completed: nextCompleted } : item)),
    )
    setMonthEvents((prev) =>
      prev.map((item) => (item.id === event.id ? { ...item, completed: nextCompleted } : item)),
    )

    const { error } = await supabase
      .from("gbgs_calendar_events")
      .update({ completed: nextCompleted, updated_at: new Date().toISOString() })
      .eq("id", event.id)

    if (error) {
      setError(error.message)
      loadEvents()
    }
  }

  async function deleteEvent(id: string) {
    const confirmed = window.confirm("Delete this calendar event?")
    if (!confirmed) return

    setEvents((prev) => prev.filter((event) => event.id !== id))
    setMonthEvents((prev) => prev.filter((event) => event.id !== id))

    const { error } = await supabase.from("gbgs_calendar_events").delete().eq("id", id)

    if (error) {
      setError(error.message)
      loadEvents()
    }
  }

  const completedCount = events.filter((event) => event.completed).length
  const countForDate = (date: string) =>
    monthEvents.filter((event) => event.event_date === date).length +
    dispatchTasks.filter((task) => task.due_date === date && task.status !== "Completed").length

  const categoriesForDate = (date: string) => {
    const uniqueCategories = new Set<EventCategory>()
    monthEvents
      .filter((event) => event.event_date === date)
      .slice(0, 4)
      .forEach((event) => uniqueCategories.add(eventMeta(event).category))

    if (dispatchTasks.some((task) => task.due_date === date && task.status !== "Completed")) {
      uniqueCategories.add("Dispatch")
    }

    return Array.from(uniqueCategories).slice(0, 4)
  }
  const currentMonth = new Date(`${selectedDate}T12:00:00`).getMonth()

  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-[#081C35]" />
          <h3 className="text-base font-bold text-[#081C35]">Calendar</h3>
        </div>
        <button
          type="button"
          onClick={() => setSelectedDate(getTodayDate())}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-[#081C35] hover:bg-muted"
        >
          Today
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          aria-label="Previous day"
          className="rounded-lg border border-border p-2 text-[#081C35] hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-xl font-bold text-[#081C35]">{selectedDateLabel}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            {totalDayItems} item{totalDayItems === 1 ? "" : "s"} · {completedCount} complete
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          aria-label="Next day"
          className="rounded-lg border border-border p-2 text-[#081C35] hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Events</p>
          <p className="text-lg font-bold text-[#081C35]">{totalDayItems}</p>
        </div>
        <div className="rounded-xl bg-muted px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Done</p>
          <p className="text-lg font-bold text-[#081C35]">{completedCount}</p>
        </div>
        <div className="rounded-xl bg-muted px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Workload</p>
          <p className="text-lg font-bold text-[#081C35]">{workloadLabel}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2">
        <button
          type="button"
          onClick={() => setSelectedDate(addMonths(selectedDate, -1))}
          className="rounded-lg p-2 text-[#081C35] hover:bg-muted"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-[#081C35]">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
          className="rounded-lg p-2 text-[#081C35] hover:bg-muted"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted-foreground">
        {weekDates.map((date) => {
          const d = new Date(`${date}T12:00:00`)
          return <span key={date}>{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
        })}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {monthDates.map((date) => {
          const current = new Date(`${date}T12:00:00`)
          const isSelected = date === selectedDate
          const isCurrentMonth = current.getMonth() === currentMonth
          const count = countForDate(date)
          const dateCategories = categoriesForDate(date)

          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={
                isSelected
                  ? "min-h-11 rounded-lg bg-[#081C35] px-1 py-1 text-center text-white"
                  : isCurrentMonth
                    ? "min-h-11 rounded-lg border border-border px-1 py-1 text-center text-[#081C35] hover:bg-muted"
                    : "min-h-11 rounded-lg border border-border px-1 py-1 text-center text-muted-foreground/60 hover:bg-muted"
              }
            >
              <span className="block text-xs font-bold">{current.getDate()}</span>
              {count > 0 ? (
                <span className="mt-1 flex items-center justify-center gap-0.5">
                  {dateCategories.map((category) => (
                    <span
                      key={category}
                      className={`block h-2.5 w-2.5 rounded-full border ${categoryDotStyles[category]}`}
                    />
                  ))}
                </span>
              ) : (
                <span className="mx-auto mt-1 block h-1.5 w-1.5" />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={openNewEvent}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#081C35] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#0D2C4F]"
        >
          <Plus className="h-4 w-4" />
          Add Event
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["All", ...categories] as Array<EventCategory | "All">).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setCategoryFilter(category)}
              className={
                categoryFilter === category
                  ? "rounded-full bg-[#081C35] px-3 py-1.5 text-xs font-bold text-white"
                  : "rounded-full border border-border px-3 py-1.5 text-xs font-bold text-[#081C35] hover:bg-muted"
              }
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {totalFilteredItems > 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily Timeline</p>
          <div className="mt-3 flex flex-col gap-2">
            {filteredEvents.slice(0, 5).map((event) => {
              const meta = eventMeta(event)
              return (
                <div key={`timeline-${event.id}`} className="flex gap-3">
                  <div className="w-20 shrink-0 text-xs font-bold tabular-nums text-[#C9A227]">
                    {event.start_time || "Anytime"}
                  </div>
                  <div className="border-l border-border pl-3">
                    <p className="text-sm font-semibold text-[#081C35]">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{meta.category} · {meta.priority}</p>
                  </div>
                </div>
              )
            })}

            {filteredDispatchTasks.slice(0, Math.max(0, 5 - filteredEvents.length)).map((task) => (
              <div key={`timeline-dispatch-${task.id}`} className="flex gap-3">
                <div className="w-20 shrink-0 text-xs font-bold tabular-nums text-blue-700">
                  Follow-up
                </div>
                <div className="border-l border-border pl-3">
                  <p className="text-sm font-semibold text-[#081C35]">{task.title}</p>
                  <p className={`text-xs font-semibold ${priorityStyles[task.priority]}`}>
                    Dispatch · {task.priority}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Appointments
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {loading ? (
          <li className="text-sm text-muted-foreground">Loading events...</li>
        ) : totalFilteredItems === 0 ? (
          <li className="text-sm text-muted-foreground">
            {totalDayItems === 0 ? "No events yet." : "No events match this filter."}
          </li>
        ) : (
          <>
            {filteredEvents.map((event) => {
              const meta = eventMeta(event)
              const notes = eventDisplayNotes(event)

              return (
                <li key={event.id} className="flex items-start gap-3 rounded-lg bg-muted px-3 py-2.5">
                  <Checkbox
                    id={`calendar-${event.id}`}
                    checked={event.completed}
                    onCheckedChange={() => toggleCompleted(event)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${categoryStyles[meta.category]}`}>
                            {meta.category}
                          </span>
                          <span className={`text-[10px] font-bold ${priorityStyles[meta.priority]}`}>
                            {meta.priority}
                          </span>
                          {meta.reminder !== "None" ? (
                            <span className="text-[10px] font-medium text-muted-foreground">Reminder: {meta.reminder}</span>
                          ) : null}
                        </div>
                        <p
                          className={
                            event.completed
                              ? "text-sm font-semibold text-muted-foreground line-through"
                              : "text-sm font-semibold text-[#081C35]"
                          }
                        >
                          {event.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1 text-[#C9A227]">
                            <Clock className="h-3.5 w-3.5" />
                            {event.start_time || "No time"}
                            {event.end_time ? ` - ${event.end_time}` : ""}
                          </span>
                          {event.location ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {event.location}
                            </span>
                          ) : null}
                          {meta.repeat !== "None" ? <span>Repeats: {meta.repeat}</span> : null}
                        </div>
                        {notes ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notes}</p> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(event)}
                          aria-label="Edit calendar event"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-[#081C35]"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEvent(event.id)}
                          aria-label="Delete calendar event"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}

            {filteredDispatchTasks.map((task) => (
              <li key={`dispatch-task-${task.id}`} className="flex items-start gap-3 rounded-lg bg-blue-50 px-3 py-2.5">
                <div className="mt-1 h-4 w-4 rounded border border-blue-300 bg-white" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${categoryStyles.Dispatch}`}>
                      Dispatch
                    </span>
                    <span className={`text-[10px] font-bold ${priorityStyles[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#081C35]">{task.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-blue-700">
                      <Clock className="h-3.5 w-3.5" />
                      Follow-up due
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </>
        )}
      </ul>

      <div className="mt-4 rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {selectedDate === getTodayDate() ? "Today's Dispatch Follow Ups" : "Dispatch Follow Ups"}
          </p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {selectedDispatchTasks.length}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {selectedDispatchTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Dispatch follow ups due on this date.</p>
          ) : (
            selectedDispatchTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="rounded-lg bg-muted px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#081C35]">{task.title}</p>
                    <p className={`mt-0.5 text-xs font-bold ${priorityStyles[task.priority]}`}>
                      Dispatch · {task.priority}
                    </p>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    Open
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A227]">
                  {editingId ? "Edit Event" : "New Event"}
                </p>
                <h3 className="text-2xl font-bold text-[#081C35]">Calendar Event</h3>
              </div>
              <button
                type="button"
                onClick={resetForm}
                aria-label="Close event form"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-[#081C35]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="Event title"
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                  Category
                  <select
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) => updateForm("priority", event.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35] sm:col-span-1">
                  Date
                  <input
                    type="date"
                    value={form.event_date}
                    onChange={(event) => updateForm("event_date", event.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                  Start
                  <input
                    type="text"
                    value={form.start_time}
                    onChange={(event) => updateForm("start_time", event.target.value)}
                    placeholder="4:00 PM"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                  End
                  <input
                    type="text"
                    value={form.end_time}
                    onChange={(event) => updateForm("end_time", event.target.value)}
                    placeholder="Optional"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                  Repeat
                  <select
                    value={form.repeat}
                    onChange={(event) => updateForm("repeat", event.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  >
                    {repeats.map((repeat) => (
                      <option key={repeat} value={repeat}>{repeat}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                  Reminder
                  <select
                    value={form.reminder}
                    onChange={(event) => updateForm("reminder", event.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                  >
                    {reminders.map((reminder) => (
                      <option key={reminder} value={reminder}>{reminder}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                Location
                <input
                  type="text"
                  value={form.location}
                  onChange={(event) => updateForm("location", event.target.value)}
                  placeholder="Optional"
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-[#081C35]">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  placeholder="Optional notes"
                  rows={3}
                  className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="h-11 rounded-lg border border-border px-5 text-sm font-semibold text-[#081C35] hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEvent}
                disabled={saving}
                className="h-11 rounded-lg bg-[#081C35] px-5 text-sm font-semibold text-white hover:bg-[#0D2C4F] disabled:opacity-60"
              >
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Event"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CardShell>
  )
}

function FaithCard() {
  const { state, update } = useDashboard()
  const { quote, cite, items } = state.faith

  function toggle(id: string) {
    update((d) => {
      const item = d.faith.items.find((i) => i.id === id)
      if (item) item.done = !item.done
    })
  }

  return (
    <CardShell>
      <div className="flex items-center gap-2">
        <Church className="h-5 w-5 text-[#081C35]" />
        <h3 className="text-base font-bold text-[#081C35]">Faith</h3>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Daily Anchor
      </p>
      <blockquote className="mt-2 border-l-2 border-[#C9A227] pl-3">
        <EditableText
          value={quote}
          onChange={(v) => update((d) => (d.faith.quote = v))}
          ariaLabel="Daily anchor verse"
          multiline
          rows={2}
          className="text-sm italic leading-relaxed text-[#081C35]"
        />
        <EditableText
          value={cite}
          onChange={(v) => update((d) => (d.faith.cite = v))}
          ariaLabel="Verse reference"
          block
          className="mt-1 block text-xs font-medium not-italic text-muted-foreground"
        />
      </blockquote>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <Checkbox id={item.id} checked={item.done} onCheckedChange={() => toggle(item.id)} />
            <EditableText
              value={item.label}
              onChange={(v) =>
                update((d) => {
                  const i = d.faith.items.find((x) => x.id === item.id)
                  if (i) i.label = v
                })
              }
              ariaLabel="Faith item"
              block
              className={
                item.done
                  ? "text-sm font-normal text-muted-foreground line-through"
                  : "text-sm font-normal text-[#081C35]"
              }
            />
          </li>
        ))}
      </ul>
      <CardLink label="Open Faith Journal" />
    </CardShell>
  )
}

function HealthCard() {
  const { state, update } = useDashboard()

  return (
    <CardShell>
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-[#081C35]" />
        <h3 className="text-base font-bold text-[#081C35]">Health</h3>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Body Scoreboard
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {state.health.bodyStats.map((stat) => (
          <div
            key={stat.id}
            className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
          >
            <span className="text-sm font-medium text-[#081C35]">{stat.label}</span>
            <EditableText
              value={stat.value}
              onChange={(v) =>
                update((d) => {
                  const b = d.health.bodyStats.find((x) => x.id === stat.id)
                  if (b) b.value = v
                })
              }
              ariaLabel={`${stat.label} value`}
              className="text-right text-sm font-semibold tabular-nums text-muted-foreground"
            />
          </div>
        ))}
      </div>
      <CardLink label="View Full Tracker" />
    </CardShell>
  )
}

export function SecondRow() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <CalendarCard />
      <FaithCard />
      <HealthCard />
    </div>
  )
}
