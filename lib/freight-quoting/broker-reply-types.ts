export type BrokerReplyRevision = {
  id: string
  user_id: string
  quote_request_id: string
  source_opportunity_id: string
  source_email_id: string
  revision: number
  previous_revision: number | null
  action: "GENERATED" | "EDITED" | "APPROVED"
  draft_status: "DRAFT" | "APPROVED"
  recipient_email: string
  original_subject: string
  original_external_message_id: string | null
  reply_subject: string
  reply_body: string
  generated_by: string
  generated_at: string
  recorded_by: string
  recorded_at: string
  approved_by: string | null
  approved_at: string | null
  sending_status: "NOT_CONFIGURED"
  sent_at: null
  sending_error: null
}
export type BrokerReplyEdit = { recipientEmail: string; subject: string; body: string }
export type BrokerReplyCommand = {
  quoteRequestId: string
  action: "GENERATE" | "SAVE" | "APPROVE"
  expectedRevision?: number
  edit?: BrokerReplyEdit
}
export type BrokerReplyResult = {
  outcome: "GENERATED" | "SAVED" | "APPROVED" | "EXISTING" | "CONFLICT"
  draft: BrokerReplyRevision
  message?: string
}
export type BrokerReplyView = { draft: BrokerReplyRevision | null; history: BrokerReplyRevision[] }
