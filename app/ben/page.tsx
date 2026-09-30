import type { Metadata } from "next"
import { BenDashboard } from "./dashboard"

export const metadata: Metadata = {
  title: "BEN OS | Berhane Abraha",
  description: "Your business command center — frontend preview with sample data.",
}

export default function BenPage() {
  return <BenDashboard />
}
