import { parseFreightEmail } from "./email-parser"
import type { LoadOpportunityExtraction, RawFreightEmail } from "./types"

export type StoredIntake = { emailId: string; opportunities: Record<string, unknown>[] }
export interface FreightEmailRepository {
  findByExternalMessage(userId: string, externalMessageId: string): Promise<StoredIntake | null>
  createEmail(userId: string, input: RawFreightEmail): Promise<string>
  insertOpportunities(rows: Array<LoadOpportunityExtraction & { user_id: string; source_email_id: string; opportunity_index: number }>): Promise<Record<string, unknown>[]>
  updateEmail(emailId: string, values: { processing_status: string; processing_error?: string | null }): Promise<void>
}

export function summarizeProcessingStatus(opportunities: LoadOpportunityExtraction[]) {
  const ready = opportunities.filter((item) => item.extraction_status === "READY_TO_QUOTE").length
  if (!opportunities.length || opportunities.every((item) => item.extraction_status === "ERROR")) return "ERROR"
  if (ready === opportunities.length) return "PARSED"
  if (ready > 0) return "PARTIAL_REVIEW"
  return "NEEDS_REVIEW"
}

export async function processFreightEmail(repository: FreightEmailRepository, userId: string, input: RawFreightEmail): Promise<StoredIntake & { reused: boolean }> {
  if (input.externalMessageId) {
    const existing = await repository.findByExternalMessage(userId, input.externalMessageId)
    if (existing?.opportunities.length) return { ...existing, reused: true }
  }
  let emailId: string
  try { emailId = await repository.createEmail(userId, input) }
  catch (error) {
    if (!input.externalMessageId) throw error
    const existing = await repository.findByExternalMessage(userId, input.externalMessageId)
    if (!existing) throw error
    if (existing.opportunities.length) return { ...existing, reused: true }
    emailId = existing.emailId
  }
  try {
    const extracted = parseFreightEmail(input)
    const rows = extracted.map((item, opportunity_index) => ({ ...item, user_id: userId, source_email_id: emailId, opportunity_index }))
    const opportunities = await repository.insertOpportunities(rows)
    await repository.updateEmail(emailId, { processing_status: summarizeProcessingStatus(extracted), processing_error: null })
    return { emailId, opportunities, reused: false }
  } catch (error) {
    await repository.updateEmail(emailId, { processing_status: "ERROR", processing_error: error instanceof Error ? error.message : "Unable to parse freight email." })
    throw error
  }
}
