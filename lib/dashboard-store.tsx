"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

export interface Task {
  id: string
  label: string
  done: boolean
}

export interface Kpi {
  id: string
  title: string
  value: string
  subtitle: string
  percent: number
  barColor: string
}

export interface Appointment {
  id: string
  time: string
  title: string
}

export interface BodyStat {
  id: string
  label: string
  value: string
}

export interface OverviewBar {
  id: string
  label: string
  value: number
  color: string
}

export interface OverviewStat {
  id: string
  label: string
  value: string
}

export interface DashboardState {
  mission: string
  top3: Task[]
  kpis: Kpi[]
  calendar: {
    dayName: string
    monthYear: string
    appointments: Appointment[]
  }
  faith: {
    quote: string
    cite: string
    items: Task[]
  }
  health: {
    bodyStats: BodyStat[]
  }
  business: {
    bars: OverviewBar[]
    stats: OverviewStat[]
  }
  quickNotes: {
    pinned: string
    note: string
    checklist: Task[]
  }
}

export const defaultState: DashboardState = {
  mission: "Helping talented people become successful business owners while building ownership alongside them.",
  top3: [
    { id: "t1", label: "Call 10 fleet prospects", done: false },
    { id: "t2", label: "Follow up with 2 brokers", done: false },
    { id: "t3", label: "Review driver applications", done: false },
  ],
  kpis: [
    {
      id: "k1",
      title: "Dispatch Drivers",
      value: "8 / 12",
      subtitle: "90-day target",
      percent: 67,
      barColor: "#2563EB",
    },
    {
      id: "k2",
      title: "Fleet Accounts",
      value: "0 / 2",
      subtitle: "First commercial wins",
      percent: 0,
      barColor: "#16A34A",
    },
    {
      id: "k3",
      title: "CDL Income Goal",
      value: "$1,200/week",
      subtitle: "Temporary capital",
      percent: 60,
      barColor: "#7C3AED",
    },
    {
      id: "k4",
      title: "Cash Goal",
      value: "$250K",
      subtitle: "Family freedom target",
      percent: 25,
      barColor: "#C9A227",
    },
  ],
  calendar: {
    dayName: "Friday",
    monthYear: "July 2026",
    appointments: [
      { id: "a1", time: "10:00 AM", title: "Prospect Call – Fleet Account" },
      { id: "a2", time: "11:30 AM", title: "Driver Interview" },
      { id: "a3", time: "2:00 PM", title: "Broker Follow Up" },
      { id: "a4", time: "4:30 PM", title: "Team Huddle" },
    ],
  },
  faith: {
    quote: '"Commit to the Lord whatever you do, and he will establish your plans."',
    cite: "Proverbs 16:3",
    items: [
      { id: "f1", label: "Pray", done: false },
      { id: "f2", label: "Bible / Devotion", done: false },
      { id: "f3", label: "Gratitude Journal", done: false },
    ],
  },
  health: {
    bodyStats: [
      { id: "b1", label: "Workout", value: "—" },
      { id: "b2", label: "Weight", value: "—" },
      { id: "b3", label: "Protein", value: "—" },
    ],
  },
  business: {
    bars: [
      { id: "o1", label: "Dispatch", value: 78, color: "#2563EB" },
      { id: "o2", label: "Tire Shop", value: 54, color: "#16A34A" },
      { id: "o3", label: "Miz Rita", value: 41, color: "#C9A227" },
      { id: "o4", label: "CDL", value: 63, color: "#7C3AED" },
      { id: "o5", label: "Cash", value: 25, color: "#081C35" },
    ],
    stats: [
      { id: "s1", label: "Weekly Revenue", value: "$18.4K" },
      { id: "s2", label: "Active Divisions", value: "5" },
      { id: "s3", label: "Open Tasks", value: "12" },
    ],
  },
  quickNotes: {
    pinned: "Meet accountant Thursday re: LLC structure.",
    note: "",
    checklist: [
      { id: "c1", label: "Update fleet insurance docs", done: false },
      { id: "c2", label: "Order tire inventory", done: false },
      { id: "c3", label: "Finalize Miz Rita menu", done: false },
    ],
  },
}

function boolArray(value: unknown, fallback: boolean[]) {
  return Array.isArray(value) ? value.map(Boolean) : fallback
}

function dashboardFromRow(row: any): DashboardState {
  const dispatchCurrent = row.dispatch_drivers_current ?? 8
  const dispatchGoal = row.dispatch_drivers_goal ?? 12
  const fleetCurrent = row.fleet_accounts_current ?? 0
  const fleetGoal = row.fleet_accounts_goal ?? 2

  const topDone = boolArray(row.todays_top_done, [false, false, false])
  const faithDone = boolArray(row.faith_done, [false, false, false])
  const quickDone = boolArray(row.quick_notes_done, [false, false, false])

  return {
    ...defaultState,
    mission: row.mission ?? defaultState.mission,
    top3: [
      { id: "t1", label: row.todays_top_1 ?? defaultState.top3[0].label, done: topDone[0] ?? false },
      { id: "t2", label: row.todays_top_2 ?? defaultState.top3[1].label, done: topDone[1] ?? false },
      { id: "t3", label: row.todays_top_3 ?? defaultState.top3[2].label, done: topDone[2] ?? false },
    ],
    kpis: [
      {
        ...defaultState.kpis[0],
        value: `${dispatchCurrent} / ${dispatchGoal}`,
        percent: dispatchGoal ? Math.round((dispatchCurrent / dispatchGoal) * 100) : 0,
      },
      {
        ...defaultState.kpis[1],
        value: `${fleetCurrent} / ${fleetGoal}`,
        percent: fleetGoal ? Math.round((fleetCurrent / fleetGoal) * 100) : 0,
      },
      { ...defaultState.kpis[2], value: row.cdl_income_goal ?? "$1,200/week" },
      { ...defaultState.kpis[3], value: row.cash_goal ?? "$250K" },
    ],
    faith: {
      ...defaultState.faith,
      quote: `"${row.faith_scripture ?? "Commit to the Lord whatever you do, and he will establish your plans."}"`,
      cite: row.faith_reference ?? "Proverbs 16:3",
      items: defaultState.faith.items.map((item, index) => ({
        ...item,
        done: faithDone[index] ?? false,
      })),
    },
    health: {
      bodyStats: [
        { id: "b1", label: "Workout", value: row.health_workout ?? "Back/Biceps" },
        { id: "b2", label: "Weight", value: row.health_weight || "—" },
        { id: "b3", label: "Protein", value: row.health_protein || "—" },
      ],
    },
    quickNotes: {
      ...defaultState.quickNotes,
      note: row.quick_notes ?? "",
      checklist: defaultState.quickNotes.checklist.map((item, index) => ({
        ...item,
        done: quickDone[index] ?? false,
      })),
    },
  }
}

async function loadState(): Promise<DashboardState | null> {
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user

  if (!user) return null

  const { data, error } = await supabase
    .from("gbgs_dashboard")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (error || !data) return null

  return dashboardFromRow(data)
}

async function saveState(state: DashboardState) {
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user

  if (!user) return

  await supabase
    .from("gbgs_dashboard")
    .update({
      mission: state.mission,
      todays_top_1: state.top3[0]?.label ?? "",
      todays_top_2: state.top3[1]?.label ?? "",
      todays_top_3: state.top3[2]?.label ?? "",
      todays_top_done: state.top3.map((item) => item.done),
      faith_scripture: state.faith.quote.replaceAll('"', ""),
      faith_reference: state.faith.cite,
      faith_done: state.faith.items.map((item) => item.done),
      health_workout: state.health.bodyStats[0]?.value ?? "",
      health_weight: state.health.bodyStats[1]?.value ?? "",
      health_protein: state.health.bodyStats[2]?.value ?? "",
      quick_notes: state.quickNotes.note,
      quick_notes_done: state.quickNotes.checklist.map((item) => item.done),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
}

interface DashboardContextValue {
  state: DashboardState
  update: (mutator: (draft: DashboardState) => void) => void
  resetToday: () => void
  hydrated: boolean
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState>(defaultState)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    async function init() {
      const loaded = await loadState()
      if (loaded) setState(loaded)
      setHydrated(true)
    }

    init()
  }, [])

  const didHydrate = useRef(false)

  useEffect(() => {
    if (!hydrated) return

    if (!didHydrate.current) {
      didHydrate.current = true
      return
    }

    const timeout = setTimeout(() => {
      saveState(state)
    }, 500)

    return () => clearTimeout(timeout)
  }, [state, hydrated])

  const update = useCallback((mutator: (draft: DashboardState) => void) => {
    setState((prev) => {
      const draft = structuredClone(prev)
      mutator(draft)
      return draft
    })
  }, [])

  const resetToday = useCallback(() => {
    setState((prev) => {
      const draft = structuredClone(prev)
      draft.top3.forEach((t) => (t.done = false))
      draft.faith.items.forEach((t) => (t.done = false))
      draft.quickNotes.checklist.forEach((t) => (t.done = false))
      draft.quickNotes.note = ""
      draft.health.bodyStats.forEach((b) => (b.value = "—"))
      return draft
    })
  }, [])

  return (
    <DashboardContext.Provider value={{ state, update, resetToday, hydrated }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error("useDashboard must be used within a DashboardProvider")
  return ctx
}
