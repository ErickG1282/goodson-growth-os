import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseFreightEmail } from "../lib/freight-email/email-parser"
import { processFreightEmail, type FreightEmailRepository } from "../lib/freight-email/intake-service"
import type { RawFreightEmail } from "../lib/freight-email/types"

test("A: structured offer detects conflicts", () => {
  const [result] = parseFreightEmail({ senderName: "Broker Agent", senderEmail: "agent@example.com", subject: "Load 0458577", receivedAt: "2026-08-28T12:00:00Z", bodyText: `Pickup In
BUFORD, GA 30519
Deliver To
GROVEPORT, OH 43125
Load
0458577
Equipment
Van 53'
Commodity
MEDICAL SUPPLIES
Weight
18082
Distance
585
Rate
$1,300
Delivery
Monday August 31 at 6:00 AM
Comments
P/U FRI 8/28 3pm.
DEL SUNDAY 8/30 7am.
Track Project 44.
Need 53 ft dry van swing door.
wght 30k` })
  assert.deepEqual([result.origin_city, result.origin_state, result.origin_zip], ["BUFORD", "GA", "30519"])
  assert.deepEqual([result.destination_city, result.destination_state, result.destination_zip], ["GROVEPORT", "OH", "43125"])
  assert.equal(result.broker_load_number, "0458577"); assert.equal(result.weight_lbs, 18082)
  assert.deepEqual(result.extraction_issues.find((issue) => issue.field === "weight_lbs"), { field: "weight_lbs", value_a: 18082, source_a: "structured_body", value_b: 30000, source_b: "comments", severity: "HIGH" })
  assert.equal(result.extraction_status, "NEEDS_REVIEW")
})

test("B: free-form offer does not invent equipment", () => {
  const [result] = parseFreightEmail({ senderName: "Broker", senderEmail: "broker@example.com", subject: "Burton MI - Jacksonville FL today need empty cap", receivedAt: "2026-08-28T12:00:00Z", bodyText: `Shipper close at 16 00 sharp
Jacksonville FL 08 00 Monday
25 000 clean palletized freight
Cap
Eta
RATE?` })
  assert.deepEqual([result.origin_city, result.origin_state], ["Burton", "MI"])
  assert.deepEqual([result.destination_city, result.destination_state], ["Jacksonville", "FL"])
  assert.equal(result.pickup_date, "2026-08-28"); assert.equal(result.delivery_date, "2026-08-31")
  assert.equal(result.weight_lbs, 25000); assert.equal(result.equipment_type, null); assert.equal(result.extraction_status, "NEEDS_REVIEW")
  assert.equal(result.broker_offered_rate, null); assert.equal(result.broker_reported_miles, null)
})

test("B2: explicit zero and positive broker numerics preserve their meaning", () => {
  const parse = (details: string) => parseFreightEmail({ senderEmail: "broker@example.com", subject: "Numeric semantics", receivedAt: "2026-08-28T12:00:00Z", bodyText: `Origin: Atlanta, GA\nDestination: Orlando, FL\nEquipment: 53 ft dry van\nWeight: 25000\n${details}` })[0]
  const zero = parse("Rate: $0\nDistance: 0")
  assert.equal(zero.broker_offered_rate, 0); assert.equal(zero.broker_reported_miles, 0)
  const positive = parse("Rate: $1,300\nDistance: 585")
  assert.equal(positive.broker_offered_rate, 1300); assert.equal(positive.broker_reported_miles, 585)
})

test("B3: missing weight remains null and blocks ready-to-quote", () => {
  const [result] = parseFreightEmail({ senderEmail: "broker@example.com", subject: "Missing weight", receivedAt: "2026-08-28T12:00:00Z", bodyText: "Origin: Atlanta, GA\nDestination: Orlando, FL\nEquipment: 53 ft dry van\nRate: $0\nDistance: 0" })
  assert.equal(result.weight_lbs, null)
  assert.equal(result.extraction_issues.find((issue) => issue.field === "weight_lbs")?.severity, "HIGH")
  assert.equal(result.extraction_status, "NEEDS_REVIEW")
})

const multiEmail: RawFreightEmail = { senderName: "Bridge Logistics", senderEmail: "loads@bridge.test", subject: "Three available loads", receivedAt: "2026-08-28T12:00:00Z", externalMessageId: "msg-three", bodyText: `LOAD 1001
Origin: Atlanta, GA 30303
Destination: Orlando, FL 32801
Pickup: 8/29 08:00 AM
Delivery: 8/30 10:00 AM
Equipment: 53 ft dry van
Weight: 18000
Commodity: Paper
---
LOAD 1002
Origin: Savannah, GA 31401
Destination: Nashville, TN 37201
Pickup: 8/30 09:00 AM
Delivery: 8/31 11:00 AM
Equipment: Power Only
Weight: 27000
Commodity: Machinery
---
LOAD 1003
Origin: Macon, GA 31201
Destination: Miami, FL 33101
Pickup: 8/31 07:00 AM
Delivery: 9/1 12:00 PM
Equipment: 53 ft dry van
Weight: 39000
Commodity: Produce` }

test("C: one email produces exactly three isolated opportunities", () => {
  const results = parseFreightEmail(multiEmail)
  assert.equal(results.length, 3)
  assert.deepEqual(results.map((row) => [row.broker_load_number, row.origin_city, row.destination_city, row.weight_lbs, row.pickup_date]), [
    ["1001", "Atlanta", "Orlando", 18000, "2026-08-29"],
    ["1002", "Savannah", "Nashville", 27000, "2026-08-30"],
    ["1003", "Macon", "Miami", 39000, "2026-08-31"],
  ])
  assert.ok(results.every((row) => row.broker_email === multiEmail.senderEmail))
})

test("D: mixed-quality sibling problems remain isolated", () => {
  const results = parseFreightEmail({ ...multiEmail, externalMessageId: "mixed", bodyText: multiEmail.bodyText!
    .replace("Equipment: Power Only\n", "")
    .replace("Weight: 39000\nCommodity: Produce", "Weight: 39000\nComments: wght 30k\nCommodity: Produce") })
  assert.deepEqual(results.map((row) => row.extraction_status), ["READY_TO_QUOTE", "NEEDS_REVIEW", "NEEDS_REVIEW"])
  assert.ok(!results[0].extraction_issues.length)
  assert.ok(results[1].extraction_issues.some((issue) => issue.field === "equipment_type"))
  assert.ok(results[2].extraction_issues.some((issue) => issue.field === "weight_lbs"))
})

test("E: duplicate external message reuses one email and its opportunities", async () => {
  const emails = new Map<string, string>(), opportunities = new Map<string, Record<string, unknown>[]>()
  let creates = 0
  const repository: FreightEmailRepository = {
    async findByExternalMessage(userId, externalId) { const id = emails.get(`${userId}:${externalId}`); return id ? { emailId: id, opportunities: opportunities.get(id) ?? [] } : null },
    async createEmail(userId, input) { const id = `email-${++creates}`; if (input.externalMessageId) emails.set(`${userId}:${input.externalMessageId}`, id); return id },
    async insertOpportunities(rows) { const stored = rows.map((row, index) => ({ ...row, id: `opp-${index}` })); opportunities.set(rows[0].source_email_id, stored); return stored },
    async updateEmail() {},
  }
  const first = await processFreightEmail(repository, "user-1", multiEmail)
  const second = await processFreightEmail(repository, "user-1", multiEmail)
  assert.equal(creates, 1); assert.equal(first.opportunities.length, 3); assert.equal(second.reused, true)
  assert.deepEqual(second.opportunities, first.opportunities)
})

test("F: migration records every correction as append-only history", () => {
  const sql = readFileSync("supabase/migrations/20260828_create_freight_email_intake.sql", "utf8")
  assert.match(sql, /gbgs_record_load_opportunity_corrections/)
  assert.match(sql, /insert into public\.gbgs_load_opportunity_corrections/)
  assert.doesNotMatch(sql, /create policy[^;]+gbgs_load_opportunity_corrections for (?:update|delete)/i)
  const history = [{ previous_value: 18082, corrected_value: 30000 }, { previous_value: 30000, corrected_value: 29500 }]
  assert.deepEqual(history, [{ previous_value: 18082, corrected_value: 30000 }, { previous_value: 30000, corrected_value: 29500 }])
})

test("G: Atlantic Load Detail section remains one conflicted opportunity", () => {
  const bodyText = `ABRAHA TRANSPORTATION INC, we have an offer for you!
Pickup In
BUFORD, GA 30519
Friday August 28 at 3:00 PM EDT
Deliver To
GROVEPORT, OH 43125
IMAGE_CALENDAR
Monday August 31 at 6:00 AM EDT
Load Detail
Load 0458577
Equipment
Van 53'
Mode
Truckload
Commodity
MEDICAL SUPPLIES
Weight
18082.0
Distance
585.0
Comments
P/U FRI 8/28 3pm.
DEL SUNDAY 8/30 7am.
Track Project 44.
Need 53 ft dry van swing door.
Palletized medical supplies.
wght 30k
Rate
$ 1,300.00`
  const opportunities = parseFreightEmail({
    senderName: "Atlantic Logistics",
    senderEmail: "adam@example.com",
    subject: "ATLANTIC LOGISTICS LLC is offering a load from BUFORD, GA to GROVEPORT, OH",
    receivedAt: "2026-08-28T12:00:00Z",
    bodyText,
  })
  assert.equal(opportunities.length, 1)
  const [result] = opportunities
  assert.deepEqual([result.origin_city, result.origin_state, result.origin_zip], ["BUFORD", "GA", "30519"])
  assert.deepEqual([result.destination_city, result.destination_state, result.destination_zip], ["GROVEPORT", "OH", "43125"])
  assert.equal(result.broker_load_number, "0458577")
  assert.equal(result.equipment_type, "Dry Van")
  assert.equal(result.trailer_length, 53)
  assert.equal(result.door_type, "Swing Door")
  assert.equal(result.commodity, "MEDICAL SUPPLIES")
  assert.equal(result.broker_reported_miles, 585)
  assert.equal(result.broker_offered_rate, 1300)
  assert.deepEqual(result.extraction_issues.find((issue) => issue.field === "weight_lbs"), { field: "weight_lbs", value_a: 18082, source_a: "structured_body", value_b: 30000, source_b: "comments", severity: "HIGH" })
  assert.deepEqual((result.raw_extracted_values.weights as Array<{ value: number }>).map((candidate) => candidate.value), [18082, 30000])
  assert.equal(result.extraction_issues.find((issue) => issue.field === "delivery")?.severity, "HIGH")
  assert.deepEqual((result.raw_extracted_values.delivery as Array<{ source: string; value: { date: string; time: string; raw: string } }>).map((candidate) => [candidate.source, candidate.value.date, candidate.value.time, candidate.value.raw]), [
    ["structured_body", "2026-08-31", "06:00:00", "Monday August 31 at 6:00 AM EDT"],
    ["comments", "2026-08-30", "07:00:00", "SUNDAY 8/30 7am"],
  ])
  assert.equal(result.extraction_status, "NEEDS_REVIEW")
  assert.ok(result.extraction_issues.filter((issue) => issue.severity === "HIGH").some((issue) => ["origin","destination","pickup","delivery","equipment_type","weight_lbs"].includes(issue.field)))
})

test("H: repeated exact load number sections are coalesced before extraction", () => {
  const opportunities = parseFreightEmail({ senderEmail: "broker@example.com", subject: "Load 777", receivedAt: "2026-08-28T12:00:00Z", bodyText: `LOAD 777
Origin: Atlanta, GA 30303
Destination: Orlando, FL 32801
Equipment: 53 ft dry van
Weight: 18082
LOAD 777
Comments: wght 30k` })
  assert.equal(opportunities.length, 1)
  assert.equal(opportunities[0].broker_load_number, "777")
  assert.deepEqual(opportunities[0].extraction_issues.find((issue) => issue.field === "weight_lbs"), { field: "weight_lbs", value_a: 18082, source_a: "structured_body", value_b: 30000, source_b: "comments", severity: "HIGH" })
  assert.equal(opportunities[0].extraction_status, "NEEDS_REVIEW")
})

test("I: clean single load remains ready to quote", () => {
  const [result] = parseFreightEmail({ senderEmail: "broker@example.com", subject: "Clean load 900", receivedAt: "2026-08-28T12:00:00Z", bodyText: `LOAD 900
Origin: Atlanta, GA 30303
Destination: Orlando, FL 32801
Equipment: 53 ft dry van
Weight: 20000` })
  assert.equal(result.extraction_issues.some((issue) => issue.severity === "HIGH" && ["origin","destination","pickup","delivery","equipment","equipment_type","weight_lbs"].includes(issue.field)), false)
  assert.equal(result.extraction_status, "READY_TO_QUOTE")
})

test("J: duplicate plain-text and HTML MIME representations produce one load", () => {
  const bodyText = `LOAD 901
Origin: Atlanta, GA 30303
Destination: Orlando, FL 32801
Equipment: 53 ft dry van
Weight: 20000`
  const opportunities = parseFreightEmail({ senderEmail: "broker@example.com", subject: "MIME duplicate", receivedAt: "2026-08-28T12:00:00Z", bodyText, bodyHtml: `<div>${bodyText.replaceAll("\n", "<br>")}</div>` })
  assert.equal(opportunities.length, 1)
  assert.equal(opportunities[0].broker_load_number, "901")
  assert.equal(opportunities[0].extraction_status, "READY_TO_QUOTE")
})

test("K: unique HTML comment evidence is preserved without creating a duplicate load", () => {
  const plain = `LOAD 902
Origin: Atlanta, GA 30303
Destination: Orlando, FL 32801
Equipment: 53 ft dry van
Weight: 18082`
  const html = `<div>LOAD 902<br>Origin: Atlanta, GA 30303<br>Destination: Orlando, FL 32801<br>Equipment: 53 ft dry van<br>Weight: 18082<br>Comments<br>Weight: 30000</div>`
  const opportunities = parseFreightEmail({ senderEmail: "broker@example.com", subject: "MIME unique evidence", receivedAt: "2026-08-28T12:00:00Z", bodyText: plain, bodyHtml: html })
  assert.equal(opportunities.length, 1)
  assert.deepEqual((opportunities[0].raw_extracted_values.weights as Array<{ value: number }>).map((candidate) => candidate.value), [18082, 30000])
  assert.equal(opportunities[0].extraction_issues.find((issue) => issue.field === "weight_lbs")?.severity, "HIGH")
  assert.equal(opportunities[0].extraction_status, "NEEDS_REVIEW")
})

function deliveryFixture(commentDelivery?: string) {
  return `Origin: Buford, GA 30519
Deliver To
Groveport, OH 43125
IMAGE_CALENDAR
Monday August 31 at 6:00 AM EDT
Load Detail
Load 910
Equipment: 53 ft dry van
Weight: 18082${commentDelivery ? `\nComments\nDEL ${commentDelivery}` : ""}`
}

test("L: matching structured and comment delivery evidence does not conflict", () => {
  const [result] = parseFreightEmail({ senderEmail: "broker@example.com", subject: "Matching delivery", receivedAt: "2026-08-28T12:00:00Z", bodyText: deliveryFixture("MONDAY 8/31 6am") })
  assert.deepEqual((result.raw_extracted_values.delivery as Array<{ value: { date: string; time: string } }>).map((candidate) => [candidate.value.date, candidate.value.time]), [["2026-08-31", "06:00:00"], ["2026-08-31", "06:00:00"]])
  assert.equal(result.extraction_issues.some((issue) => issue.field === "delivery" && issue.severity === "HIGH"), false)
  assert.equal(result.extraction_status, "READY_TO_QUOTE")
})

test("M: same-date explicit delivery time difference is a high conflict", () => {
  const [result] = parseFreightEmail({ senderEmail: "broker@example.com", subject: "Time conflict", receivedAt: "2026-08-28T12:00:00Z", bodyText: deliveryFixture("MONDAY 8/31 9am") })
  assert.deepEqual((result.raw_extracted_values.delivery as Array<{ value: { date: string; time: string } }>).map((candidate) => [candidate.value.date, candidate.value.time]), [["2026-08-31", "06:00:00"], ["2026-08-31", "09:00:00"]])
  assert.equal(result.extraction_issues.find((issue) => issue.field === "delivery")?.severity, "HIGH")
  assert.equal(result.extraction_status, "NEEDS_REVIEW")
})

test("N: one structured delivery value does not create a false conflict", () => {
  const [result] = parseFreightEmail({ senderEmail: "broker@example.com", subject: "Structured delivery only", receivedAt: "2026-08-28T12:00:00Z", bodyText: deliveryFixture() })
  assert.deepEqual((result.raw_extracted_values.delivery as Array<{ source: string; value: { date: string; time: string } }>).map((candidate) => [candidate.source, candidate.value.date, candidate.value.time]), [["structured_body", "2026-08-31", "06:00:00"]])
  assert.equal(result.extraction_issues.some((issue) => issue.field === "delivery"), false)
  assert.equal(result.extraction_status, "READY_TO_QUOTE")
})
