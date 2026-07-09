"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { BarChart3, Pin, Plus, StickyNote } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { EditableText } from "@/components/dashboard/editable-text"
import { useDashboard } from "@/lib/dashboard-store"
import { supabase } from "@/lib/supabase"

type Prospect = {
  id: string
  status: string
  type: string
  estimated_value: number | null
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function BusinessOverview() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [error, setError] = useState("")

  async function loadOverview() {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return

    const { data, error } = await supabase
      .from("gbgs_fleet_prospects")
      .select("id,status,type,estimated_value")
      .eq("user_id", user.id)

    if (error) {
      setError(error.message)
      setProspects([])
      return
    }

    setProspects((data ?? []) as Prospect[])
  }

  useEffect(() => {
    loadOverview()
  }, [])

  const overview = useMemo(() => {
    const total = prospects.length
    const won = prospects.filter((p) => p.status === "Won").length
    const open = prospects.filter((p) => p.status !== "Won" && p.status !== "Lost").length
    const pipeline = prospects
      .filter((p) => p.status !== "Won" && p.status !== "Lost")
      .reduce((sum, p) => sum + Number(p.estimated_value ?? 0), 0)

    const typeCounts = ["Fleet", "Broker", "Warehouse", "Shipper", "Carrier"].map((type) => ({
      label: type,
      value: prospects.filter((p) => p.type === type).length,
    }))

    const max = Math.max(...typeCounts.map((item) => item.value), 1)

    return { total, won, open, pipeline, typeCounts, max }
  }, [prospects])

  return (
    <div className="rounded-2xl bg-card p-6 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)] lg:col-span-2">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[#081C35]" />
        <h3 className="text-base font-bold text-[#081C35]">Business Overview</h3>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Open Prospects</p>
          <p className="mt-1 text-lg font-bold text-[#081C35]">{overview.open}</p>
        </div>
        <div className="rounded-lg bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Won Accounts</p>
          <p className="mt-1 text-lg font-bold text-[#081C35]">{overview.won}</p>
        </div>
        <div className="rounded-lg bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Pipeline</p>
          <p className="mt-1 text-lg font-bold text-[#081C35]">{money(overview.pipeline)}</p>
        </div>
      </div>

      <div className="mt-6 flex h-48 items-end justify-between gap-3 border-b border-border pb-1">
        {overview.typeCounts.map((bar) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="flex w-full max-w-[48px] items-end" style={{ height: "100%" }}>
              <div
                className="w-full rounded-t-md bg-[#081C35] transition-all"
                style={{ height: `${Math.max(8, (bar.value / overview.max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-3">
        {overview.typeCounts.map((bar) => (
          <div key={bar.label} className="flex-1 text-center">
            <p className="text-xs font-bold text-[#081C35]">{bar.value}</p>
            <p className="text-xs font-medium text-muted-foreground">{bar.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickNotes() {
  const { state, update } = useDashboard()
  const { pinned, note, checklist } = state.quickNotes

  function toggle(id: string) {
    update((d) => {
      const item = d.quickNotes.checklist.find((c) => c.id === id)
      if (item) item.done = !item.done
    })
  }

  function addItem() {
    update((d) => {
      d.quickNotes.checklist.push({
        id: `c-${Date.now()}`,
        label: "",
        done: false,
      })
    })
  }

  return (
    <div className="flex flex-col rounded-2xl bg-card p-6 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)]">
      <div className="flex items-center gap-2">
        <StickyNote className="h-5 w-5 text-[#081C35]" />
        <h3 className="text-base font-bold text-[#081C35]">Quick Notes</h3>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-2.5">
        <Pin className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A227]" />
        <EditableText
          value={pinned}
          onChange={(v) => update((d) => (d.quickNotes.pinned = v))}
          ariaLabel="Pinned note"
          block
          className="text-sm font-medium text-[#081C35]"
        />
      </div>

      <textarea
        value={note}
        onChange={(e) => update((d) => (d.quickNotes.note = e.target.value))}
        placeholder="Write a quick note..."
        rows={3}
        className="mt-4 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-[#081C35] outline-none transition-colors placeholder:text-muted-foreground focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]"
      />

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checklist</p>
      <ul className="mt-3 flex flex-col gap-3">
        {checklist.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <Checkbox id={item.id} checked={item.done} onCheckedChange={() => toggle(item.id)} />
            <EditableText
              value={item.label}
              onChange={(v) =>
                update((d) => {
                  const c = d.quickNotes.checklist.find((x) => x.id === item.id)
                  if (c) c.label = v
                })
              }
              ariaLabel="Checklist item"
              placeholder="New item..."
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

      <button
        type="button"
        onClick={addItem}
        className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-[#C9A227] hover:underline"
      >
        <Plus className="h-4 w-4" />
        Add Item
      </button>
    </div>
  )
}

export function ThirdRow() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <BusinessOverview />
      <QuickNotes />
    </div>
  )
}
