"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import {
  compatibleCategory,
  EMPTY_TIME_BLOCK,
  lifeAreaFor,
  localDateKey,
  packLifeNotes,
  timeMinutes,
  unpackLifeNotes,
  type LifeCalendarEvent,
  type TimeBlockForm,
} from "@/lib/life-hq"

export type LifeTodayState = {
  top: [string, string, string]
  topDone: [boolean, boolean, boolean]
  scripture: string
  scriptureReference: string
  faithDone: [boolean, boolean, boolean]
  goalActions: { id: string; action_title: string; priority: "High" | "Medium" | "Low"; status: "Planned" | "Completed" | "Skipped"; scheduled_time: string | null }[]
  workout: string
  weight: string
  protein: string
  quickNote: string
}

export const DEFAULT_TODAY: LifeTodayState = {
  top: ["", "", ""],
  topDone: [false, false, false],
  scripture: "Commit to the Lord whatever you do, and he will establish your plans.",
  scriptureReference: "Proverbs 16:3",
  faithDone: [false, false, false],
  goalActions: [],
  workout: "",
  weight: "",
  protein: "",
  quickNote: "",
}

export function useLifeHqToday() {
  const [todayKey, setTodayKey] = useState(() => localDateKey())
  const [today, setToday] = useState<LifeTodayState>(DEFAULT_TODAY)
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
    const [dashboardResult, healthResult, faithResult, goalActionsResult, prioritiesResult, eventsResult] = await Promise.all([
      supabase.from("gbgs_dashboard").select("quick_notes").eq("user_id", userData.user.id).maybeSingle(),
      supabase.from("gbgs_life_daily_health").select("id,workout_name,weight_lbs,protein_target_g").eq("user_id", userData.user.id).eq("record_date", todayKey).maybeSingle(),
      supabase.from("gbgs_life_daily_faith").select("scripture_reference,scripture_text,faith_focus,prayer_completed,devotion_completed,gratitude_completed").eq("user_id", userData.user.id).eq("record_date", todayKey).maybeSingle(),
      supabase.from("gbgs_life_goal_actions").select("id,action_title,priority,status,scheduled_time").eq("user_id", userData.user.id).eq("action_date", todayKey).order("scheduled_time", { ascending: true, nullsFirst: false }),
      supabase.from("gbgs_life_daily_priorities").select("position,priority_text,completed").eq("user_id", userData.user.id).eq("priority_date", todayKey).order("position"),
      supabase.from("gbgs_calendar_events").select("id,title,event_date,start_time,end_time,category,notes,completed,source,source_id").eq("user_id", userData.user.id).eq("event_date", todayKey).order("start_time", { ascending: true, nullsFirst: false }),
    ])
    const top: LifeTodayState["top"] = ["", "", ""]
    const topDone: LifeTodayState["topDone"] = [false, false, false]
    for (const priority of prioritiesResult.data ?? []) {
      const index = priority.position - 1
      if (index >= 0 && index < 3) {
        top[index] = priority.priority_text
        topDone[index] = priority.completed
      }
    }
    const row = dashboardResult.data
    const health = healthResult.data
    const faith = faithResult.data
    let proteinConsumed = 0
    if (health?.id) {
      const { data: meals, error: mealsError } = await supabase.from("gbgs_life_health_meals").select("id").eq("user_id", userData.user.id).eq("daily_health_id", health.id)
      if (mealsError) setMessage(mealsError.message)
      const mealIds = (meals ?? []).map((meal) => meal.id)
      if (mealIds.length) {
        const { data: foods, error: foodsError } = await supabase.from("gbgs_life_health_food_items").select("protein_g").eq("user_id", userData.user.id).in("meal_id", mealIds)
        if (foodsError) setMessage(foodsError.message)
        proteinConsumed = (foods ?? []).reduce((sum, food) => sum + Number(food.protein_g), 0)
      }
    }
    setToday({
      top,
      topDone,
      scripture: faith?.scripture_text || faith?.faith_focus || "No scripture or Faith focus set for today.",
      scriptureReference: faith?.scripture_reference ?? "",
      faithDone: [faith?.prayer_completed ?? false, faith?.devotion_completed ?? false, faith?.gratitude_completed ?? false],
      goalActions: (goalActionsResult.data ?? []) as LifeTodayState["goalActions"],
      workout: health?.workout_name ?? "",
      weight: health?.weight_lbs === null || health?.weight_lbs === undefined ? "" : `${health.weight_lbs} lbs`,
      protein: !health || (proteinConsumed === 0 && health.protein_target_g === null) ? "" : `${Number.isInteger(proteinConsumed) ? proteinConsumed : proteinConsumed.toFixed(1)} / ${health.protein_target_g ?? "—"} g`,
      quickNote: row?.quick_notes ?? "",
    })
    if (dashboardResult.error) setMessage(dashboardResult.error.message)
    if (healthResult.error) setMessage(healthResult.error.message)
    if (faithResult.error) setMessage(faithResult.error.message)
    if (goalActionsResult.error) setMessage(goalActionsResult.error.message)
    if (prioritiesResult.error) setMessage(prioritiesResult.error.message)
    if (eventsResult.error) setMessage(eventsResult.error.message)
    setEvents((eventsResult.data ?? []) as LifeCalendarEvent[])
    setLoading(false)
  }, [todayKey])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const now = new Date()
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timeout = window.setTimeout(() => setTodayKey(localDateKey()), nextDay.getTime() - now.getTime() + 1000)
    return () => window.clearTimeout(timeout)
  }, [todayKey])

  async function persistDashboardPatch(patch: Record<string, unknown>, successMessage: string) {
    setSaving(true)
    setMessage("")
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setMessage(userError?.message ?? "Sign in required.")
      setSaving(false)
      return false
    }
    const values = { ...patch, updated_at: new Date().toISOString() }
    const updateResult = await supabase.from("gbgs_dashboard").update(values).eq("user_id", userData.user.id).select("user_id").maybeSingle()
    if (updateResult.error) {
      setMessage(updateResult.error.message)
      setSaving(false)
      return false
    }
    if (!updateResult.data) {
      const insertResult = await supabase.from("gbgs_dashboard").insert({ user_id: userData.user.id, ...values })
      if (insertResult.error) {
        setMessage(insertResult.error.message)
        setSaving(false)
        return false
      }
    }
    setMessage(successMessage)
    setSaving(false)
    return true
  }

  async function persistTopPriority(index: number, priorityText: string, completed: boolean, successMessage: string) {
    setSaving(true)
    setMessage("")
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setMessage(userError?.message ?? "Sign in required.")
      setSaving(false)
      return false
    }
    const { error } = await supabase.from("gbgs_life_daily_priorities").upsert({
      user_id: userData.user.id,
      priority_date: todayKey,
      position: index + 1,
      priority_text: priorityText.trim(),
      completed,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,priority_date,position" })
    setMessage(error ? error.message : successMessage)
    setSaving(false)
    return !error
  }

  async function saveTopPriority(index: number) {
    const priorityText = today.top[index]
    if (await persistTopPriority(index, priorityText, today.topDone[index], `Priority ${index + 1} saved.`)) {
      setToday((current) => {
        const top = [...current.top] as LifeTodayState["top"]
        top[index] = priorityText.trim()
        return { ...current, top }
      })
    }
  }

  async function setTopCompleted(index: number, completed: boolean) {
    const topDone = [...today.topDone] as LifeTodayState["topDone"]
    topDone[index] = completed
    if (await persistTopPriority(index, today.top[index], completed, "Top 3 progress saved.")) setToday((current) => ({ ...current, topDone }))
  }

  async function setFaithCompleted(index: number, completed: boolean) {
    const faithDone = [...today.faithDone] as LifeTodayState["faithDone"]
    faithDone[index] = completed
    setSaving(true)
    setMessage("")
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) { setMessage(userError?.message ?? "Sign in required."); setSaving(false); return }
    const names = ["prayer", "devotion", "gratitude"] as const
    const name = names[index]
    const now = new Date().toISOString()
    const { error } = await supabase.from("gbgs_life_daily_faith").upsert({
      user_id: userData.user.id,
      record_date: todayKey,
      [`${name}_completed`]: completed,
      [`${name}_completed_at`]: completed ? now : null,
      updated_at: now,
    }, { onConflict: "user_id,record_date" })
    setMessage(error ? error.message : "Faith progress saved.")
    setSaving(false)
    if (!error) setToday((current) => ({ ...current, faithDone }))
  }

  async function saveQuickCapture() {
    return persistDashboardPatch({ quick_notes: today.quickNote }, "Quick Capture saved.")
  }

  async function setGoalActionCompleted(id: string, completed: boolean) {
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { setSaving(false); return }
    const now = new Date().toISOString()
    const { error } = await supabase.from("gbgs_life_goal_actions").update({ status: completed ? "Completed" : "Planned", completed_at: completed ? now : null, updated_at: now }).eq("id", id).eq("user_id", userData.user.id)
    if (!error) await supabase.from("gbgs_calendar_events").update({ completed, updated_at: now }).eq("source", "Life Goals").eq("source_id", id).eq("user_id", userData.user.id)
    setMessage(error ? error.message : "Goal action updated.")
    setSaving(false)
    if (!error) setToday((current) => ({ ...current, goalActions: current.goalActions.map((action) => action.id === id ? { ...action, status: completed ? "Completed" : "Planned" } : action) }))
  }

  async function saveTimeBlock(form: TimeBlockForm, editingId?: string) {
    if (!form.title.trim() || !form.startTime || !form.endTime) return "Add a title, start time, and end time."
    if ((timeMinutes(form.endTime) ?? 0) <= (timeMinutes(form.startTime) ?? 0)) return "The end time must be later than the start time."
    setSaving(true)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setSaving(false)
      return userError?.message ?? "Sign in required."
    }
    const payload = {
      title: form.title.trim(),
      event_date: todayKey,
      start_time: form.startTime,
      end_time: form.endTime,
      category: compatibleCategory(form.area),
      notes: packLifeNotes(form.notes, form.area),
      updated_at: new Date().toISOString(),
    }
    const query = editingId
      ? supabase.from("gbgs_calendar_events").update(payload).eq("id", editingId).eq("user_id", userData.user.id)
      : supabase.from("gbgs_calendar_events").insert({ ...payload, user_id: userData.user.id, completed: false, source: "Manual", source_id: null })
    const { data, error } = await query.select("id,title,event_date,start_time,end_time,category,notes,completed,source,source_id").single()
    if (!error && data) {
      const saved = data as LifeCalendarEvent
      setEvents((current) => (editingId ? current.map((item) => item.id === editingId ? saved : item) : [...current, saved]).sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99")))
    }
    setSaving(false)
    setMessage(error ? error.message : editingId ? "Time block updated." : "Time block added.")
    return error?.message ?? null
  }

  async function toggleEvent(event: LifeCalendarEvent) {
    const completed = !event.completed
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, completed } : item))
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    if (event.source === "Life Health" && event.source_id) {
      const { error: healthError } = await supabase.from("gbgs_life_daily_health")
        .update({ workout_status: completed ? "Completed" : "Planned", updated_at: new Date().toISOString() })
        .eq("id", event.source_id).eq("user_id", userData.user.id)
      if (healthError) { setMessage(healthError.message); void load(); return }
      setToday((current) => ({ ...current, workout: event.title.replace(/^Workout:\s*/, "") }))
    }
    if (event.source === "Life Goals" && event.source_id) {
      const { error: goalError } = await supabase.from("gbgs_life_goal_actions").update({ status: completed ? "Completed" : "Planned", completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", event.source_id).eq("user_id", userData.user.id)
      if (goalError) { setMessage(goalError.message); void load(); return }
      setToday((current) => ({ ...current, goalActions: current.goalActions.map((action) => action.id === event.source_id ? { ...action, status: completed ? "Completed" : "Planned" } : action) }))
    }
    const { error } = await supabase.from("gbgs_calendar_events").update({ completed, updated_at: new Date().toISOString() }).eq("id", event.id).eq("user_id", userData.user.id)
    if (error) { setMessage(error.message); void load() }
  }

  async function deleteEvent(event: LifeCalendarEvent) {
    if (!window.confirm(`Delete "${event.title}" from today's schedule?`)) return false
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return false
    const { error } = await supabase.from("gbgs_calendar_events").delete().eq("id", event.id).eq("user_id", userData.user.id)
    if (error) { setMessage(error.message); return false }
    setEvents((current) => current.filter((item) => item.id !== event.id))
    setMessage("Time block deleted.")
    return true
  }

  function formForEvent(event: LifeCalendarEvent): TimeBlockForm {
    return {
      title: event.title,
      area: lifeAreaFor(event),
      startTime: event.start_time?.slice(0, 5) ?? "",
      endTime: event.end_time?.slice(0, 5) ?? "",
      notes: unpackLifeNotes(event.notes).notes,
    }
  }

  return { todayKey, today, setToday, events, loading, saving, message, setMessage, load, saveTopPriority, setTopCompleted, setFaithCompleted, setGoalActionCompleted, saveQuickCapture, saveTimeBlock, toggleEvent, deleteEvent, formForEvent, emptyTimeBlock: EMPTY_TIME_BLOCK }
}
