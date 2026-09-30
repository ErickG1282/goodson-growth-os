import { NextResponse } from "next/server"
import { authenticateQuoteRequest } from "@/lib/freight-quoting/request-auth"
import { mutateBrokerReply, readBrokerReply } from "@/lib/freight-quoting/broker-reply-service"
import type { BrokerReplyCommand } from "@/lib/freight-quoting/broker-reply-types"

export async function GET(request: Request) {
  try {
    const auth = await authenticateQuoteRequest(request)
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const quoteId = new URL(request.url).searchParams.get("quoteRequestId") ?? ""
    return NextResponse.json(await readBrokerReply(auth.client, auth.userId, quoteId), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load draft." }, { status: 400 })
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticateQuoteRequest(request)
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const command = await request.json() as BrokerReplyCommand
    const result = await mutateBrokerReply(auth.client, auth.userId, command)
    return NextResponse.json(result, { status: result.outcome === "CONFLICT" ? 409 : 200, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save draft." }, { status: 400 })
  }
}
