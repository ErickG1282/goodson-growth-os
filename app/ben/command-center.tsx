import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { canReadFinancials, day, money, numeric, type FinancialData, type Business } from "./data"
import type { ReadyData } from "./workspace"
import styles from "./ben.module.css"

const title = (value: string) => value.replace(/[_-]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase())
const open = (status: string) => !["paid", "cancelled"].includes(status)
const balance = (row: FinancialData["receivables"][number]) => Math.max(0, Math.round(numeric(row.amount_due) * 100) - Math.round(numeric(row.amount_paid) * 100)) / 100
const total = (values: number[]) => values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100
export function attentionItems(businesses: Business[], financials: FinancialData | null, now: Date) {
  const today = day(now)
  const items = businesses.filter(row => row.status === "inactive").map(row => ({ key: `business-${row.id}`, text: `${row.name} is inactive`, href: "#businesses" }))
  if (financials) {
    for (const row of financials.receivables) if (open(row.status) && balance(row) > 0 && (row.status === "overdue" || (row.due_date && row.due_date < today))) items.push({ key: `receivable-${row.id}`, text: `${row.customer_name ?? "Receivable"}: ${money(balance(row))} overdue`, href: "#receivables" })
    for (const row of financials.bills) if (open(row.status) && numeric(row.amount) > 0 && (row.status === "overdue" || row.due_date < today)) items.push({ key: `bill-${row.id}`, text: `${row.vendor_name ?? "Bill"}: ${money(numeric(row.amount))} overdue`, href: "#bills" })
  }
  return items
}
export function ExecutiveInsights({ data, now }: { data: ReadyData; now: Date }) {
  const authorized = canReadFinancials(data.organization.role)
  const financials = authorized ? data.financials : null
  const attention = attentionItems(data.businesses, financials, now)
  const categories = [...new Set(data.businesses.map(row => row.business_type))].sort().map(type => ({ type, count: data.businesses.filter(row => row.business_type === type).length }))
  const receivables = financials?.receivables.filter(row => open(row.status)) ?? []
  const bills = financials?.bills.filter(row => open(row.status)) ?? []
  const today = day(now)
  const dueSoon = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14))
  return <>
    <section className={styles.executiveGrid} aria-label="Portfolio priorities">
      <Card className={styles.panel}><div className={styles.cardHeading}><h2>Needs Attention</h2><span className={styles.countPill}>{attention.length}</span></div>
        {attention.length ? <ul className={styles.attentionList}>{attention.map(item => <li key={item.key}><a href={item.href}>{item.text}<ArrowRight size={16} /></a></li>)}</ul> : <div className={styles.caughtUp}><CheckCircle2 size={30} /><h3>You&apos;re all caught up.</h3><p>{financials ? "No inactive businesses or overdue balances need attention." : "No inactive businesses need attention. Financial priorities are unavailable with your current access or connection."}</p></div>}
      </Card>
      <Card className={styles.panel}><h2>Portfolio Breakdown</h2><p className={styles.panelIntro}>Business types in your live directory</p><div className={styles.categoryList}>{categories.map(row => <div key={row.type}><div><span>{title(row.type)}</span><strong>{row.count}</strong></div><div className={styles.categoryTrack}><span style={{ width: `${row.count / Math.max(1, data.businesses.length) * 100}%` }} /></div></div>)}</div>{!categories.length && <p>No businesses recorded yet.</p>}</Card>
      <Card className={styles.panel}><h2>Quick Actions</h2><p className={styles.panelIntro}>Move straight to what matters.</p><div className={styles.quickActions}>{[["businesses", "View Businesses"], ["receivables", "View Receivables"], ["bills", "View Bills"], ["cash-flow", "View Cash Flow"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}<ArrowRight size={18} /></a>)}</div></Card>
    </section>
    <section aria-label="Money at a glance"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>MONEY AT A GLANCE</p><h2>Balances and upcoming commitments</h2></div></div><div className={styles.moneyGrid}>
      <Card className={styles.panel}><h2>Receivables</h2><strong className={styles.balanceValue}>{financials ? money(total(receivables.map(balance))) : "—"}</strong><p>{financials ? `${receivables.length} open records` : "Financial access unavailable"}</p>{financials && <dl className={styles.miniFacts}><div><dt>Overdue balance</dt><dd>{money(total(receivables.filter(row => row.status === "overdue" || (row.due_date && row.due_date < today)).map(balance)))}</dd></div></dl>}</Card>
      <Card className={styles.panel}><h2>Bills</h2><strong className={styles.balanceValue}>{financials ? money(total(bills.map(row => numeric(row.amount)))) : "—"}</strong><p>Total unpaid{financials ? ` · ${bills.length} records` : " · Financial access unavailable"}</p>{financials && <dl className={styles.miniFacts}><div><dt>Due in the next 14 days</dt><dd>{money(total(bills.filter(row => row.due_date >= today && row.due_date <= dueSoon).map(row => numeric(row.amount))))}</dd></div><div><dt>Overdue</dt><dd>{money(total(bills.filter(row => row.status === "overdue" || row.due_date < today).map(row => numeric(row.amount))))}</dd></div></dl>}</Card>
    </div></section>
  </>
}
export function FinancialRecords({ data, businessId }: { data: ReadyData; businessId?: string }) {
  if (!canReadFinancials(data.organization.role) || !data.financials) return <p className={styles.secureNotice}><ShieldCheck size={18} />{canReadFinancials(data.organization.role) ? "Financial records are currently unavailable." : "Financial records require owner, admin, or manager access."}</p>
  const f = data.financials
  const businessName = (id?: string | null) => id ? data.businesses.find(row => row.id === id)?.name ?? "Business unavailable" : "Organization"
  const transactions = f.transactions.filter(row => !businessId || row.business_id === businessId)
  const receivables = f.receivables.filter(row => !businessId || row.business_id === businessId)
  const bills = f.bills.filter(row => !businessId || row.business_id === businessId)
  const tables = [
    { name: "Transactions", empty: "No transactions recorded for this period.", headers: ["Business", "Date", "Category / type", "Status", "Amount"], rows: transactions.map(row => ({ id: row.id, cells: [businessName(row.business_id), row.transaction_date, `${row.category ?? "Uncategorized"} · ${title(row.transaction_type)}`, title(row.status), money(numeric(row.amount))] })) },
    { name: "Receivables", empty: "No receivables recorded yet.", headers: ["Business", "Customer", "Due date", "Status", "Remaining"], rows: receivables.map(row => ({ id: row.id, cells: [businessName(row.business_id), row.customer_name ?? "Not recorded", row.due_date ?? "Not recorded", title(row.status), money(balance(row))] })) },
    { name: "Bills", empty: "No bills recorded yet.", headers: ["Business", "Vendor", "Due date", "Status", "Amount"], rows: bills.map(row => ({ id: row.id, cells: [businessName(row.business_id), row.vendor_name ?? "Not recorded", row.due_date, title(row.status), money(numeric(row.amount))] })) },
  ]
  return <section className={styles.recordPanels} aria-label={businessId ? "Business financial records" : "Organization financial records"}>{!businessId && <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FINANCIAL RECORDS</p><h2>The detail behind your numbers</h2></div></div>}{tables.map(table => <Card className={styles.panel} key={table.name}><h3>{table.name}</h3>{table.name === "Transactions" && <p className={styles.panelIntro}>Last six calendar months through today.</p>}{table.rows.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${table.name} records`}><table><thead><tr>{table.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{table.rows.map(row => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className={styles.recordEmpty}>{table.empty}</p>}</Card>)}</section>
}
