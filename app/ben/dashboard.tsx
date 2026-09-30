"use client"

import { useRef, useState, type ReactNode } from "react"
import { ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, CircleDollarSign, CircleHelp, ClipboardCheck, Crown, FileText, LayoutDashboard, Menu, Package, ParkingSquare, Plus, Search, Settings, ShieldCheck, Sparkles, Truck, Users, Wallet, Wrench, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { financials, chart, businesses, initialActions, trucks, parking, tires, documents, opportunities, money } from "./mock-data"
import styles from "./ben.module.css"

const navigation = [
  { label: "Dashboard", id: "overview", icon: LayoutDashboard },
  { label: "Businesses", id: "businesses", icon: BriefcaseBusiness },
  { label: "Financials", id: "financials", icon: Wallet },
  { label: "Action Center", id: "actions", icon: Bell },
  { label: "Tasks", id: "actions", icon: ClipboardCheck },
  { label: "People", id: "people", icon: Users },
  { label: "Trucks & Trailers", id: "fleet", icon: Truck },
  { label: "Parking Lots", id: "parking", icon: ParkingSquare },
  { label: "Tire Shops", id: "inventory", icon: Wrench },
  { label: "Dispatch", id: "dispatch", icon: Truck },
  { label: "Inventory", id: "inventory", icon: Package },
  { label: "Documents", id: "documents", icon: FileText },
  { label: "Opportunities", id: "opportunities", icon: Sparkles },
  { label: "Reports", id: "reports", icon: ChartNoAxesCombined },
  { label: "Settings", id: "settings", icon: Settings },
]
const colors = ["#2999ff", "#27ce69", "#ff984a", "#a16ce9", "#fff09b", "#4cdae0", "#d4dce2"]

function Panel({ id, title, icon, extra, children }: { id?: string; title: string; icon?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return <Card id={id} className={styles.panel}><div className={styles.panelHeading}><h2>{icon}{title}</h2>{extra}</div>{children}</Card>
}
function Badge({ value }: { value: string }) {
  return <span className={styles.badge} data-status={value}>{value}</span>
}

export function BenDashboard() {
  const [period, setPeriod] = useState<"month" | "quarter">("month")
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState("Dashboard")
  const [completed, setCompleted] = useState<number[]>([])
  const [filter, setFilter] = useState("All")
  const [fleetFilter, setFleetFilter] = useState("All")
  const [query, setQuery] = useState("")
  const [detail, setDetail] = useState<{ title: string; body: string } | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [opportunityRows, setOpportunityRows] = useState(opportunities)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newStep, setNewStep] = useState("")
  const lastFocus = useRef<HTMLElement | null>(null)
  const data = financials[period]
  const pending = initialActions.length - completed.length
  const show = (title: string, body: string) => { lastFocus.current = document.activeElement as HTMLElement; setDetail({ title, body }) }
  const close = () => { setDetail(null); setAdding(false); lastFocus.current?.focus() }
  const viewAll = (title: string, body: string) => <button className={styles.viewAll} onClick={() => show(title, body)}>View All</button>
  const label = period === "month" ? "MTD" : "QTD"
  const metrics = [
    { title: `Total Revenue (${label})`, value: data.revenue, trend: data.revenueTrend, note: period === "month" ? "vs last month" : "vs last quarter", icon: CircleDollarSign, color: "green" },
    { title: `Total Expenses (${label})`, value: data.expenses, trend: data.expenseTrend, note: period === "month" ? "vs last month" : "vs last quarter", icon: BriefcaseBusiness, color: "red" },
    { title: `Net Cash Flow (${label})`, value: data.cashFlow, trend: data.cashTrend, note: "Cash received minus cash paid", icon: ChartNoAxesCombined, color: "blue" },
    { title: "Money Owed to You", value: data.owed, note: "12 customers / tenants", icon: Wallet, color: "gold" },
    { title: "Upcoming Bills", value: data.bills, note: "Due in the next 14 days", icon: CalendarDays, color: "purple" },
  ]
  const filteredActions = initialActions.filter(row => filter === "All" || row.group === filter)
  const fleetRows = trucks.filter(row => fleetFilter === "All" || row.status === fleetFilter)
  const results = [
    ...initialActions.map(row => ({ title: row.title, section: "Action Center", id: "actions" })),
    ...trucks.map(row => ({ title: `Unit ${row.unit} · ${row.driver}`, section: "Fleet", id: "fleet" })),
    ...parking.map(row => ({ title: `${row.name} · ${row.address}`, section: "Parking", id: "parking" })),
    ...tires.map(row => ({ title: row.name, section: "Inventory", id: "inventory" })),
    ...documents.map(row => ({ title: row.name, section: "Documents", id: "documents" })),
    ...opportunityRows.map(row => ({ title: row.name, section: "Opportunities", id: "opportunities" })),
  ].filter(row => row.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
  return <div className={styles.root}>
    <a className={styles.skip} href="#main-content">Skip to dashboard</a>
    <aside className={styles.sidebar}>
      <a href="/ben" className={styles.brand}><Crown size={43} fill="currentColor" strokeWidth={1} /><strong>BEN OS</strong><span>BERHANE ABRAHA</span><small>BUSINESS OPERATING SYSTEM</small></a>
      <button className={styles.mobileToggle} aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="ben-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav id="ben-navigation" aria-label="Ben OS navigation" className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ""}`}>
        {navigation.map(({ label: name, id, icon: Icon }) => ["people", "dispatch", "reports", "settings"].includes(id)
          ? <button key={name} onClick={() => { setMenuOpen(false); show(name, id === "people" ? "Sample team: Berhane · Owner; Peter · Fleet & parking; Erick · Tire operations; Melissa · Dispatch. Live people management is not connected." : `${name} is a frontend preview. Live management will be connected in a later phase.`) }}><Icon size={19} /><span>{name}</span></button>
          : <a key={name} href={`#${id}`} aria-current={active === name ? "location" : undefined} onClick={() => { setActive(name); setMenuOpen(false) }}><Icon size={19} /><span>{name}</span>{(name === "Action Center" || name === "Tasks") && <b>{pending}</b>}{name === "Documents" && <b>{documents.length}</b>}</a>)}
      </nav>
      <div className={styles.sidebarBottom}><div className={styles.profile}><span>BA</span><div>Berhane Abraha<small>Owner / Operator</small></div></div><button onClick={() => show("Ben OS preview", "All records are mock data. Filters, action resolution, search, record previews, and saved opportunities work locally. Changes reset on reload. Authentication has not been changed.")}><CircleHelp size={17} />Preview information</button></div>
    </aside>
    <div className={styles.workspace} id="overview">
      <header className={styles.topbar}>
        <div className={styles.welcome}><h1>Good Morning, Berhane Abraha</h1><p>Here’s what’s happening across all your businesses today.</p></div>
        <div className={styles.headerTools}><div className={styles.search}><Search size={17} /><input aria-label="Search dashboard" placeholder="Search anything..." value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery("") }} />{query && <div className={styles.searchResults} aria-label="Search results">{results.length ? results.map((row, index) => <a key={`${row.id}-${index}`} href={`#${row.id}`} onClick={() => setQuery("")}><strong>{row.title}</strong><small>{row.section}</small></a>) : <p>No matching sample records.</p>}</div>}</div><button className={styles.notification} aria-label={`${pending} pending action items`} onClick={() => document.getElementById("actions")?.scrollIntoView({ behavior: "smooth" })}><Bell size={23} /><b>{pending}</b></button><span className={styles.date}>Wed, Sep 30, 2026 <span>8:24 AM</span></span></div>
      </header>
      <main id="main-content" className={styles.main}>
        <section id="financials" aria-label={`Financial summary for ${data.label}`} className={styles.kpis}>{metrics.map(({ title, value, note, trend, icon: Icon, color }) => <Card key={title} className={styles.kpi}><span className={styles.metricIcon} data-color={color}><Icon size={27} /></span><div><span className={styles.metricTitle}>{title}</span><div className={styles.metricValue}><strong>{money(value)}</strong>{trend && <span data-expense={color === "red"}>{trend}</span>}</div><small>{note}</small></div></Card>)}</section>
        <div className={styles.charts}>
          <Panel title="Revenue vs Expenses" extra={<select className={styles.period} aria-label="Financial reporting period" value={period} onChange={event => setPeriod(event.target.value as "month" | "quarter")}><option value="month">This Month</option><option value="quarter">This Quarter</option></select>}>
            <div className={styles.chartLegend}><span><i />Revenue</span><span><i />Expenses</span></div>
            <div className={styles.chart} role="img" aria-label="Monthly revenue and expenses from April to September, in thousands of dollars. Exact values available below."><div className={styles.yAxis}>{[250, 200, 150, 100, 50, 0].map(value => <span key={value}>{value ? `$${value}K` : "$0"}</span>)}</div><div className={styles.plot}>{chart.months.map((month, index) => <div key={month} className={styles.barGroup}><div className={styles.barPair}><div title={`${month} revenue: ${money(chart.income[index] * 1000)}`} style={{ height: `${chart.income[index] / 250 * 100}%` }} /><div title={`${month} expenses: ${money(chart.costs[index] * 1000)}`} style={{ height: `${chart.costs[index] / 250 * 100}%` }} /></div><span>{month}</span></div>)}</div></div>
            <details className={styles.chartData}><summary>View monthly chart data</summary><table><thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th></tr></thead><tbody>{chart.months.map((month, i) => <tr key={month}><th>{month}</th><td>{money(chart.income[i] * 1000)}</td><td>{money(chart.costs[i] * 1000)}</td></tr>)}</tbody></table></details>
          </Panel>
          <Panel id="businesses" title={`Profit by Business (${label})`}><div className={styles.profitRows}>{businesses.map((name, index) => <div key={name}><span className={styles.businessIcon} style={{ background: colors[index] }}><BriefcaseBusiness size={13} /></span><span>{name}</span><div className={styles.profitTrack}><span style={{ width: `${data.business[index] / Math.max(...data.business) * 100}%`, background: colors[index] }} /></div><strong>{money(data.business[index])}</strong></div>)}</div></Panel>
          <Panel id="actions" title="Action Center" icon={<Bell size={17} />} extra={<button className={styles.viewAll} onClick={() => setFilter("All")}>View All ({initialActions.length})</button>}>
            <div className={styles.tabs} aria-label="Filter actions">{["All", "Overdue", "This Week", "Upcoming"].map(name => <button key={name} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} ({name === "All" ? initialActions.length : initialActions.filter(row => row.group === name).length})</button>)}</div>
            <div className={styles.tableWrap}><table className={styles.actionTable}><thead><tr><th><span className={styles.srOnly}>Resolve</span></th><th>Task / Issue</th><th>Business</th><th>Due Date</th><th>Assigned</th><th>Priority</th></tr></thead><tbody>{filteredActions.map(action => <tr key={action.id} className={completed.includes(action.id) ? styles.resolved : ""}><td><button className={styles.resolve} data-priority={action.priority} aria-label={`${completed.includes(action.id) ? "Reopen" : "Resolve"} ${action.title}`} onClick={() => setCompleted(current => current.includes(action.id) ? current.filter(id => id !== action.id) : [...current, action.id])}>{completed.includes(action.id) ? <Check size={13} /> : <span />}</button></td><td>{action.title}</td><td>{action.business}</td><td className={action.group === "Overdue" ? styles.overdue : ""}>{action.due}</td><td>{action.assignee}</td><td><Badge value={completed.includes(action.id) ? "Resolved" : action.priority} /></td></tr>)}</tbody></table></div>
          </Panel>
        </div>
        <div className={styles.operations}>
          <Panel id="fleet" title="Trucks & Trailers" icon={<Truck size={17} />} extra={<button className={styles.viewAll} onClick={() => setFleetFilter("All")}>View All</button>}>
            <div className={styles.tabs} aria-label="Filter fleet">{["Active", "Maintenance", "Inactive"].map(status => <button key={status} aria-pressed={fleetFilter === status} onClick={() => setFleetFilter(fleetFilter === status ? "All" : status)}>{status} <Badge value={String(trucks.filter(row => row.status === status).length)} /></button>)}</div>
            <div className={styles.tableWrap}><table><thead><tr><th>Unit #</th><th>Type</th><th>Driver</th><th>Status</th></tr></thead><tbody>{fleetRows.map(row => <tr key={row.unit}><td><button className={styles.recordLink} onClick={() => show(`Unit ${row.unit}`, `${row.type} · Driver: ${row.driver} · ${row.status}. Sample fleet record; live tracking is not connected.`)}>{row.unit}</button></td><td>{row.type}</td><td>{row.driver}</td><td><Badge value={row.status} /></td></tr>)}</tbody></table></div>
          </Panel>
          <Panel id="parking" title="Parking Lots" icon={<ParkingSquare size={17} />} extra={viewAll("Parking locations", parking.map(row => `${row.name}: ${row.address}, ${row.used}/${row.total} occupied, ${row.unpaid} unpaid accounts.`).join("\n"))}>
            <div className={styles.tableWrap}><table className={styles.parkingTable}><thead><tr><th>Location</th><th>Occupancy</th><th>Monthly<br />Revenue</th><th>Unpaid</th></tr></thead><tbody>{parking.map(row => <tr key={row.name}><td>{row.name}</td><td><strong>{row.used} / {row.total}</strong><meter min={0} max={row.total} value={row.used} aria-label={`${row.name} occupancy`} /></td><td>{money(row.revenue)}</td><td className={styles.overdue}>{row.unpaid}</td></tr>)}</tbody></table></div>
          </Panel>
          <Panel id="inventory" title="Tire Shop Inventory" icon={<Wrench size={17} />} extra={viewAll("Inventory summary", tires.map(row => `${row.name}: ${row.stock} in stock; reorder level ${row.reorder}.`).join("\n"))}>
            <div className={styles.tableWrap}><table className={styles.inventoryTable}><thead><tr><th>Item</th><th>In Stock</th><th>Reorder<br />Level</th><th>Status</th></tr></thead><tbody>{tires.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.stock}</td><td>{row.reorder}</td><td><Badge value={row.stock < row.reorder ? "Low" : "Good"} /></td></tr>)}</tbody></table></div>
          </Panel>
          <Panel id="documents" title="Important Documents" icon={<FileText size={17} />} extra={viewAll("Important Documents", "Six sample compliance records. Select a document to preview its business, expiration, and status. No real files are attached.")}>
            <div className={styles.tableWrap}><table className={styles.documentTable}><thead><tr><th>Document</th><th>Business / Asset</th><th>Expiration</th><th>Status</th></tr></thead><tbody>{documents.map(row => <tr key={row.name}><td><button className={styles.recordLink} aria-label={`View ${row.name}`} onClick={() => show(row.name, `${row.business} · Expires ${row.date} · ${row.status}. Sample record only; no document file is attached.`)}>{row.name}</button></td><td>{row.business}</td><td className={row.status === "Urgent" ? styles.overdue : ""}>{row.date}</td><td><Badge value={row.status} /></td></tr>)}</tbody></table></div>
          </Panel>
        </div>
        <Panel id="opportunities" title="New Opportunities" icon={<Sparkles size={18} className={styles.goldIcon} />} extra={viewAll("New Opportunities", opportunityRows.map(row => `${row.name}: ${row.status}, ${row.progress}% — ${row.nextStep}`).join("\n"))}>
          <div className={styles.opportunities}>{opportunityRows.map(row => <div key={row.name} className={styles.opportunity}><strong>{row.name}</strong><div><progress max={100} value={row.progress} aria-label={`${row.name} progress`} /><span>{row.progress}%</span></div><span title={row.status}>{row.nextStep}<small>{row.status}</small></span><button aria-label={`${saved.includes(row.name) ? "Unsave" : "Save"} ${row.name}`} aria-pressed={saved.includes(row.name)} onClick={() => setSaved(current => current.includes(row.name) ? current.filter(name => name !== row.name) : [...current, row.name])}>{saved.includes(row.name) ? <Check size={13} /> : <Plus size={13} />}</button></div>)}<Button className={styles.addButton} onClick={() => { lastFocus.current = document.activeElement as HTMLElement; setAdding(true) }}><Plus size={16} />Add Opportunity</Button></div>
          <span className={styles.srOnly} aria-live="polite">{saved.length} opportunities saved this session</span>
        </Panel>
        <footer className={styles.footer}><span><ShieldCheck size={12} />Mock data · Frontend preview</span><span>BEN OS · September 2026</span></footer>
      </main>
    </div>
    {(detail || adding) && <div className={styles.modalBackdrop} onClick={close}><div role="dialog" aria-modal="true" aria-labelledby="ben-detail-title" className={styles.modal} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") close(); if (event.key === "Tab") { const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input')); const first = fields[0]; const last = fields[fields.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } } }}>
      {adding ? <form onSubmit={event => { event.preventDefault(); const name = newName.trim(); if (!name) return; if (opportunityRows.some(row => row.name.toLowerCase() === name.toLowerCase())) return; setOpportunityRows(current => [...current, { name, status: "New", progress: 0, nextStep: newStep.trim() || "Define next step" }]); setNewName(""); setNewStep(""); close() }}><h2 id="ben-detail-title">Add Opportunity</h2><p>Saved in this preview session only.</p><label>Opportunity name<input autoFocus required maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} /></label><label>Next step<input maxLength={100} value={newStep} onChange={event => setNewStep(event.target.value)} /></label>{opportunityRows.some(row => row.name.toLowerCase() === newName.trim().toLowerCase()) && <p role="alert">This opportunity already exists.</p>}<div className={styles.modalButtons}><Button type="button" onClick={close}>Cancel</Button><Button type="submit" className={styles.addButton}>Add Opportunity</Button></div></form> : <><h2 id="ben-detail-title">{detail?.title}</h2><p>{detail?.body}</p><Button autoFocus className={styles.addButton} onClick={close}>Close preview</Button></>}
    </div></div>}
  </div>
}
