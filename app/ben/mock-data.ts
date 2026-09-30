export const financials = {
  month: { label: "September 2026", revenue: 184320, expenses: 112450, cashFlow: 71870, owed: 45230, bills: 38600, revenueTrend: "+12%", expenseTrend: "+6%", cashTrend: "+18%", business: [28400, 24150, 18620, 12400, 10850, 9300, 6200] },
  quarter: { label: "Q3 2026", revenue: 554320, expenses: 372450, cashFlow: 181870, owed: 45230, bills: 38600, revenueTrend: "+15%", expenseTrend: "+7%", cashTrend: "+21%", business: [85400, 72150, 54620, 37400, 32850, 28300, 18200] },
}
export const chart = { months: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], income: [190, 178, 182, 166, 200, 184.32], costs: [135, 150, 140, 119, 134, 112.45] }
export const businesses = ["CEVA Fleet", "Mela Tire Shop", "B&Y Tire Shop", "Dispatch Company", "Parking Lots (3)", "OTR Trucks", "Trading"]
export const initialActions = [
  { id: 1, title: "Truck 104 – Maintenance overdue", business: "CEVA Fleet", due: "Sep 25, 2026", assignee: "Peter", priority: "High", group: "Overdue" },
  { id: 2, title: "Mela – Insurance renewal", business: "Mela Tire", due: "Oct 1, 2026", assignee: "Erick", priority: "High", group: "This Week" },
  { id: 3, title: "Parking #2 – 4 unpaid spaces", business: "Parking Lot #2", due: "Sep 28, 2026", assignee: "Peter", priority: "High", group: "Overdue" },
  { id: 4, title: "OTR Truck 2 – Registration due", business: "OTR Trucks", due: "Oct 18, 2026", assignee: "Melissa", priority: "Medium", group: "Upcoming" },
  { id: 5, title: "Order 11R22.5 tires", business: "B&Y Tire", due: "Sep 30, 2026", assignee: "Erick", priority: "Medium", group: "This Week" },
  { id: 6, title: "Driver – Medical card expires", business: "Dispatch", due: "Oct 5, 2026", assignee: "Melissa", priority: "Medium", group: "Upcoming" },
  { id: 7, title: "Collect Parking #3 balance", business: "Parking Lot #3", due: "Sep 28, 2026", assignee: "Peter", priority: "Medium", group: "Overdue" },
  { id: 8, title: "Warehouse broker proposal", business: "New Opportunity", due: "Oct 2, 2026", assignee: "Berhane", priority: "Low", group: "This Week" },
]
export const trucks = [
  { unit: "104", type: "Straight", driver: "Abel", status: "Maintenance" },
  { unit: "105", type: "Straight", driver: "Samuel", status: "Active" },
  { unit: "106", type: "Straight", driver: "Daniel", status: "Active" },
  { unit: "107", type: "Straight", driver: "Yonas", status: "Active" },
  { unit: "OTR 1", type: "Sleeper", driver: "Michael", status: "Active" },
  { unit: "OTR 2", type: "Sleeper", driver: "John", status: "Active" },
  { unit: "TR 01", type: "Trailer", driver: "Unassigned", status: "Inactive" },
]
export const parking = [
  { name: "Lot #1", address: "Atlanta, GA", used: 85, total: 100, revenue: 12400, unpaid: 3 },
  { name: "Lot #2", address: "Douglasville, GA", used: 62, total: 80, revenue: 9800, unpaid: 4 },
  { name: "Lot #3", address: "Marietta, GA", used: 48, total: 60, revenue: 7350, unpaid: 2 },
]
export const tires = [
  { name: "11R22.5", stock: 18, reorder: 20 },
  { name: "295/75R22.5", stock: 32, reorder: 20 },
  { name: "Brakes", stock: 12, reorder: 15 },
  { name: "Oil Filters", stock: 45, reorder: 30 },
  { name: "Air Filters", stock: 28, reorder: 25 },
]
export const documents = [
  { name: "Mela Insurance", business: "Mela Tire", date: "Oct 1, 2026", status: "Urgent" },
  { name: "Truck 104 Registration", business: "CEVA Fleet", date: "Oct 10, 2026", status: "Soon" },
  { name: "OTR 2 Insurance", business: "OTR Trucks", date: "Oct 18, 2026", status: "Soon" },
  { name: "Driver – Med Card (John)", business: "OTR 2", date: "Oct 5, 2026", status: "Soon" },
  { name: "Business License – B&Y", business: "B&Y Tire", date: "Jan 15, 2027", status: "Good" },
  { name: "Parking Lot #1 Permit", business: "Parking #1", date: "Dec 12, 2026", status: "Good" },
]
export const opportunities = [
  { name: "Warehouse / Parts Distribution", status: "In negotiation", progress: 60, nextStep: "Broker meeting Oct 2" },
  { name: "Purchase 3 More Trailers", status: "Under review", progress: 30, nextStep: "Getting quotes" },
  { name: "New Trucking Contract", status: "In discussion", progress: 40, nextStep: "Confirm lane pricing" },
]
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
