"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, DollarSign, Target, Trophy } from "lucide-react"
import { supabase } from "@/lib/supabase"

type ProfileRow = {
  fleet_accounts_goal: number | null
}

type ProspectRow = {
  id: string
  status: string | null
  estimated_value: number | string | null
  next_follow_up: string | null
}

type TaskRow = {
  id: string
  status: string | null
  due_date: string | null
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function todayInput() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function cleanStatus(status: string | null | undefined) {
  return (status ?? "").trim().toLowerCase()
}

function isWon(status: string | null | undefined) {
  return cleanStatus(status) === "won"
}

function isLost(status: string | null | undefined) {
  return cleanStatus(status) === "lost"
}

function isCompleted(status: string | null | undefined) {
  return cleanStatus(status) === "completed"
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function KpiCard({
  title,
  value,
  subtitle,
  percent,
  icon,
  href,
}: {
  title: string
  value: string
  subtitle: string
  percent: number
  icon: React.ReactNode
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl bg-card p-6 shadow-[0_20px_60px_-30px_rgba(8,28,53,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-30px_rgba(8,28,53,0.35)] focus:outline-none focus:ring-2 focus:ring-[#C9A227] focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-bold text-[#081C35]">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#081C35] text-[#C9A227]">
          {icon}
        </div>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[#C9A227] transition-all"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">{subtitle}</p>
    </Link>
  )
}

export function KpiCards() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [prospects, setProspects] = useState<ProspectRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])

  async function loadData() {
    setLoading(true)
    setError("")

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (sessionError) {
      setError(sessionError.message)
      setLoading(false)
      return
    }

    if (!user) {
      setError("Sign in required.")
      setLoading(false)
      return
    }

    const [profileResult, prospectsResult, tasksResult] = await Promise.all([
      supabase
        .from("gbgs_user_profile")
        .select("fleet_accounts_goal")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("gbgs_fleet_prospects")
        .select("id,status,estimated_value,next_follow_up")
        .eq("user_id", user.id),
      supabase
        .from("gbgs_prospect_tasks")
        .select("id,status,due_date")
        .eq("user_id", user.id),
    ])

    if (profileResult.error) {
      setError(profileResult.error.message)
    } else {
      setProfile((profileResult.data ?? null) as ProfileRow | null)
    }

    if (prospectsResult.error) {
      setError(prospectsResult.error.message)
      setProspects([])
    } else {
      setProspects((prospectsResult.data ?? []) as ProspectRow[])
    }

    if (tasksResult.error) {
      console.error(tasksResult.error)
      setTasks([])
    } else {
      setTasks((tasksResult.data ?? []) as TaskRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const stats = useMemo(() => {
    const today = todayInput()
    const goal = profile?.fleet_accounts_goal ?? 2

    const wonAccounts = prospects.filter((prospect) => isWon(prospect.status)).length

    const pipelineValue = prospects
      .filter((prospect) => !isLost(prospect.status))
      .reduce((sum, prospect) => sum + toNumber(prospect.estimated_value), 0)

    const prospectFollowUpsDue = prospects.filter((prospect) => {
      if (!prospect.next_follow_up) return false
      if (isWon(prospect.status) || isLost(prospect.status)) return false
      return prospect.next_follow_up <= today
    }).length

    const openTasksDue = tasks.filter((task) => {
      if (!task.due_date) return false
      if (isCompleted(task.status)) return false
      return task.due_date <= today
    }).length

    const followUpsDue = prospectFollowUpsDue + openTasksDue

    return {
      goal,
      wonAccounts,
      pipelineValue,
      followUpsDue,
      fleetPercent: goal > 0 ? Math.round((wonAccounts / goal) * 100) : 0,
      pipelinePercent: pipelineValue > 0 ? Math.min(100, Math.round((pipelineValue / 25000) * 100)) : 0,
      followUpsPercent: followUpsDue > 0 ? Math.min(100, followUpsDue * 20) : 0,
    }
  }, [profile, prospects, tasks])

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
        KPI error: {error}
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        href="/dashboard/dispatch?type=Fleet&status=Won"
        title="Fleet Accounts"
        value={loading ? "..." : `${stats.wonAccounts} / ${stats.goal}`}
        subtitle="Won accounts from Dispatch CRM"
        percent={stats.fleetPercent}
        icon={<Target className="h-5 w-5" />}
      />
      <KpiCard
        href="/dashboard/dispatch?view=pipeline"
        title="Pipeline Value"
        value={loading ? "..." : money(stats.pipelineValue)}
        subtitle="Open monthly revenue opportunity"
        percent={stats.pipelinePercent}
        icon={<DollarSign className="h-5 w-5" />}
      />
      <KpiCard
        href="/dashboard/dispatch?status=Won"
        title="Won Accounts"
        value={loading ? "..." : String(stats.wonAccounts)}
        subtitle={`${money(stats.wonAccounts > 0 ? prospects.filter((p) => isWon(p.status)).reduce((sum, p) => sum + toNumber(p.estimated_value), 0) : 0)} monthly revenue won`}
        percent={stats.fleetPercent}
        icon={<Trophy className="h-5 w-5" />}
      />
      <KpiCard
        href="/dashboard/dispatch?view=follow-ups"
        title="Follow Ups Due"
        value={loading ? "..." : String(stats.followUpsDue)}
        subtitle="Open tasks and prospect follow-up dates due now"
        percent={stats.followUpsPercent}
        icon={<CalendarDays className="h-5 w-5" />}
      />
    </div>
  )
}
