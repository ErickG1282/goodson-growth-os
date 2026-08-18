import type { LucideIcon } from "lucide-react"

export function LifeHqModulePlaceholder({
  name,
  description,
  icon: Icon,
}: {
  name: string
  description: string
  icon: LucideIcon
}) {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="h-2 bg-[#C9A227]" />
        <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#081C35] text-[#C9A227] shadow-lg">
            <Icon className="h-8 w-8" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[.24em] text-[#C9A227]">
            Life HQ Module
          </p>
          <h1 className="mt-2 text-3xl font-black text-[#081C35] sm:text-4xl">{name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{description}</p>
          <p className="mt-7 rounded-full bg-slate-100 px-5 py-2 text-sm font-bold text-slate-500">
            Coming in the next build phase
          </p>
        </div>
      </section>
    </main>
  )
}
