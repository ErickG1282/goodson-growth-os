import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { processFreightEmail, type FreightEmailRepository } from "@/lib/freight-email/intake-service"
import type { RawFreightEmail } from "@/lib/freight-email/types"

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 })
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const token = authorization.replace(/^Bearer\s+/i, ""), { data: { user }, error: authError } = await client.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const input = await request.json() as RawFreightEmail
    if (!input.senderEmail?.trim() || !input.receivedAt || (!input.subject && !input.bodyText && !input.bodyHtml)) return NextResponse.json({ error: "Sender email, received timestamp, and email content are required." }, { status: 400 })
    const repository: FreightEmailRepository = {
      async findByExternalMessage(userId, externalMessageId) {
        const { data: email, error } = await client.from("gbgs_incoming_load_emails").select("id").eq("user_id", userId).eq("external_message_id", externalMessageId).maybeSingle()
        if (error) throw new Error(error.message)
        if (!email) return null
        const { data: opportunities, error: opportunityError } = await client.from("gbgs_load_opportunities").select("*").eq("source_email_id", email.id).order("created_at")
        if (opportunityError) throw new Error(opportunityError.message)
        return { emailId: email.id, opportunities: opportunities ?? [] }
      },
      async createEmail(userId, value) {
        const { data, error } = await client.from("gbgs_incoming_load_emails").insert({ user_id: userId, sender_name: value.senderName || null, sender_email: value.senderEmail.trim(), subject: value.subject || "", body_text: value.bodyText || null, body_html: value.bodyHtml || null, external_message_id: value.externalMessageId || null, received_at: value.receivedAt, processing_status: "NEW" }).select("id").single()
        if (error) throw new Error(error.message)
        return data.id
      },
      async insertOpportunities(rows) {
        const { error } = await client.from("gbgs_load_opportunities").upsert(rows, { onConflict: "source_email_id,opportunity_index", ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        const { data, error: readError } = await client.from("gbgs_load_opportunities").select("*").eq("source_email_id", rows[0].source_email_id).order("opportunity_index")
        if (readError) throw new Error(readError.message)
        return data ?? []
      },
      async updateEmail(emailId, values) {
        const { error } = await client.from("gbgs_incoming_load_emails").update(values).eq("id", emailId)
        if (error) throw new Error(error.message)
      },
    }
    return NextResponse.json(await processFreightEmail(repository, user.id, input))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse freight email." }, { status: 400 })
  }
}
