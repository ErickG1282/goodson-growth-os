import type { SupabaseClient } from "@supabase/supabase-js"
import type { PricingSnapshot } from "./quote-request-types"
import type { BrokerReplyCommand, BrokerReplyEdit, BrokerReplyResult, BrokerReplyRevision, BrokerReplyView } from "./broker-reply-types"

const table = "gbgs_broker_reply_draft_revisions"
type Quote = { id: string; user_id: string; source: string; status: string; source_opportunity_id: string | null; pricing_snapshot: unknown }
type SourceEmail = { id: string; user_id: string; sender_email: string; subject: string; external_message_id: string | null }
type Context = { quote: Quote; snapshot: PricingSnapshot; email: SourceEmail; opportunityId: string }
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const singleLine = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 300 && !/[\r\n\x00-\x1f]/.test(v)
export function validBrokerEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254 || value !== value.trim() || /[\s\x00-\x1f<>(),;:]/.test(value)) return false
  const parts = value.split("@")
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 || parts[0].startsWith(".") || parts[0].endsWith(".") || parts[0].includes("..")) return false
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) && parts[1].split(".").length >= 2 &&
    parts[1].split(".").every(part => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part))
}
function validateSnapshot(value: unknown, quote: Quote): PricingSnapshot {
  if (!isObject(value) || value.schema_version !== 1 || value.user_id !== quote.user_id ||
    value.source_opportunity_id !== quote.source_opportunity_id || value.pricing_decision !== "QUOTE" ||
    value.status !== "New" || value.mileage_provider !== "TRIMBLE") throw new Error("Saved pricing snapshot is missing or invalid.")
  for (const side of ["origin", "destination"]) {
    const location = value[side]
    if (!isObject(location) || !singleLine(location.city) || !singleLine(location.state)) throw new Error("Saved pricing snapshot has an invalid lane.")
  }
  for (const field of ["trimble_truck_miles", "weight_lbs", "recommended_quote", "effective_rpm"]) {
    if (!finite(value[field]) || value[field] <= 0) throw new Error("Saved pricing snapshot has invalid pricing values.")
  }
  for (const field of ["unrounded_base_rate", "lane_premium_per_mile", "lane_premium", "stop_charges"]) {
    if (!finite(value[field]) || value[field] < 0) throw new Error("Saved pricing snapshot has invalid pricing values.")
  }
  for (const field of ["pickup_count", "delivery_count", "additional_stops"]) {
    if (!Number.isSafeInteger(value[field]) || (value[field] as number) < (field === "additional_stops" ? 0 : 1)) throw new Error("Saved pricing snapshot has invalid stop counts.")
  }
  if (value.opening_distance_rpm !== null && (!finite(value.opening_distance_rpm) || value.opening_distance_rpm < 0)) throw new Error("Saved pricing snapshot has invalid RPM.")
  for (const field of ["broker_reported_miles", "broker_offered_rate"]) {
    if (value[field] !== null && (!finite(value[field]) || value[field] < 0)) throw new Error("Saved pricing snapshot has invalid reference values.")
  }
  if (!singleLine(value.destination_pricing_region) || !singleLine(value.mileage_calculation_id) ||
    !singleLine(value.created_at) || !Number.isFinite(Date.parse(value.created_at)) ||
    !singleLine(value.calculated_at) || !Number.isFinite(Date.parse(value.calculated_at))) throw new Error("Saved pricing snapshot is incomplete.")
  return value as unknown as PricingSnapshot
}
async function context(client: SupabaseClient, userId: string, quoteId: string): Promise<Context> {
  if (!userId) throw new Error("Unauthorized")
  if (typeof quoteId !== "string" || !quoteId.trim()) throw new Error("Quote Request ID is required.")
  const query = await client.from("gbgs_quote_requests").select("id,user_id,source,status,source_opportunity_id,pricing_snapshot").eq("id", quoteId).eq("user_id", userId).single()
  if (query.error || !query.data) throw new Error("Quote request not found or not accessible.")
  const quote = query.data as Quote
  if (quote.source !== "Email" || quote.status !== "New" || !quote.source_opportunity_id) throw new Error("Only New Email Intake quote requests are eligible for a broker reply.")
  const snapshot = validateSnapshot(quote.pricing_snapshot, quote)
  const opportunity = await client.from("gbgs_load_opportunities").select("id,user_id,source_email_id").eq("id", quote.source_opportunity_id).eq("user_id", userId).single()
  if (opportunity.error || !opportunity.data?.source_email_id) throw new Error("Original Email Intake opportunity cannot be identified.")
  const source = await client.from("gbgs_incoming_load_emails").select("id,user_id,sender_email,subject,external_message_id").eq("id", opportunity.data.source_email_id).eq("user_id", userId).single()
  if (source.error || !source.data) throw new Error("Original broker email cannot be identified.")
  const email = source.data as SourceEmail
  if (!validBrokerEmail(email.sender_email)) throw new Error("Original broker recipient email is missing or invalid.")
  if (typeof email.subject !== "string") throw new Error("Original email subject is unavailable.")
  return { quote, snapshot, email, opportunityId: quote.source_opportunity_id }
}
function offerLine(snapshot: PricingSnapshot) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(snapshot.recommended_quote) ? 0 : 2, maximumFractionDigits: 2 }).format(snapshot.recommended_quote)
  return `We can offer ${amount} for this load from ${snapshot.origin.city}, ${snapshot.origin.state} to ${snapshot.destination.city}, ${snapshot.destination.state}.`
}
export function composeBrokerReply(snapshot: PricingSnapshot, originalSubject: string): { subject: string; body: string } {
  const subject = originalSubject.replace(/[\r\n]+/g, " ").trim()
  return {
    subject: /^re\s*:/i.test(subject) ? subject : `RE: ${subject || "Freight load"}`,
    body: `Hello,\n\n${offerLine(snapshot)}\n\nPlease let me know if this works for you.\n\nThank you,\nAbraha Transportation Inc.\nDispatch Team`,
  }
}
function validateContent(edit: BrokerReplyEdit, ctx: Context) {
  if (!edit || !validBrokerEmail(edit.recipientEmail)) throw new Error("Enter one valid recipient email.")
  if (!singleLine(edit.subject)) throw new Error("Reply subject must be a single line of 1–300 characters.")
  if (typeof edit.body !== "string" || !edit.body.trim() || edit.body.length > 10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(edit.body)) throw new Error("Reply message must contain 1–10,000 characters of plain text.")
  const line = offerLine(ctx.snapshot)
  if (!edit.body.split(/\r?\n/).includes(line) || edit.body.split(line).length !== 2) throw new Error("Keep the saved quote offer line unchanged. Pricing cannot be changed in a reply draft.")
  const rest = edit.body.replace(line, "")
  if (/\$\s*\d/.test(rest)) throw new Error("Do not add a different price to the saved quote offer.")
  const internal = /\b(?:RPM|base[ _-]?rate|lane[ _-]?premium|pricing[ _-]?rules?|margin|stop[ _-]?charges?|Trimble|PC\*?Miler|GBGS|internal[ _-]?notes?|quote[ _-]?request[ _-]?id|api[ _-]?key)\b/i
  if (internal.test(edit.body) || (internal.test(edit.subject) && edit.subject !== composeBrokerReply(ctx.snapshot, ctx.email.subject).subject) || edit.body.includes(ctx.quote.id) || edit.body.includes(ctx.quote.user_id)) throw new Error("Remove internal pricing, identifiers, or configuration from the broker reply.")
}
async function latest(client: SupabaseClient, userId: string, quoteId: string) {
  const result = await client.from(table).select("*").eq("quote_request_id", quoteId).eq("user_id", userId).order("revision", { ascending: false }).limit(1).maybeSingle()
  if (result.error) throw new Error("Unable to load broker reply draft.")
  return result.data as BrokerReplyRevision | null
}
function matchesSource(draft: BrokerReplyRevision, ctx: Context) {
  if (draft.source_email_id !== ctx.email.id || draft.source_opportunity_id !== ctx.opportunityId ||
    draft.original_subject !== ctx.email.subject || draft.original_external_message_id !== (ctx.email.external_message_id ?? null)) throw new Error("Draft source no longer matches the original email. Review is required.")
}
const sameEdit = (draft: BrokerReplyRevision, edit: BrokerReplyEdit) => draft.recipient_email === edit.recipientEmail && draft.reply_subject === edit.subject && draft.reply_body === edit.body
export async function readBrokerReply(client: SupabaseClient, userId: string, quoteId: string): Promise<BrokerReplyView> {
  const ctx = await context(client, userId, quoteId)
  const result = await client.from(table).select("*").eq("quote_request_id", quoteId).eq("user_id", userId).order("revision", { ascending: false })
  if (result.error) throw new Error("Unable to load broker reply history.")
  const history = (result.data ?? []) as BrokerReplyRevision[]
  if (history[0]) matchesSource(history[0], ctx)
  return { draft: history[0] ?? null, history }
}
export async function mutateBrokerReply(client: SupabaseClient, userId: string, command: BrokerReplyCommand): Promise<BrokerReplyResult> {
  if (!command || !["GENERATE", "SAVE", "APPROVE"].includes(command.action)) throw new Error("Invalid draft action.")
  const ctx = await context(client, userId, command.quoteRequestId)
  const current = await latest(client, userId, ctx.quote.id)
  if (current) matchesSource(current, ctx)
  if (command.action === "GENERATE" && current) return { outcome: "EXISTING", draft: current }
  if (command.action !== "GENERATE" && !current) throw new Error("Generate a broker reply draft first.")
  const conflict = (draft: BrokerReplyRevision): BrokerReplyResult => ({ outcome: "CONFLICT", draft, message: "A newer draft revision exists. Review it before saving or approving." })
  if (command.action !== "GENERATE") {
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision! < 1) throw new Error("The reviewed draft revision is required.")
    if (current!.revision !== command.expectedRevision) {
      const isRetry = current!.previous_revision === command.expectedRevision
      if (isRetry && command.action === "APPROVE" && current!.action === "APPROVED") {
        validateContent({ recipientEmail: current!.recipient_email, subject: current!.reply_subject, body: current!.reply_body }, ctx)
        return { outcome: "EXISTING", draft: current! }
      }
      if (isRetry && command.action === "SAVE" && command.edit && current!.action === "EDITED" && sameEdit(current!, command.edit)) return { outcome: "EXISTING", draft: current! }
      return conflict(current!)
    }
  }
  const generated = composeBrokerReply(ctx.snapshot, ctx.email.subject)
  const edit: BrokerReplyEdit = command.action === "GENERATE"
    ? { recipientEmail: ctx.email.sender_email, subject: generated.subject, body: generated.body }
    : command.action === "SAVE" ? command.edit! : { recipientEmail: current!.recipient_email, subject: current!.reply_subject, body: current!.reply_body }
  validateContent(edit, ctx)
  if (current && ((command.action === "SAVE" && sameEdit(current, edit)) || (command.action === "APPROVE" && current.draft_status === "APPROVED"))) return { outcome: "EXISTING", draft: current }
  const now = new Date().toISOString()
  const payload: Omit<BrokerReplyRevision, "id"> = {
    user_id: userId, quote_request_id: ctx.quote.id, source_opportunity_id: ctx.opportunityId, source_email_id: ctx.email.id,
    revision: (current?.revision ?? 0) + 1, previous_revision: current?.revision ?? null,
    action: command.action === "GENERATE" ? "GENERATED" : command.action === "SAVE" ? "EDITED" : "APPROVED",
    draft_status: command.action === "APPROVE" ? "APPROVED" : "DRAFT",
    recipient_email: edit.recipientEmail, original_subject: ctx.email.subject, original_external_message_id: ctx.email.external_message_id ?? null,
    reply_subject: edit.subject, reply_body: edit.body,
    generated_by: current?.generated_by ?? userId, generated_at: current?.generated_at ?? now,
    recorded_by: userId, recorded_at: now,
    approved_by: command.action === "APPROVE" ? userId : null, approved_at: command.action === "APPROVE" ? now : null,
    sending_status: "NOT_CONFIGURED", sent_at: null, sending_error: null,
  }
  const result = await client.from(table).insert(payload).select("*").single()
  if (result.error) {
    if (result.error.code === "23505") {
      const winner = await latest(client, userId, ctx.quote.id)
      if (winner) {
        const sameRequest = winner.previous_revision === payload.previous_revision && winner.action === payload.action && sameEdit(winner, edit)
        return command.action === "GENERATE" || sameRequest ? { outcome: "EXISTING", draft: winner } : conflict(winner)
      }
    }
    throw new Error("Unable to save broker reply. Retry safely; existing revisions are preserved.")
  }
  return { outcome: command.action === "SAVE" ? "SAVED" : command.action === "APPROVE" ? "APPROVED" : "GENERATED", draft: result.data as BrokerReplyRevision }
}
