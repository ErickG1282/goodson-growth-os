import { QuoteRequests } from "@/components/dispatch-hq/quote-requests"
export default async function QuoteRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <QuoteRequests requestId={id} />
}
