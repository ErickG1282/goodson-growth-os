import type { Metadata } from "next"
import { BenDashboard } from "./dashboard"

export const metadata: Metadata = {
  title: "BEN OS | Business Command Center",
  description: "Your authenticated organization business command center.",
}

export default function BenPage() {
  return <BenDashboard />
}
