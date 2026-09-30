import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { calculateFreightQuote } from "@/lib/freight-quoting/pricing-service"
import type { QuoteInput } from "@/lib/freight-quoting/types"

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 })

  const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: { user }, error: authError } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ""))
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const input = await request.json() as QuoteInput
    const result = await calculateFreightQuote(client, user.id, input)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to calculate quote." }, { status: 400 })
  }
}
