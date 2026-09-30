import { NextResponse } from "next/server"
import { authenticateQuoteRequest } from "@/lib/freight-quoting/request-auth"
import { createQuoteRequest } from "@/lib/freight-quoting/quote-request-service"
import type { QuoteRequestInput } from "@/lib/freight-quoting/quote-request-types"

export async function POST(request: Request) {
  try {
    const auth = await authenticateQuoteRequest(request)
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const input = await request.json() as QuoteRequestInput & { approvalFingerprint?: string }
    const result = await createQuoteRequest(auth.client, auth.userId, input)
    return NextResponse.json(result, { status: result.outcome === "CREATED" ? 201 : result.outcome === "EXISTING" ? 200 : 409, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create quote request." }, { status: 400 })
  }
}
