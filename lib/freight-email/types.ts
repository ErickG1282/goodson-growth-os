export type RawFreightEmail = { senderName?: string | null; senderEmail: string; subject: string; bodyText?: string | null; bodyHtml?: string | null; receivedAt: string; externalMessageId?: string | null }
export type ExtractionIssue = { field: string; value_a?: unknown; source_a?: string; value_b?: unknown; source_b?: string; severity: "HIGH" | "MEDIUM" | "LOW"; message?: string }
export type ExtractionStatus = "READY_TO_QUOTE" | "NEEDS_REVIEW" | "ERROR"
export type ExtractionConfidence = "HIGH" | "MEDIUM" | "LOW"
export type LoadOpportunityExtraction = {
  broker_name: string | null; broker_contact_name: string | null; broker_email: string; broker_phone: string | null; broker_load_number: string | null
  origin_city: string | null; origin_state: string | null; origin_zip: string | null; destination_city: string | null; destination_state: string | null; destination_zip: string | null
  pickup_date: string | null; pickup_time: string | null; pickup_datetime_raw: string | null; delivery_date: string | null; delivery_time: string | null; delivery_datetime_raw: string | null
  equipment_type: string | null; trailer_length: number | null; door_type: string | null; commodity: string | null; weight_lbs: number | null
  broker_reported_miles: number | null; calculated_miles: number | null; mileage_status: string; broker_offered_rate: number | null
  special_instructions: string | null; tracking_requirement: string | null; quote_validity_minutes: number | null
  extraction_status: ExtractionStatus; extraction_confidence: ExtractionConfidence; extraction_issues: ExtractionIssue[]; raw_extracted_values: Record<string, unknown>
}
