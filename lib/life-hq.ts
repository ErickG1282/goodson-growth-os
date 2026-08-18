export type LifeArea =
  | "GBGS"
  | "Miz Rita Kitchen OS"
  | "Other Client Systems"
  | "Dispatch / Abraha"
  | "Tire Shop"
  | "Business Development"
  | "Family"
  | "Fitness"
  | "Faith"
  | "Financial"
  | "Personal"

export type LifeCalendarEvent = {
  id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  category: string | null
  notes: string | null
  completed: boolean
  source: string | null
  source_id: string | null
}

export type TimeBlockForm = {
  title: string
  area: LifeArea
  startTime: string
  endTime: string
  notes: string
}

export const LIFE_AREAS: LifeArea[] = [
  "GBGS",
  "Miz Rita Kitchen OS",
  "Other Client Systems",
  "Dispatch / Abraha",
  "Tire Shop",
  "Business Development",
  "Family",
  "Fitness",
  "Faith",
  "Financial",
  "Personal",
]

export const PERSONAL_AREAS: LifeArea[] = ["Faith", "Fitness", "Family", "Financial", "Personal"]

export const WORK_AREAS = new Set<LifeArea>([
  "GBGS",
  "Miz Rita Kitchen OS",
  "Other Client Systems",
  "Dispatch / Abraha",
  "Tire Shop",
  "Business Development",
])

export const EMPTY_TIME_BLOCK: TimeBlockForm = {
  title: "",
  area: "GBGS",
  startTime: "",
  endTime: "",
  notes: "",
}

export const LIFE_AREA_STYLES: Record<LifeArea, string> = {
  GBGS: "bg-blue-100 text-blue-800",
  "Miz Rita Kitchen OS": "bg-purple-100 text-purple-800",
  "Other Client Systems": "bg-cyan-100 text-cyan-800",
  "Dispatch / Abraha": "bg-indigo-100 text-indigo-800",
  "Tire Shop": "bg-green-100 text-green-800",
  "Business Development": "bg-amber-100 text-amber-800",
  Family: "bg-rose-100 text-rose-800",
  Fitness: "bg-emerald-100 text-emerald-800",
  Faith: "bg-[#C9A227]/15 text-[#7A6115]",
  Financial: "bg-teal-100 text-teal-800",
  Personal: "bg-slate-100 text-slate-700",
}

export const META_PREFIX = "GBGS_META::"
export const META_SEPARATOR = "::GBGS_NOTES::"

const MOTIVATION = [
  "Protect the priorities that build the life you are working for.",
  "Focused effort today creates freedom tomorrow.",
  "Lead the day before the day starts leading you.",
  "Progress is built by keeping the promises you make to yourself.",
  "Give every important part of your life a place on the calendar.",
  "Move with purpose, stay faithful, and finish what matters.",
  "A balanced day is not accidental. Plan it, protect it, and live it.",
]

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function dailyMotivation(dateKey: string) {
  const value = [...dateKey].reduce((total, character) => total + character.charCodeAt(0), 0)
  return MOTIVATION[value % MOTIVATION.length]
}

export function compatibleCategory(area: LifeArea) {
  if (area === "Dispatch / Abraha") return "Dispatch"
  if (area === "Tire Shop") return "Tire Shop"
  if (area === "Miz Rita Kitchen OS") return "Miz Rita"
  if (area === "Family") return "Family"
  if (area === "Fitness") return "Health"
  if (area === "Faith") return "Faith"
  return "Personal"
}

export function packLifeNotes(notes: string, area: LifeArea) {
  const meta = { priority: "Medium", repeat: "None", reminder: "None", lifeArea: area }
  return `${META_PREFIX}${JSON.stringify(meta)}${META_SEPARATOR}${notes.trim()}`
}

export function unpackLifeNotes(rawNotes: string | null) {
  if (!rawNotes?.startsWith(META_PREFIX)) return { notes: rawNotes ?? "", area: null as LifeArea | null }
  try {
    const rest = rawNotes.slice(META_PREFIX.length)
    const [metaJson, notes = ""] = rest.split(META_SEPARATOR)
    const area = (JSON.parse(metaJson) as { lifeArea?: string }).lifeArea
    return { notes, area: LIFE_AREAS.includes(area as LifeArea) ? area as LifeArea : null }
  } catch {
    return { notes: rawNotes, area: null as LifeArea | null }
  }
}

export function lifeAreaFor(event: LifeCalendarEvent): LifeArea {
  const storedArea = unpackLifeNotes(event.notes).area
  if (storedArea) return storedArea
  const mapping: Record<string, LifeArea> = {
    Dispatch: "Dispatch / Abraha",
    "Tire Shop": "Tire Shop",
    "Miz Rita": "Miz Rita Kitchen OS",
    Family: "Family",
    Health: "Fitness",
    Faith: "Faith",
    Personal: "Personal",
  }
  return mapping[event.category ?? ""] ?? "Personal"
}

export function timeMinutes(value: string | null) {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function durationHours(event: LifeCalendarEvent) {
  const start = timeMinutes(event.start_time)
  const end = timeMinutes(event.end_time)
  if (start === null || end === null || end <= start) return 0
  return (end - start) / 60
}

export function formatHours(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? "hr" : "hrs"}`
}

export function formatTime(value: string | null) {
  if (!value) return "Anytime"
  const [hourValue, minute = "00"] = value.split(":")
  const hour = Number(hourValue)
  if (!Number.isFinite(hour)) return value
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`
}

export function calculateAllocation(events: LifeCalendarEvent[]) {
  const byArea = new Map<LifeArea, number>()
  events.forEach((event) => {
    const area = lifeAreaFor(event)
    byArea.set(area, (byArea.get(area) ?? 0) + durationHours(event))
  })
  const total = [...byArea.values()].reduce((sum, value) => sum + value, 0)
  const work = [...byArea.entries()].filter(([area]) => WORK_AREAS.has(area)).reduce((sum, [, value]) => sum + value, 0)
  const warnings = PERSONAL_AREAS.filter((area) => !(byArea.get(area) ?? 0)).map((area) => `No ${area} time is scheduled.`)
  return { total, work, byArea, warnings }
}
