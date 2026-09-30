import { normalizeState } from "../freight-quoting/lane-classifier"
import type { ExtractionIssue, LoadOpportunityExtraction, RawFreightEmail } from "./types"

type Candidate<T> = { value: T; raw: string; source: string }
type ParsedLocation = { city: string | null; state: string | null; zip: string | null; raw: string }
const weekdayIndex: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }
const safetyCriticalFields = new Set(["origin", "destination", "pickup", "delivery", "equipment", "equipment_type", "weight_lbs"])

function htmlToText(html?: string | null) { return (html ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>|<\/tr>|<\/div>/gi, "\n").replace(/<\/td>|<\/th>/gi, "\t").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\r/g, "") }
function clean(value?: string | null) { return value?.replace(/\s+/g, " ").trim() || null }
function numberValue(raw: string) { const normalized = raw.toLowerCase().replace(/[$,\s]/g, ""); const match = normalized.match(/(\d+(?:\.\d+)?)(k)?/); if (!match) return null; const value = Number(match[1]) * (match[2] ? 1000 : 1); return Number.isFinite(value) ? Math.round(value) : null }
function moneyValue(raw: string) { const normalized = raw.replace(/[$,\s]/g, ""); if (!normalized) return null; const value = Number(normalized); return Number.isFinite(value) ? value : null }
function isoDate(date: Date) { return date.toISOString().slice(0, 10) }
function resolveTemporal(raw: string, receivedAt: string) {
  const upper = raw.toUpperCase(), received = new Date(receivedAt), date = new Date(Date.UTC(received.getUTCFullYear(), received.getUTCMonth(), received.getUTCDate()))
  if (/\bTODAY\b/.test(upper)) { /* received date */ }
  else if (/\bTOMORROW\b/.test(upper)) date.setUTCDate(date.getUTCDate() + 1)
  else { const numeric = upper.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/); if (numeric) { const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : received.getUTCFullYear(); date.setUTCFullYear(year, Number(numeric[1]) - 1, Number(numeric[2])) } else { const weekday = Object.keys(weekdayIndex).find((day) => upper.includes(day)); if (!weekday) return { date: null, time: parseTime(raw) }; let days = (weekdayIndex[weekday] - date.getUTCDay() + 7) % 7; if (days === 0) days = 7; date.setUTCDate(date.getUTCDate() + days) } }
  return { date: isoDate(date), time: parseTime(raw) }
}
function parseTime(raw: string) { const match = raw.match(/\b(\d{1,2})(?:\s*[: ]\s*(\d{2}))?\s*(AM|PM)\b|\b(\d{1,2})\s*[: ]\s*(\d{2})\b/i); if (!match) return null; let hour = Number(match[1] ?? match[4]); const minute = Number(match[2] ?? match[5] ?? 0); if (minute > 59 || hour > 23) return null; const suffix = match[3]?.toUpperCase(); if (suffix === "PM" && hour < 12) hour += 12; if (suffix === "AM" && hour === 12) hour = 0; return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00` }
function locationMatch(text: string, label: RegExp): ParsedLocation | null { const match = text.match(label); if (!match) return null; return { city: clean(match[1]), state: normalizeState(match[2]), zip: match[3] ?? null, raw: match[0] } }
function conflict<T>(field: string, candidates: Candidate<T>[], issues: ExtractionIssue[]) { const unique = candidates.filter((item, index) => candidates.findIndex((other) => String(other.value) === String(item.value)) === index); if (unique.length > 1) issues.push({ field, value_a: unique[0].value, source_a: unique[0].source, value_b: unique[1].value, source_b: unique[1].source, severity: "HIGH" }); return unique[0]?.value ?? null }
function finalExtractionStatus(issues: ExtractionIssue[]) { return issues.some((issue) => issue.severity === "HIGH" && safetyCriticalFields.has(issue.field)) ? "NEEDS_REVIEW" as const : "READY_TO_QUOTE" as const }

function explicitLoadNumber(text: string) { return clean(text.match(/(?:^|\n)\s*(?:[-=#]{2,}\s*)?(?:LOAD|LOAD\s*#)\s*:?\s*(?:\n\s*)?([A-Z0-9-]*\d[A-Z0-9-]*)\s*(?:[-=#]{2,})?\s*$/im)?.[1]) }
function commentBoundary(text: string) { return text.search(/(?:^|\n)\s*Comments?\s*:?(?=\s|$)/i) }
function splitComments(text: string) { const index = commentBoundary(text); return index < 0 ? { structured: text, comments: "" } : { structured: text.slice(0, index), comments: text.slice(index).replace(/^\s*Comments?\s*:?[\t ]*/i, "") } }
function combinedMimeBody(email: RawFreightEmail) {
  const plain = (email.bodyText ?? "").replace(/\r/g, "").trim(), html = htmlToText(email.bodyHtml).trim()
  if (!plain) return html
  if (!html) return plain
  const plainCanonical = clean(plain)?.toLowerCase() ?? "", htmlCanonical = clean(html)?.toLowerCase() ?? ""
  if (plainCanonical === htmlCanonical || plainCanonical.includes(htmlCanonical)) return plain
  if (htmlCanonical.includes(plainCanonical)) return html
  return `${plain}\n${html}`
}
function coalesceSameLoadSegments(segments: string[]) {
  const merged: Array<{ loadNumber: string | null; structured: string[]; comments: string[] }> = []
  for (const segment of segments) {
    const loadNumber = explicitLoadNumber(segment), sections = splitComments(segment)
    const existing = loadNumber ? merged.find((item) => item.loadNumber === loadNumber) : undefined
    if (existing) { existing.structured.push(sections.structured); if (sections.comments) existing.comments.push(sections.comments) }
    else merged.push({ loadNumber, structured: [sections.structured], comments: sections.comments ? [sections.comments] : [] })
  }
  return merged.map((item) => `${item.structured.join("\n").trim()}${item.comments.length ? `\nComments:\n${item.comments.join("\n")}` : ""}`)
}
function segmentEmail(email: RawFreightEmail) {
  const body = combinedMimeBody(email)
  const marker = /^\s*(?:[-=#]{2,}\s*)?(?:LOAD|LOAD\s*#)\s*:?[ \t]+[A-Z0-9-]*\d[A-Z0-9-]*\s*(?:[-=#]{2,})?\s*$/gim
  const matches = [...body.matchAll(marker)]
  if (matches.length < 2) return [body]
  const identities = matches.map((match) => explicitLoadNumber(match[0])).filter(Boolean)
  if (new Set(identities).size === 1) return [body]
  return coalesceSameLoadSegments(matches.map((match, index) => body.slice(index === 0 ? 0 : match.index!, matches[index + 1]?.index ?? body.length).trim()))
}

export function parseFreightEmail(email: RawFreightEmail): LoadOpportunityExtraction[] {
  const globalText = `${email.subject}\n${email.bodyText ?? ""}\n${htmlToText(email.bodyHtml)}`
  const sharedPhone = clean(globalText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0])
  return segmentEmail(email).map((bodyText) => {
    const result = parseFreightEmailBlock({ ...email, bodyText, bodyHtml: null })
    return result.broker_phone || !sharedPhone ? result : { ...result, broker_phone: sharedPhone }
  })
}

function parseFreightEmailBlock(email: RawFreightEmail): LoadOpportunityExtraction {
  const bodyText = [email.bodyText ?? "", htmlToText(email.bodyHtml)].filter(Boolean).join("\n"), allText = `${email.subject}\n${bodyText}`
  const commentsIndex = commentBoundary(bodyText), structuredBody = commentsIndex >= 0 ? bodyText.slice(0, commentsIndex) : bodyText, comments = commentsIndex >= 0 ? bodyText.slice(commentsIndex) : ""
  const issues: ExtractionIssue[] = [], raw: Record<string, unknown> = {}
  let origin = locationMatch(structuredBody, /(?:Pickup In|Pick Up|Origin)\s*:?\s*(?:\n\s*)?([A-Za-z .'-]+?),?\s+([A-Z]{2})(?:\s+(\d{5}))?/i)
  let destination = locationMatch(structuredBody, /(?:Deliver To|Destination)\s*:?\s*(?:\n\s*)?([A-Za-z .'-]+?),?\s+([A-Z]{2})(?:\s+(\d{5}))?/i)
  if (!origin || !destination) { const lane = email.subject.match(/^\s*([A-Za-z .'-]+?),?\s+([A-Z]{2})\s*(?:-|→|\bto\b)\s*([A-Za-z .'-]+?),?\s+([A-Z]{2})\b/i); if (lane) { origin ??= { city: clean(lane[1]), state: normalizeState(lane[2]), zip: null, raw: lane[0] }; destination ??= { city: clean(lane[3]), state: normalizeState(lane[4]), zip: null, raw: lane[0] } } }

  const structuredWeight = structuredBody.match(/(?:^|\n)\s*(?:Weight|Wgt)\s*:?\s*(?:\n\s*)?([\d, ]+\s*k?)/im)
  const commentWeight = comments.match(/(?:\b(?:wght|weight)\b\s*:?\s*([\d,.]+\s*k?)|\b([\d,.]+\s*k)\s*(?:lbs?\s*)?weight\b)/i)
  const freeWeight = allText.match(/\b(\d{1,3}(?:[ ,]\d{3})+|\d+\s*k)\s*(?:lbs?|pounds?)?\b/i)
  const weightCandidates: Candidate<number>[] = []
  if (structuredWeight && numberValue(structuredWeight[1]) !== null) weightCandidates.push({ value: numberValue(structuredWeight[1])!, raw: structuredWeight[0], source: "structured_body" })
  if (commentWeight) { const value = numberValue(commentWeight[1] ?? commentWeight[2]); if (value !== null) weightCandidates.push({ value, raw: commentWeight[0], source: "comments" }) }
  if (!weightCandidates.length && freeWeight && numberValue(freeWeight[1]) !== null) weightCandidates.push({ value: numberValue(freeWeight[1])!, raw: freeWeight[0], source: "free_form" })
  const weight = conflict("weight_lbs", weightCandidates, issues)

  const equipmentText = allText.match(/(?:Equipment\s*:?\s*(?:\n\s*)?[^\n]+|53\s*(?:ft|foot|')?\s*(?:dry\s*)?van[^\n]*|\bpower\s+only\b)/i)?.[0] ?? ""
  const equipment = /\bpower\s+only\b/i.test(equipmentText) ? "Power Only" : /\b(?:dry\s+van|van\s*53|53\s*(?:ft|foot|')?\s*(?:dry\s*)?van)\b/i.test(equipmentText) ? "Dry Van" : null
  const trailerLength = /\b53\s*(?:ft|foot|')/i.test(equipmentText) ? 53 : null
  const doorType = /swing\s+door/i.test(allText) ? "Swing Door" : /roll\s*up\s+door/i.test(allText) ? "Roll-Up Door" : null

  const pickupCandidates = temporalCandidates(structuredBody, comments, email.subject, "pickup", email.receivedAt)
  const deliveryCandidates = temporalCandidates(structuredBody, comments, bodyText, "delivery", email.receivedAt)
  const pickupValue = conflict("pickup", pickupCandidates.map((x) => ({ ...x, value: `${x.value.date ?? ""} ${x.value.time ?? ""}`.trim() })), issues)
  const deliveryValue = conflict("delivery", deliveryCandidates.map((x) => ({ ...x, value: `${x.value.date ?? ""} ${x.value.time ?? ""}`.trim() })), issues)
  const selectedPickup = pickupCandidates.find((x) => `${x.value.date ?? ""} ${x.value.time ?? ""}`.trim() === pickupValue)?.value ?? null
  const selectedDelivery = deliveryCandidates.find((x) => `${x.value.date ?? ""} ${x.value.time ?? ""}`.trim() === deliveryValue)?.value ?? null

  const loadNumber = explicitLoadNumber(structuredBody)
  const commodity = clean(structuredBody.match(/(?:^|\n)\s*Commodity\s*:?\s*(?:\n\s*)?([^\n]+)/im)?.[1]) ?? clean(allText.match(/\d{1,3}(?:[ ,]\d{3})+\s*(?:lbs?\s*)?([^\n]+)/i)?.[1])
  const miles = numberValue(structuredBody.match(/(?:^|\n)\s*Distance\s*:?\s*(?:\n\s*)?([\d,]+)/im)?.[1] ?? "")
  const offer = moneyValue(bodyText.match(/(?:^|\n)\s*Rate\s*:?\s*(?:\n\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/im)?.[1] ?? "")
  const tracking = clean(allText.match(/(?:Track(?:ing)?\s+(?:Project\s*)?44|Project\s*44)/i)?.[0])
  const phone = clean(allText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0])

  if (!origin?.city || !origin.state) issues.push({ field: "origin", severity: "HIGH", message: "Origin is missing or incomplete." })
  if (!destination?.city || !destination.state) issues.push({ field: "destination", severity: "HIGH", message: "Destination is missing or incomplete." })
  if (!equipment) issues.push({ field: "equipment_type", severity: "HIGH", message: "Equipment is missing or ambiguous." })
  if (weight === null) issues.push({ field: "weight_lbs", severity: "HIGH", message: "Weight is missing or ambiguous." })
  const status = finalExtractionStatus(issues)
  const structuredCount = [origin, destination, loadNumber, equipment, commodity, miles, offer].filter(Boolean).length
  const confidence = issues.some((i) => i.severity === "HIGH") ? "LOW" : structuredCount >= 5 ? "HIGH" : "MEDIUM"
  raw.locations = { origin: origin?.raw, destination: destination?.raw }; raw.weights = weightCandidates; raw.pickup = pickupCandidates; raw.delivery = deliveryCandidates; raw.equipment = equipmentText

  return { broker_name: null, broker_contact_name: email.senderName ?? null, broker_email: email.senderEmail, broker_phone: phone, broker_load_number: loadNumber,
    origin_city: origin?.city ?? null, origin_state: origin?.state ?? null, origin_zip: origin?.zip ?? null, destination_city: destination?.city ?? null, destination_state: destination?.state ?? null, destination_zip: destination?.zip ?? null,
    pickup_date: selectedPickup?.date ?? null, pickup_time: selectedPickup?.time ?? null, pickup_datetime_raw: selectedPickup?.raw ?? null, delivery_date: selectedDelivery?.date ?? null, delivery_time: selectedDelivery?.time ?? null, delivery_datetime_raw: selectedDelivery?.raw ?? null,
    equipment_type: equipment, trailer_length: trailerLength, door_type: doorType, commodity, weight_lbs: weight, broker_reported_miles: miles, calculated_miles: null, mileage_status: "NOT_CONFIGURED", broker_offered_rate: offer,
    special_instructions: clean(comments), tracking_requirement: tracking, quote_validity_minutes: null, extraction_status: status, extraction_confidence: confidence, extraction_issues: issues, raw_extracted_values: raw }
}

function temporalCandidates(structured: string, comments: string, fallback: string, kind: "pickup" | "delivery", receivedAt: string): Candidate<{ date: string | null; time: string | null; raw: string }>[] {
  const candidates: Candidate<{ date: string | null; time: string | null; raw: string }>[] = [], label = kind === "pickup" ? "(?:Pickup(?! In)|P\\/?U\\b)" : "(?:Delivery(?! To)|DEL\\b)"
  for (const [text, source] of [[structured, "structured_body"], [comments, "comments"]] as const) { const regex = new RegExp(`${label}(?:\\s+(?:date|date/time))?\\s*:?\\s*(?:\\n\\s*)?([^\\n.]+)`, "i"), match = text.match(regex); if (match) candidates.push({ value: { ...resolveTemporal(match[1], receivedAt), raw: match[1].trim() }, raw: match[1], source }) }
  if (kind === "delivery" && !candidates.some((candidate) => candidate.source === "structured_body")) {
    const deliveryBlock = structured.match(/(?:Deliver To|Destination)[\s\S]*?(?=(?:\n|\t)\s*(?:Load Detail|Load\s*:?[\t ]*(?:\n|\t)|Equipment\b)|$)/i)?.[0] ?? ""
    const calendar = deliveryBlock.match(/(?:IMAGE_CALENDAR\s*)?((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+)?\d{1,2}(?:,?\s+\d{4})?(?:\s+at)?\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s+[A-Z]{2,5})?)/i)
    if (calendar) candidates.unshift({ value: { ...resolveTemporal(calendar[1], receivedAt), raw: calendar[1].trim() }, raw: calendar[1], source: "structured_body" })
  }
  if (!candidates.length) { const relative = kind === "pickup" ? fallback.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i) : fallback.match(/\b(\d{1,2}\s*[: ]\s*\d{2}\s*(?:am|pm)?\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d{1,2}\s*[: ]\s*\d{2}\s*(?:am|pm)?)/i); if (relative) candidates.push({ value: { ...resolveTemporal(relative[0], receivedAt), raw: relative[0] }, raw: relative[0], source: kind === "pickup" ? "subject" : "free_form" }) }
  return candidates
}
