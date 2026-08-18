import {
  LayoutDashboard,
  Truck,
  Wrench,
  UtensilsCrossed,
  HeartPulse,
  WalletCards,
  ClipboardCheck,
  Calendar,
  BarChart3,
  BookOpen,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  icon: LucideIcon
  active?: boolean
}

export const navItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Dispatch HQ", icon: Truck },
  { label: "Tire Shop HQ", icon: Wrench },
  { label: "Miz Rita HQ", icon: UtensilsCrossed },
  { label: "Life HQ", icon: HeartPulse },
  { label: "Financial HQ", icon: WalletCards },
  { label: "CEO Review", icon: ClipboardCheck },
  { label: "Calendar", icon: Calendar },
  { label: "Reports", icon: BarChart3 },
  { label: "SOP Library", icon: BookOpen },
  { label: "Settings", icon: Settings },
]
