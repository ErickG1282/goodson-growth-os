"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { LogOut } from "lucide-react"
import { navItems } from "./nav-items"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

interface SidebarProps {
  onNavigate?: () => void
}

const routes: Record<string, string> = {
  Dashboard: "/dashboard",
  "Dispatch HQ": "/dashboard/dispatch",
  "Tire Shop HQ": "/dashboard/tire-shop",
  "Miz Rita HQ": "/dashboard/miz-rita",
  Kitchen: "/dashboard/kitchen",
  "Life HQ": "/dashboard/life",
  "Financial HQ": "/dashboard/life/financial",
  "CEO Review": "/dashboard/ceo-review",
  Calendar: "/dashboard/calendar",
  Reports: "/dashboard/reports",
  "SOP Library": "/dashboard/sop-library",
  Settings: "/dashboard/settings",
}

export function SidebarContent({ onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()

    if (error) {
      setSigningOut(false)
      return
    }

    onNavigate?.()
    router.replace("/")
  }

  return (
    <div className="flex h-full flex-col bg-[#061B33] text-white">
      <div className="flex items-center justify-center border-b border-white/10 px-6 py-6">
        <Image
          src="/gbgs-logo-transparent.png"
          alt="GBGS"
          width={180}
          height={126}
          priority
          className="h-auto w-36"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const href = routes[item.label] || "#"
            const financialActive = pathname === "/dashboard/life/financial" || pathname.startsWith("/dashboard/life/financial/")
            const active = item.label === "Life HQ"
              ? pathname.startsWith("/dashboard/life") && !financialActive
              : item.label === "Financial HQ"
                ? financialActive
                : pathname === href

            return (
              <li key={item.label}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/5 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#C9A227]" />
                  )}
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active
                        ? "text-[#C9A227]"
                        : "text-white/60 group-hover:text-[#C9A227]",
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <LogOut className="h-5 w-5" />
          {signingOut ? "Logging Out..." : "Log Out"}
        </button>
      </div>
    </div>
  )
}
