import { NextResponse } from "next/server"
import { authenticateQuoteRequest } from "@/lib/freight-quoting/request-auth"
import { previewQuoteRequest } from "@/lib/freight-quoting/quote-request-service"
import type { QuoteRequestInput } from "@/lib/freight-quoting/quote-request-types"

export async function POST(request: Request) {
  try {
    const auth = await authenticateQuoteRequest(request)
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const input = await request.json() as QuoteRequestInput
    const result = await previewQuoteRequest(auth.client, auth.userId, input)
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to preview pricing." }, { status: 400 })
  }
}
