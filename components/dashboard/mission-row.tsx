"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, CheckCircle2, Phone, Save, Target, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"

type CalendarEvent = {
  id: string
  title: string
  start_time: string | null
  notes: string | null
  completed: boolean
}

type DispatchTask = {
  id: string
  title: string
  priority: "Low" | "Medium" | "High"
  due_date: string | null
  status: string
}

type PriorityItem = {
  id: string
  title: string
  source: "Calendar" | "Dispatch"
  detail: string
  done: boolean
  icon: "calendar" | "phone"
}

const defaultMission =
  "Helping talented people become successful business owners while building ownership alongside them."

function todayDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function priorityClass(priority: string) {
  if (priority === "High") return "text-red-600"
  if (priority === "Medium") return "text-[#C9A227]"
  return "text-muted-foreground"
}

export function MissionRow() {
  const [mission, setMission] = useState(defaultMission)
  const [draftMission, setDraftMission] = useState(defaultMission)
  const [editingMission, setEditingMission] = useState(false)
  const [savingMission, setSavingMission] = useState(false)
  const [missionMessage, setMissionMessage] = useState("")
  const [priorities, setPriorities] = useState<PriorityItem[]>([])
  const [loading, setLoading] = useState(true)

  const openCount = useMemo(() => priorities.filter((item) => !item.done).length, [priorities])

  async function loadMissionAndPriorities() {
    setLoading(true)
    setMissionMessage("")

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (sessionError || !user) {
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from("gbgs_user_profile")
      .select("mission")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profile?.mission) {
      setMission(profile.mission)
      setDraftMission(profile.mission)
    }

    const today = todayDate()

    const { data: calendarData } = await supabase
      .from("gbgs_calendar_events")
      .select("id,title,start_time,notes,completed")
      .eq("user_id", user.id)
      .eq("event_date", today)
      .eq("completed", false)
      .order("start_time", { ascending: true })
      .limit(5)

    const { data: taskData } = await supabase
      .from("gbgs_prospect_tasks")
      .select("id,title,priority,due_date,status")
      .eq("user_id", user.id)
      .lte("due_date", today)
      .neq("status", "Completed")
      .order("due_date", { ascending: true })
      .limit(5)

    const calendarItems: PriorityItem[] = ((calendarData ?? []) as CalendarEvent[]).map((event) => ({
      id: `calendar-${event.id}`,
      title: event.title,
      source: "Calendar",
      detail: `${event.start_time || "Anytime"}`,
      done: event.completed,
      icon: "calendar",
    }))

    const taskItems: PriorityItem[] = ((taskData ?? []) as DispatchTask[]).map((task) => ({
      id: `dispatch-${task.id}`,
      title: task.title,
      source: "Dispatch",
      detail: `${task.priority} priority`,
      done: false,
      icon: "phone",
    }))

    setPriorities([...taskItems, ...calendarItems].slice(0, 5))
    setLoading(false)
  }

  useEffect(() => {
    loadMissionAndPriorities()
  }, [])

  async function saveMission() {
    const nextMission = draftMission.trim() || defaultMission
    setSavingMission(true)
    setMissionMessage("")

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (sessionError || !user) {
      setMissionMessage("You must be signed in to save mission.")
      setSavingMission(false)
      return
    }

    const { error } = await supabase
      .from("gbgs_user_profile")
      .upsert(
        {
          user_id: user.id,
          mission: nextMission,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )

    if (error) {
      setMissionMessage(error.message)
      setSavingMission(false)
      return
    }

    setMission(nextMission)
    setDraftMission(nextMission)
    setEditingMission(false)
    setMissionMessage("Mission saved.")
    setSavingMission(false)
  }

  function cancelMissionEdit() {
    setDraftMission(mission)
    setEditingMission(false)
    setMissionMessage("")
  }

  async function togglePriority(item: PriorityItem) {
    setPriorities((prev) =>
      prev.map((priority) =>
        priority.id === item.id ? { ...priority, done: !priority.done } : priority,
      ),
    )

    if (item.source === "Calendar") {
      const id = item.id.replace("calendar-", "")
      await supabase
        .from("gbgs_calendar_events")
        .update({ completed: !item.done, updated_at: new Date().toISOString() })
        .eq("id", id)
    }

    if (item.source === "Dispatch") {
      const id = item.id.replace("dispatch-", "")
      await supabase
        .from("gbgs_prospect_tasks")
        .update({ status: !item.done ? "Completed" : "Open", completed_at: !item.done ? new Date().toISOString() : null })
        .eq("id", id)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl bg-[#081C35] p-6 shadow-[0_20px_60px_-25px_rgba(8,28,53,0.5)] lg:col-span-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[#C9A227]" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[#C9A227]">Mission</h2>
          </div>

          {!editingMission ? (
            <button
              type="button"
              onClick={() => setEditingMission(true)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white"
            >
              Edit Mission
            </button>
          ) : null}
        </div>

        {!editingMission ? (
          <p className="mt-4 text-lg font-bold leading-relaxed text-white text-pretty md:text-xl">
            {mission}
          </p>
        ) : (
          <div className="mt-4">
            <textarea
              value={draftMission}
              onChange={(event) => setDraftMission(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg font-bold leading-relaxed text-white outline-none placeholder:text-white/40 focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
              placeholder="Write your mission..."
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveMission}
                disabled={savingMission}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#C9A227] px-4 text-sm font-bold text-[#081C35] hover:opacity-90 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savingMission ? "Saving..." : "Save Mission"}
              </button>
              <button
                type="button"
                onClick={cancelMissionEdit}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-bold text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {missionMessage ? (
          <p className="mt-4 text-xs font-semibold text-white/60">{missionMessage}</p>
        ) : (
          <p className="mt-4 text-xs font-semibold text-white/45">Mission saves to Supabase automatically.</p>
        )}
      </div>

      <div className="rounded-2xl bg-card p-6 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#081C35]">Today&apos;s Priorities</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
            {openCount}
          </span>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {loading ? (
            <li className="text-sm text-muted-foreground">Loading priorities...</li>
          ) : priorities.length === 0 ? (
            <li className="rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">
              No priorities due today.
            </li>
          ) : (
            priorities.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-xl bg-muted px-3 py-3">
                <Checkbox
                  id={item.id}
                  checked={item.done}
                  onCheckedChange={() => togglePriority(item)}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      item.done
                        ? "text-sm font-semibold text-muted-foreground line-through"
                        : "text-sm font-semibold text-[#081C35]"
                    }
                  >
                    {item.title}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {item.icon === "calendar" ? (
                      <CalendarDays className="h-3.5 w-3.5" />
                    ) : (
                      <Phone className="h-3.5 w-3.5" />
                    )}
                    <span>{item.source}</span>
                    <span>·</span>
                    <span className={item.source === "Dispatch" ? priorityClass(item.detail.split(" ")[0]) : ""}>
                      {item.detail}
                    </span>
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
