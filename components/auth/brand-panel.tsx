import Image from "next/image"

interface StatItemProps {
  value: string
  label: string
}

const stats: StatItemProps[] = [
  { value: "5", label: "Divisions" },
  { value: "24/7", label: "Access" },
  { value: "100%", label: "Ownership" },
]

function StatItem({ value, label }: StatItemProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-3xl font-bold text-[#C9A227] md:text-4xl">{value}</span>
      <span className="mt-1 text-sm font-medium text-white/80">{label}</span>
    </div>
  )
}

export function BrandPanel() {
  return (
    <section
      aria-label="GBGS command center overview"
      className="relative flex w-full flex-col items-center justify-center bg-[#081C35] px-8 py-16 lg:min-h-screen lg:w-1/2 lg:px-16"
    >
      <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
        {/* Logo — sits directly on the navy background, no container */}
        <Image
          src="/gbgs-logo-transparent.png"
          alt="GBGS — Goodson Business Growth System"
          width={420}
          height={294}
          priority
          className="block h-auto w-72 md:w-[420px]"
        />

        {/* Headline */}
        <h1 className="mt-8 text-2xl font-bold leading-tight text-white text-balance md:text-3xl">
          Run every division of your business from one command center.
        </h1>

        {/* Subtext */}
        <p className="mt-4 text-base leading-relaxed text-white/70 text-pretty md:text-lg">
          Dispatch, Tire Shop, Miz Rita, Life HQ, and CEO-level reporting — unified, measurable, and built for growth.
        </p>

        {/* Statistics */}
        <div className="mt-12 flex w-full items-start justify-center gap-10 md:gap-14">
          {stats.map((stat) => (
            <StatItem key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>
      </div>
    </section>
  )
}
