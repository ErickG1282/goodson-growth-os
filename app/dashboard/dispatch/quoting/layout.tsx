"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Building2, History, Map, Settings, SlidersHorizontal, Inbox, MailSearch } from "lucide-react"

const sections = [
  ["Quote Dashboard", "/dashboard/dispatch/quoting", BarChart3], ["Quote Requests", "/dashboard/dispatch/quoting/requests", Inbox],
  ["Email Intake", "/dashboard/dispatch/quoting/email-intake", MailSearch],
  ["Pricing Rules", "/dashboard/dispatch/quoting/pricing-rules", SlidersHorizontal], ["Lane Pricing", "/dashboard/dispatch/quoting/lane-pricing", Map],
  ["Customers", "/dashboard/dispatch/quoting/customers", Building2], ["Quote History", "/dashboard/dispatch/quoting/history", History],
  ["Settings", "/dashboard/dispatch/quoting/settings", Settings],
] as const
export default function QuotingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div><div className="border-b border-border bg-white"><nav aria-label="Automated Quoting sections" className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6"><div className="flex min-w-max gap-1 py-2">{sections.map(([name, href, Icon]) => { const active = pathname === href; return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${active ? "bg-[#081C35] text-white" : "text-muted-foreground hover:bg-muted hover:text-[#081C35]"}`}><Icon className={`h-4 w-4 ${active ? "text-[#C9A227]" : ""}`} />{name}</Link> })}</div></nav></div>{children}</div>
}
