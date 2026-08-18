"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { durationHours, lifeAreaFor, localDateKey, packLifeNotes, timeMinutes, unpackLifeNotes, type LifeCalendarEvent } from "@/lib/life-hq"

export type FamilyCommitmentForm = {
  title: string
  date: string
  startTime: string
  endTime: string
  notes: string
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function weekBounds(todayKey: string) {
  const start = new Date(`${todayKey}T12:00:00`)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: localDateKey(start), end: localDateKey(end) }
}

export function useFamilyCalendar() {
  const todayKey = localDateKey()
  const bounds = useMemo(() => weekBounds(todayKey), [todayKey])
  const [events, setEvents] = useState<LifeCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setMessage("")
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setMessage(userError?.message ?? "Sign in required.")
      setLoading(false)
      return
    }
    const queryStart = bounds.start < todayKey ? bounds.start : todayKey
    const { data, error } = await supabase.from("gbgs_calendar_events")
      .select("id,title,event_date,start_time,end_time,category,notes,completed,source,source_id")
      .eq("user_id", userData.user.id)
      .gte("event_date", queryStart)
      .lte("event_date", addDays(todayKey, 30))
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
    if (error) setMessage(error.message)
    setEvents(((data ?? []) as LifeCalendarEvent[]).filter((event) => lifeAreaFor(event) === "Family"))
    setLoading(false)
  }, [bounds.start, todayKey])

  useEffect(() => { void load() }, [load])

  async function saveCommitment(form: FamilyCommitmentForm, editingId?: string) {
    if (!form.title.trim() || !form.date) return "Add a title and date."
    if (form.startTime && form.endTime && (timeMinutes(form.endTime) ?? 0) <= (timeMinutes(form.startTime) ?? 0)) return "The end time must be later than the start time."
    setSaving(true)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) { setSaving(false); return userError?.message ?? "Sign in required." }
    const payload = {
      title: form.title.trim(), event_date: form.date,
      start_time: form.startTime || null, end_time: form.endTime || null,
      category: "Family", notes: packLifeNotes(form.notes, "Family"), updated_at: new Date().toISOString(),
    }
    const query = editingId
      ? supabase.from("gbgs_calendar_events").update(payload).eq("id", editingId).eq("user_id", userData.user.id).eq("category", "Family")
      : supabase.from("gbgs_calendar_events").insert({ ...payload, user_id: userData.user.id, completed: false, source: "Manual", source_id: null })
    const { data, error } = await query.select("id,title,event_date,start_time,end_time,category,notes,completed,source,source_id").single()
    if (!error && data) await load()
    setSaving(false)
    setMessage(error ? error.message : editingId ? "Family commitment updated." : "Family commitment added.")
    return error?.message ?? null
  }

  async function toggle(event: LifeCalendarEvent) {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const completed = !event.completed
    const { error } = await supabase.from("gbgs_calendar_events").update({ completed, updated_at: new Date().toISOString() }).eq("id", event.id).eq("user_id", userData.user.id).eq("category", "Family")
    if (error) setMessage(error.message)
    else setEvents((current) => current.map((item) => item.id === event.id ? { ...item, completed } : item))
  }

  async function remove(event: LifeCalendarEvent) {
    if (!window.confirm(`Delete "${event.title}" from the Family calendar?`)) return false
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return false
    const { error } = await supabase.from("gbgs_calendar_events").delete().eq("id", event.id).eq("user_id", userData.user.id).eq("category", "Family")
    if (error) { setMessage(error.message); return false }
    setEvents((current) => current.filter((item) => item.id !== event.id))
    setMessage("Family commitment deleted.")
    return true
  }

  const todayEvents = events.filter((event) => event.event_date === todayKey)
  const upcomingEvents = events.filter((event) => event.event_date > todayKey && event.event_date <= addDays(todayKey, 30))
  const responsibilities = events.filter((event) => !event.start_time && event.event_date >= todayKey)
  const todayHours = todayEvents.reduce((sum, event) => sum + durationHours(event), 0)
  const weekHours = events.filter((event) => event.event_date >= bounds.start && event.event_date <= bounds.end).reduce((sum, event) => sum + durationHours(event), 0)

  function formFor(event: LifeCalendarEvent): FamilyCommitmentForm {
    return { title: event.title, date: event.event_date, startTime: event.start_time?.slice(0, 5) ?? "", endTime: event.end_time?.slice(0, 5) ?? "", notes: unpackLifeNotes(event.notes).notes }
  }

  return { todayKey, events, todayEvents, upcomingEvents, responsibilities, todayHours, weekHours, loading, saving, message, setMessage, saveCommitment, toggle, remove, formFor }
}
