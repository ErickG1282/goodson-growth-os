import { Banknote, Building2, CreditCard, Landmark, Plus, WalletCards } from "lucide-react"

const summary = [
  { label: "Financial Institutions", icon: Building2 },
  { label: "Total Accounts", icon: WalletCards },
  { label: "Cash Accounts", icon: Banknote },
  { label: "Credit / Liability Accounts", icon: CreditCard },
]

function Section({ title, action, icon: Icon, empty }: { title: string; action: string; icon: typeof Landmark; empty: string }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex min-h-12 items-center justify-between gap-3 bg-[#081C35] px-4 py-2.5">
      <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-[#FBBF24]"/><h2 className="text-xs font-black uppercase text-white">{title}</h2></div>
      <button type="button" className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#FBBF24] bg-white px-3 py-2 text-xs font-black text-[#071F3D] shadow-sm transition-all duration-200 hover:border-[#FBBF24] hover:bg-[#FBBF24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 focus-visible:ring-offset-[#081C35]"><Plus className="h-4 w-4"/>{action}</button>
    </div>
    <div className="flex min-h-44 items-center justify-center p-6 text-center"><p className="text-sm font-medium text-slate-500">{empty}</p></div>
  </section>
}

export function FinancialAccountsInstitutions() {
  return <div className="min-h-[calc(100vh-61px)] bg-[#F1F4F8] text-[#081C35]">
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="mx-auto max-w-[1600px]"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#C58A00]">Financial HQ</p><h1 className="text-2xl font-black">ACCOUNTS &amp; INSTITUTIONS</h1><p className="mt-1 text-sm text-slate-500">Manage the financial institutions and accounts that power Financial HQ.</p></div></header>
    <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(({label,icon:Icon})=><article key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#081C35] text-[#FBBF24]"><Icon className="h-6 w-6"/></span><div><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">0</p></div></article>)}</div>
      <Section title="Financial Institutions" action="Add Institution" icon={Building2} empty="No financial institutions have been added yet."/>
      <Section title="Financial Accounts" action="Add Account" icon={WalletCards} empty="No financial accounts have been added yet."/>
    </main>
  </div>
}
