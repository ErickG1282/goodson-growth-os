"use client"

/**
 * Central dashboard data store.
 *
 * All dashboard state lives here in a single typed object. Components read from
 * `state` and mutate through `update(...)`. Persistence is isolated in the
 * `loadState` / `saveState` helpers below.
 *
 * ---------------------------------------------------------------------------
 * SUPABASE-READY:
 * Today this persists to localStorage. To connect Supabase later, replace the
 * bodies of `loadState` and `saveState` with async Supabase calls (e.g. select
 * a `dashboards` row on load, upsert it on save) and switch the effects to
 * await them. The component API (`useDashboard`, `update`, `resetToday`) does
 * NOT need to change, so the UI stays identical.
 * ---------------------------------------------------------------------------
 */

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
  mission:
    "Helping talented people become successful business owners while building ownership alongside them.",
  top3: [
    { id: "t1", label: "Call 10 fleet prospects", done: false },
    { id: "t2", label: "Follow up with 2 brokers", done: false },
    { id: "t3", label: "Review driver applications", done: false },
  ],
  kpis: [
    { id: "k1", title: "Dispatch Drivers", value: "8 / 12", subtitle: "90-day target", percent: 67, barColor: "#2563EB" },
    { id: "k2", title: "Fleet Accounts", value: "0 / 2", subtitle: "First commercial wins", percent: 0, barColor: "#16A34A" },
    { id: "k3", title: "CDL Income Goal", value: "$1,200/week", subtitle: "Temporary capital", percent: 60, barColor: "#7C3AED" },
    { id: "k4", title: "Cash Goal", value: "$250K", subtitle: "Family freedom target", percent: 25, barColor: "#C9A227" },
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
      { id: "c1", label: "Update fleet insurance docs", done: true },
      { id: "c2", label: "Order tire inventory", done: false },
      { id: "c3", label: "Finalize Miz Rita menu", done: false },
    ],
  },
}

const STORAGE_KEY = "gbgs-dashboard-v1"

// --- Persistence layer (swap these two for Supabase later) --------------------

function loadState(): DashboardState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DashboardState>
    // Shallow-merge onto defaults so newly added fields stay populated.
    return { ...defaultState, ...parsed } as DashboardState
  } catch {
    return null
  }
}

function saveState(state: DashboardState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore write failures (e.g. storage full or unavailable).
  }
}

// -----------------------------------------------------------------------------

interface DashboardContextValue {
  state: DashboardState
  /** Immutably mutate the state via a draft mutator function. */
  update: (mutator: (draft: DashboardState) => void) => void
  /** Clear all daily progress (checkboxes + today's inputs). */
  resetToday: () => void
  hydrated: boolean
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState>(defaultState)
  const [hydrated, setHydrated] = useState(false)

  // Load persisted state after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const loaded = loadState()
    if (loaded) setState(loaded)
    setHydrated(true)
  }, [])

  // Persist on every change, but only after the initial load.
  const didHydrate = useRef(false)
  useEffect(() => {
    if (!hydrated) return
    if (!didHydrate.current) {
      didHydrate.current = true
      return
    }
    saveState(state)
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
