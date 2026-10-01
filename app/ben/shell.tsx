"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Bell, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Crown, FileText, Gauge, LayoutDashboard, LogOut, Menu, Package, ParkingSquare, RefreshCw, Search, Settings, ShieldCheck, Truck, Users, Wallet, Wrench, X } from "lucide-react"
import styles from "./ben.module.css"

const navigation = [
 {id:"overview",label:"Dashboard",icon:LayoutDashboard}, {id:"businesses",label:"Businesses",icon:BriefcaseBusiness}, {id:"financials",label:"Financials",icon:Wallet}, {id:"action-center",label:"Action Center",icon:Bell}, {id:"tasks",label:"Tasks",icon:ClipboardList}, {id:"people",label:"People",icon:Users}, {id:"trucks",label:"Trucks & Trailers",icon:Truck}, {id:"parking",label:"Parking Lots",icon:ParkingSquare}, {id:"tire-shops",label:"Tire Shops",icon:Wrench}, {id:"dispatch",label:"Dispatch",icon:Truck}, {id:"inventory",label:"Inventory",icon:Package}, {id:"documents",label:"Documents",icon:FileText}, {id:"opportunities",label:"Opportunities",icon:Gauge}, {id:"reports",label:"Reports",icon:ChartNoAxesCombined}, {id:"settings",label:"Settings",icon:Settings},
]

export function BenShell({ children, organizationName, role, connected = false, onRefresh, onSignOut, toolbar, userEmail, notificationCount = 0, onSearch, initialDate }: {
  children: ReactNode; organizationName?: string; role?: string; connected?: boolean;
  onRefresh?: () => void; onSignOut?: () => Promise<string | null>; toolbar?: ReactNode; userEmail?: string; notificationCount?: number; onSearch?: (query: string) => void; initialDate?: Date
}) {
  const [clock, setClock] = useState(initialDate ?? new Date())
  const [search, setSearch] = useState("")
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 60000); return () => clearInterval(timer) }, [])
  const greeting = clock.getHours() < 12 ? "Good Morning" : clock.getHours() < 18 ? "Good Afternoon" : "Good Evening"
  const [active, setActive] = useState("overview")
  useEffect(() => {
    if (!connected) return
    const sync = () => {
      const id = window.location.hash.slice(1)
      setActive(navigation.some(row => row.id === id) ? id : "overview")
    }
    sync(); window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [connected])
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState("")
  const drawer = useRef<HTMLDialogElement>(null)
  const closeDrawer = () => drawer.current?.close()
  const navigationContent = <>
    <a href="/ben" className={styles.brand} aria-label="Ben OS home"><Crown size={38} /><strong>BEN OS</strong><span>{organizationName ?? "Your business command center"}</span><small>BUSINESS OPERATING SYSTEM</small></a>
    <nav className={styles.navigation} aria-label="Ben OS navigation">
      {navigation.map(({ id, label, icon: Icon }) => <div key={id}>{connected
        ? <a href={`#${id}`} key={id} aria-current={active === id ? "location" : undefined} onClick={() => { setActive(id); closeDrawer() }}><Icon size={19} /><span>{label}</span></a>
        : <button key={id} disabled><Icon size={19} /><span>{label}</span></button>}</div>)}
    </nav>
    <div className={styles.sidebarFoot}>
      {role && <div className={styles.memberProfile}><span>{organizationName?.split(" ").slice(0, 2).map(word => word[0]).join("")}</span><div><strong>{organizationName ?? "Signed-in account"}</strong><small>{role === "owner" ? "Owner / Operator" : `${role} access`}</small>{userEmail && <small>{userEmail}</small>}</div></div>}
      {onSignOut && <button className={styles.signOut} disabled={signingOut} onClick={async () => {
        setSigningOut(true); setSignOutError("")
        try { setSignOutError(await onSignOut() ?? "") } catch { setSignOutError("Could not sign out. Please try again.") }
        finally { setSigningOut(false) }
      }}><LogOut size={17} />{signingOut ? "Signing out…" : "Log Out"}</button>}
      {signOutError && <p className={styles.errorText} role="alert">{signOutError}</p>}
    </div>
  </>
  return <div className={styles.root}>
    <a className={styles.skip} href="#ben-main">Skip to workspace</a>
    <aside className={styles.sidebar}>{navigationContent}</aside>
    <dialog ref={drawer} className={styles.drawer} aria-label="Ben OS navigation menu" onClick={event => { if (event.target === event.currentTarget) closeDrawer() }}>
      <button className={styles.drawerClose} aria-label="Close navigation menu" onClick={closeDrawer}><X size={20} /></button>{navigationContent}
    </dialog>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.headerIdentity}><button className={styles.mobileToggle} aria-label="Open navigation menu" onClick={() => drawer.current?.showModal()}><Menu size={23} /></button><div><strong>{connected ? `${greeting}, ${organizationName ?? "your organization"}` : "Welcome to your workspace"}</strong><small className={styles.headerSubtitle}>Here's what's happening across all your businesses today.</small></div></div>
        <div className={styles.headerActions}>{onSearch && <form className={styles.headerSearch} title="Search your business directory" onSubmit={event => { event.preventDefault(); onSearch(search) }}><Search size={16} /><input aria-label="Search anything" placeholder="Search anything..." value={search} onChange={event => setSearch(event.target.value)} /><button type="submit" aria-label="Search workspace"><Search size={14} /></button></form>}{toolbar}<a className={styles.notificationBell} href="#action-center" aria-label={`Action Center, ${notificationCount} recorded issues`}><Bell size={22} />{notificationCount > 0 && <span>{notificationCount}</span>}</a><time className={styles.clock} dateTime={clock.toISOString()}>{clock.toLocaleDateString("en-US", {weekday:"short",month:"short",day:"numeric",year:"numeric"})}<b>{clock.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</b></time>{onRefresh && <button className={styles.refreshIcon} aria-label="Refresh workspace" onClick={onRefresh}><RefreshCw size={17} /></button>}</div>
      </header>
      <main id="ben-main" className={styles.main}>{children}</main>
      <footer className={styles.footer}><span><Crown size={13} />BEN OS · Built for ownership</span><span><ShieldCheck size={13} />Organization-scoped access</span></footer>
    </div>
  </div>
}
