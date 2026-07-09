"use client"

import { useEffect, useState } from "react"
import { Menu, RotateCcw, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDashboard } from "@/lib/dashboard-store"

interface DashboardHeaderProps {
  onOpenSidebar: () => void
}

export function DashboardHeader({ onOpenSidebar }: DashboardHeaderProps) {
  const { resetToday } = useDashboard()
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const dateLabel = now
    ? now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : ""
  const timeLabel = now
    ? now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : ""

  return (
    <header className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation menu"
          className="rounded-lg p-2 text-[#081C35] transition-colors hover:bg-muted lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#081C35] sm:text-2xl">Welcome back, Erick! 👋</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="tabular-nums">{dateLabel}</span>
            {dateLabel && <span className="mx-2 text-border">•</span>}
            <span className="font-medium tabular-nums text-[#C9A227]">{timeLabel}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={resetToday}
          className="h-10 rounded-lg border-border bg-transparent text-sm font-medium text-[#081C35] hover:bg-muted"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset Today
        </Button>
        <Button
          type="button"
          onClick={() => window.print()}
          className="h-10 rounded-lg bg-[#081C35] text-sm font-semibold text-white hover:bg-[#0D2C4F]"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Wall Sheet
        </Button>
      </div>
    </header>
  )
}
