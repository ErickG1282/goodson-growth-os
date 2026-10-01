"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRight, Bell, Building2, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, CheckCircle2, CircleDollarSign, ClipboardList, FileText, Gauge, Grid2X2, ParkingSquare, Plus, Search, ShieldCheck, Truck, Users, Wallet, Wrench, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BenShell } from "./shell"
import { canReadFinancials, money, numeric, summarizeFinancials, reportingDates, type BenData, type Business } from "./data"
import styles from "./ben.module.css"
import dense from "./executive.module.css"
import { FinancialRecords } from "./command-center"

export type ReadyData = Extract<BenData, { status: "ready" }>
const humanize = (value: string) => value.replace(/[_-]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase())
function businessIcon(type: string) {
  if (/tire|repair|shop/.test(type)) return Wrench
  if (/parking|lot/.test(type)) return ParkingSquare
  if (/truck|transport|dispatch/.test(type)) return Truck
  return BriefcaseBusiness
}
function Module({ id, title, icon, children, link }: { id?: string; title: string; icon?: ReactNode; children: ReactNode; link?: string }) {
  return <section id={id} className={dense.module}><header><h2>{icon}{title}</h2>{link && <a href={link}>View All<ArrowRight size={13} /></a>}</header>{children}</section>
}
function Empty({ text, note }: { text: string; note?: string }) { return <div className={dense.empty}><span>{text}</span>{note && <small>{note}</small>}</div> }
function OperationalTable({ headings, text, note }: { headings: string[]; text: string; note: string }) {
  return <div className={dense.tableWrap} tabIndex={0} role="region" aria-label={headings.join(", ")}><table className={dense.operationalTable}><thead><tr>{headings.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody><tr><td colSpan={headings.length}><Empty text={text} note={note} /></td></tr></tbody></table></div>
}
export type DashboardAction = { id: string; text: string; business: string; due: string | null; overdue: boolean }
export function dashboardActions(data: ReadyData, now: Date): DashboardAction[] {
  const name = (id?: string | null) => id ? data.businesses.find(row => row.id === id)?.name ?? "Business unavailable" : "Organization"
  const today = reportingDates(now).today
  const rows: DashboardAction[] = data.businesses.filter(row => row.status === "inactive").map(row => ({ id: row.id, text: "Business marked inactive", business: row.name, due: null, overdue: false }))
  if (canReadFinancials(data.organization.role) && data.financials) {
    for (const row of data.financials.receivables) if (!["paid", "cancelled"].includes(row.status) && numeric(row.amount_due) > numeric(row.amount_paid)) rows.push({ id: `r-${row.id}`, text: `Outstanding receivable · ${row.customer_name ?? "Customer"}`, business: name(row.business_id), due: row.due_date ?? null, overdue: row.status === "overdue" || !!(row.due_date && row.due_date < today) })
    for (const row of data.financials.bills) if (!["paid", "cancelled"].includes(row.status) && numeric(row.amount) > 0) rows.push({ id: `b-${row.id}`, text: `Unpaid bill · ${row.vendor_name ?? "Vendor"}`, business: name(row.business_id), due: row.due_date, overdue: row.status === "overdue" || row.due_date < today })
  }
  return rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due ?? "9999").localeCompare(b.due ?? "9999"))
}
export function BusinessDetails({ business, data, onClose }: { business: Business; data: ReadyData; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const figure = canReadFinancials(data.organization.role) ? data.financials?.businesses.find(row => row.id === business.id) : undefined
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={styles.businessDialog} aria-labelledby="ben-business-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
    <div className={styles.dialogHeader}><span className={styles.businessSymbol}><Building2 size={24} /></span><button aria-label="Close business details" onClick={() => dialog.current?.close()}><X size={22} /></button></div>
    <p className={styles.eyebrow}>{humanize(business.business_type)}</p><h2 id="ben-business-title">{business.name}</h2><span className={styles.badge} data-status={business.status}>{humanize(business.status)}</span>
    <p className={styles.dialogDescription}>{business.description ?? "No business description has been added."}</p>
    <dl className={styles.detailFacts}><div><dt>Organization</dt><dd>{data.organization.name}</dd></div><div><dt>Business type</dt><dd>{humanize(business.business_type)}</dd></div></dl>
    {figure ? <><h3>Stored monthly business figures</h3><div className={styles.detailFinancials}><div><span>Revenue</span><strong>{money(numeric(figure.monthly_revenue))}</strong></div><div><span>Expenses</span><strong>{money(numeric(figure.monthly_expenses))}</strong></div><div><span>Ownership</span><strong>{figure.ownership_percentage === null ? "Not recorded" : `${numeric(figure.ownership_percentage)}%`}</strong></div></div><p className={styles.caption}>Business profile figures are separate from transaction totals.</p></>
      : <p className={styles.secureNotice}><ShieldCheck size={17} />{canReadFinancials(data.organization.role) ? "Business financial figures are currently unavailable." : "Financial figures require owner, admin, or manager access."}</p>}
    <FinancialRecords data={data} businessId={business.id} /><Button className={styles.primaryButton} onClick={() => dialog.current?.close()}>Back to portfolio<CheckCircle2 size={17} /></Button>
  </dialog>
}


export function BenWorkspace({ data, refresh, selectOrganization, onSignOut, now = new Date() }: { data: ReadyData; refresh: () => void; selectOrganization: (id: string) => void; onSignOut: () => Promise<string | null>; now?: Date }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState("all")
  const [status, setStatus] = useState("all")
  const [selected, setSelected] = useState<Business | null>(null)
  const [tab, setTab] = useState("All")
  const [vehicleFilter, setVehicleFilter] = useState("Active")
  const [chartMonths, setChartMonths] = useState("6")
  const restricted = !canReadFinancials(data.organization.role)
  const financials = restricted ? null : data.financials
  const summary = financials ? summarizeFinancials(financials, "month", now) : null
  const dates = reportingDates(now)
  const actions = dashboardActions(data, now)
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
  const weekEndDay = reportingDates(weekEnd).today
  const matches = (item: DashboardAction, filter: string) => filter === "All" || (filter === "Overdue" ? item.overdue : filter === "This Week" ? !!item.due && !item.overdue && item.due >= dates.today && item.due <= weekEndDay : !!item.due && !item.overdue && item.due > weekEndDay)
  const filteredActions = actions.filter(row => matches(row, tab))
  const filtered = data.businesses.filter(row => (type === "all" || row.business_type === type) && (status === "all" || row.status === status) && `${row.name} ${row.business_type} ${row.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
  const unavailable = restricted ? "Restricted financial access" : "Financial data unavailable"
  const metrics = [
    { label: "Total Revenue (MTD)", value: summary?.revenue, icon: CircleDollarSign, tone: "green", note: summary?.transactionCount ? "Completed income this month" : "No completed transactions this period" },
    { label: "Total Expenses (MTD)", value: summary?.expenses, icon: BriefcaseBusiness, tone: "red", note: "Completed expenses this month" },
    { label: "Net Cash Flow (MTD)", value: summary?.net, icon: ChartNoAxesCombined, tone: "blue", note: "Income less expenses · not a bank balance" },
    { label: "Money Owed to You", value: summary?.owed, icon: Wallet, tone: "amber", note: `${summary?.receivableCount ?? 0} open receivables` },
    { label: "Upcoming Bills", value: summary?.bills, icon: CalendarDays, tone: "purple", note: "Next 14 days, including overdue" },
  ]
  const profits = data.businesses.map(business => {
    const rows = financials?.transactions.filter(row => row.business_id === business.id && row.status === "completed" && row.transaction_date >= dates.monthStart && row.transaction_date <= dates.today) ?? []
    const cents = rows.reduce((sum, row) => sum + (row.transaction_type === "income" ? 1 : -1) * Math.round(numeric(row.amount) * 100), 0)
    return { business, value: cents / 100 }
  }).sort((a, b) => b.value - a.value)
  const maxProfit = Math.max(1, ...profits.map(row => Math.abs(row.value)))
  const chart = summary?.chart.slice(-Number(chartMonths)) ?? []
  const chartMax = Math.max(1, ...chart.flatMap(row => [row.revenue, row.expenses]))
  const hasChart = chart.some(row => row.revenue || row.expenses)
  const parking = data.businesses.filter(row => /parking/.test(row.business_type.toLowerCase()))
  const toolbar = data.organizations.length > 1 ? <select aria-label="Organization" value={data.organization.id} onChange={event => selectOrganization(event.target.value)}>{data.organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select> : undefined
  return <BenShell organizationName={data.organization.name} userEmail={data.userEmail} role={data.organization.role} connected onRefresh={refresh} onSignOut={onSignOut} toolbar={toolbar} notificationCount={actions.length} initialDate={now} onSearch={value => { setQuery(value); document.getElementById("businesses")?.scrollIntoView({ behavior: "smooth" }) }}>
    <div className={dense.dashboard} id="overview">
      {data.financialError && <p className={styles.errorBox} role="alert">{data.financialError}</p>}
      <section id="financials" className={dense.kpis} aria-label="Executive financial overview">{metrics.map(({ label, value, icon: Icon, tone, note }) => <article className={dense.kpi} key={label}><span className={dense.kpiIcon} data-tone={tone}><Icon size={27} /></span><div><h2>{label}</h2><strong>{value === undefined ? "—" : money(value)}</strong><p>{summary ? note : unavailable}</p></div></article>)}</section>
      <div className={dense.primaryGrid}>
        <Module id="cash-flow" title="Revenue vs Expenses"><div className={dense.chartToolbar}><span><i data-income />Revenue <i />Expenses</span><select aria-label="Chart reporting months" value={chartMonths} onChange={event => setChartMonths(event.target.value)}><option value="6">Last 6 months</option><option value="1">This Month</option></select></div>
          {!summary ? <Empty text={restricted ? "Financial access is protected" : unavailable} /> : !hasChart ? <Empty text="No transactions recorded for this period." note="A revenue and expense chart appears when completed transactions are recorded." /> : <><div className={dense.chart} aria-label="Monthly revenue and expenses">{chart.map(row => <div key={row.key}><div><span style={{ height: `${row.revenue / chartMax * 100}%` }} title={`Revenue ${money(row.revenue)}`} /><span style={{ height: `${row.expenses / chartMax * 100}%` }} title={`Expenses ${money(row.expenses)}`} /></div><small>{row.label}</small></div>)}</div><details className={dense.exact}><summary>Exact chart values</summary><div className={dense.tableWrap}><table><thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th></tr></thead><tbody>{chart.map(row => <tr key={row.key}><td>{row.label}</td><td>{money(row.revenue)}</td><td>{money(row.expenses)}</td></tr>)}</tbody></table></div></details></>}
        </Module>
        <Module title="Profit by Business (MTD)"><p className={dense.caption}>Completed income less expenses this month</p>{!summary ? <Empty text={unavailable} /> : <div className={dense.profitList}>{profits.map(({ business, value }, index) => { const Icon = businessIcon(business.business_type); return <div key={business.id}><span className={dense.smallIcon} data-tone={index % 5}><Icon size={14} /></span><button onClick={() => setSelected(business)}>{business.name}</button><div className={dense.profitTrack}><span data-loss={value < 0} style={{ width: `${Math.abs(value) / maxProfit * 100}%` }} /></div><strong>{money(value)}</strong></div>})}{!profits.length && <Empty text="No businesses recorded yet." />}</div>}</Module>
        <Module id="action-center" title="Action Center" icon={<Bell size={18} />}><div className={dense.tabs}>{["All", "Overdue", "This Week", "Upcoming"].map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value} ({actions.filter(row => matches(row, value)).length})</button>)}</div><div className={dense.tableWrap} tabIndex={0} role="region" aria-label="Action Center records"><table className={dense.operationalTable}><thead><tr>{["Task / Issue", "Business", "Due Date", "Assigned", "Priority"].map(value => <th key={value}>{value}</th>)}</tr></thead><tbody>{filteredActions.length ? filteredActions.map(row => <tr key={row.id}><td>{row.text}</td><td>{row.business}</td><td data-overdue={row.overdue}>{row.due ?? "Not recorded"}</td><td>Not assigned</td><td>Not set</td></tr>) : <tr><td colSpan={5}><Empty text="No recorded issues in this view." note={summary ? "You're all caught up. Operational tasks are not connected yet." : "Financial alerts are unavailable. Operational tasks are not connected yet."} /></td></tr>}</tbody></table></div></Module>
      </div>
      <div className={dense.operationsGrid}>
        <Module id="trucks" title="Trucks & Trailers" icon={<Truck size={18} />}><div className={dense.tabs}>{["Active", "Maintenance", "Inactive"].map(value => <button key={value} aria-pressed={vehicleFilter === value} onClick={() => setVehicleFilter(value)}>{value}</button>)}</div><OperationalTable headings={["Unit #", "Type", "Driver", "Status"]} text="No vehicles added" note="Vehicle records are not connected yet." /></Module>
        <Module id="parking" title="Parking Lots" icon={<ParkingSquare size={18} />}><div className={dense.tableWrap} tabIndex={0} role="region" aria-label="Parking businesses"><table className={dense.operationalTable}><thead><tr>{["Location", "Occupancy", "Monthly Revenue", "Unpaid"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{parking.length ? parking.map(row => { const figure = financials?.businesses.find(item => item.id === row.id); return <tr key={row.id}><td><button onClick={() => setSelected(row)}>{row.name}</button></td><td>Not recorded</td><td>{figure ? money(numeric(figure.monthly_revenue)) : "—"}</td><td>Not recorded</td></tr>}) : <tr><td colSpan={4}>No parking businesses recorded.</td></tr>}</tbody></table></div><p className={dense.caption}>Revenue: protected stored monthly figures. Occupancy and space balances are not connected.</p></Module>
        <Module id="inventory" title="Tire Shop Inventory" icon={<Wrench size={18} />}><OperationalTable headings={["Item", "In Stock", "Reorder Level", "Status"]} text="No inventory records" note="Inventory records are not connected yet." /></Module>
        <Module id="documents" title="Important Documents" icon={<FileText size={18} />}><OperationalTable headings={["Document", "Business / Asset", "Expiration", "Status"]} text="No documents added" note="Document records are not connected yet." /></Module>
      </div>
      <Module id="opportunities" title="New Opportunities" icon={<Gauge size={18} />}><div className={dense.opportunities}><Empty text="No opportunities yet" note="Opportunity records and progress tracking are not connected yet." /><button disabled title="Opportunity creation requires backend support"><Plus size={18} />Add Opportunity</button></div></Module>
      <Module id="businesses" title={`Businesses (${data.businesses.length})`} icon={<Grid2X2 size={18} />}><div className={dense.filters}><label><Search size={16} /><input aria-label="Search businesses" placeholder="Search businesses..." value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Filter business type" value={type} onChange={event => setType(event.target.value)}><option value="all">All business types</option>{[...new Set(data.businesses.map(row => row.business_type))].sort().map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select><select aria-label="Filter business status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(data.businesses.map(row => row.status))].sort().map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></div><div className={dense.businessGrid}>{filtered.map(row => { const Icon = businessIcon(row.business_type); return <article key={row.id}><Icon size={22} /><div><h3>{row.name}</h3><p>{humanize(row.business_type)} · {humanize(row.status)}</p></div><button aria-label={`View ${row.name}`} onClick={() => setSelected(row)}>View Business<ArrowRight size={14} /></button></article>})}</div>{!filtered.length && <Empty text={data.businesses.length ? "No matching businesses" : "Your portfolio starts here"} />}</Module>
      <section id="receivables"><FinancialRecords data={data} /></section><section id="bills" className={dense.balanceStrip}><span>Receivables: {summary ? money(summary.owed) : unavailable}</span><span>Bills due in 14 days: {summary ? money(summary.bills) : unavailable}</span><a href="#receivables">View financial records<ArrowRight size={14} /></a></section>
      <div className={dense.foundationGrid}>{[["tasks", "Tasks", "No tasks yet"], ["people", "People", "No people records connected"], ["tire-shops", "Tire Shops", "Inventory and tire shop operations are not connected yet"], ["dispatch", "Dispatch", "Dispatch operations are not connected yet"], ["reports", "Reports", "Additional reporting is not connected yet"], ["settings", "Settings", "Organization settings are not editable in this phase"]].map(([id, label, message]) => <Module key={id} id={id} title={label} icon={id === "people" ? <Users size={17} /> : <ClipboardList size={17} />}><Empty text={message} note="Your live business directory remains available above." /></Module>)}</div>
    </div>
    {selected && <BusinessDetails key={selected.id} business={selected} data={data} onClose={() => setSelected(null)} />}
  </BenShell>
}
