"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, BriefcaseBusiness, Building2, CircleDollarSign, CreditCard, Landmark, LayoutDashboard, PiggyBank, ReceiptText, Target, TrendingUp } from "lucide-react"

const sections = [
  { name: "Overview", href: "/dashboard/life/financial", icon: LayoutDashboard },
  { name: "Accounts & Institutions", href: "/dashboard/life/financial/accounts", icon: Building2 },
  { name: "Cash Flow", href: "/dashboard/life/financial/cash-flow", icon: TrendingUp },
  { name: "Budget & Spending", href: "/dashboard/life/financial/budget", icon: Target },
  { name: "Bills & Obligations", href: "/dashboard/life/financial/bills", icon: ReceiptText },
  { name: "Debt Payoff", href: "/dashboard/life/financial/debt", icon: CreditCard },
  { name: "Businesses & Ownership", href: "/dashboard/life/financial/businesses", icon: BriefcaseBusiness },
  { name: "Investments & Assets", href: "/dashboard/life/financial/investments", icon: Landmark },
  { name: "Savings Goals", href: "/dashboard/life/financial/savings", icon: PiggyBank },
  { name: "Net Worth", href: "/dashboard/life/financial/net-worth", icon: CircleDollarSign },
  { name: "Wealth Progress", href: "/dashboard/life/financial/wealth-progress", icon: BarChart3 },
]

export default function FinancialLayout({children}:{children:React.ReactNode}){const pathname=usePathname();return <><div className="border-b border-white/10 bg-[#081C35] text-white"><nav aria-label="Financial HQ sections" className="overflow-x-auto px-4 py-3 sm:px-6"><div className="mx-auto flex w-max min-w-full max-w-[1600px] gap-1">{sections.map(section=>{const Icon=section.icon,active=section.href==="/dashboard/life/financial"?pathname===section.href:pathname===section.href||pathname.startsWith(`${section.href}/`);return <Link key={section.href} href={section.href} aria-current={active?"page":undefined} className={`flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-bold transition ${active?"bg-[#FBBF24] text-[#071F3D] shadow-sm":"text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4"/>{section.name}</Link>})}</div></nav></div>{children}</>}
