"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { SidebarContent } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { MissionRow } from "@/components/dashboard/mission-row"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { SecondRow } from "@/components/dashboard/second-row"
import { ThirdRow } from "@/components/dashboard/third-row"
import { DashboardProvider } from "@/lib/dashboard-store"

export default function DashboardPage() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <DashboardProvider>
      <div className="min-h-screen bg-[#F1F4F8]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
          <SidebarContent />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-[#081C35]/60"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0 w-64 max-w-[80%] shadow-xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="lg:pl-64">
          <DashboardHeader onOpenSidebar={() => setMobileOpen(true)} />
          <main className="flex flex-col gap-6 p-4 sm:p-6">
            <MissionRow />
            <KpiCards />
            <SecondRow />
            <ThirdRow />
          </main>
        </div>
      </div>
    </DashboardProvider>
  )
}