"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Calculator, Menu, Users, X } from "lucide-react"
import { SidebarContent } from "@/components/dashboard/sidebar"

const modules = [
  { name: "Prospect CRM", href: "/dashboard/dispatch", icon: Users },
  { name: "Automated Freight Quoting", href: "/dashboard/dispatch/quoting", icon: Calculator },
]

export default function DispatchHqLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#F1F4F8]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-[#081C35]/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[80%] shadow-xl">
            <button type="button" aria-label="Close navigation menu" className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <div className="border-b border-white/10 bg-[#081C35] text-white">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <button type="button" aria-label="Open GBGS navigation" className="shrink-0 rounded-lg border border-white/15 p-2 text-white/80 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Dispatch HQ modules" className="min-w-0 flex-1 overflow-x-auto">
              <div className="flex min-w-max gap-1 lg:grid lg:min-w-0 lg:grid-cols-2">
                {modules.map((module) => {
                  const Icon = module.icon
                  const active = pathname === module.href || (module.href !== "/dashboard/dispatch" && pathname.startsWith(`${module.href}/`))
                  return (
                    <Link key={module.href} href={module.href} aria-current={active ? "page" : undefined} className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold transition ${active ? "bg-[#C9A227] text-[#081C35] shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      {module.name}
                    </Link>
                  )
                })}
              </div>
            </nav>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
