"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { BrokerReplyCommand, BrokerReplyEdit, BrokerReplyResult, BrokerReplyRevision, BrokerReplyView } from "@/lib/freight-quoting/broker-reply-types"
import { fieldClass } from "./quoting-ui"

const editOf = (draft: BrokerReplyRevision): BrokerReplyEdit => ({ recipientEmail: draft.recipient_email, subject: draft.reply_subject, body: draft.reply_body })
export function BrokerReplyDraft({ quoteRequestId }: { quoteRequestId: string }) {
  const [draft, setDraft] = useState<BrokerReplyRevision | null>(null)
  const [history, setHistory] = useState<BrokerReplyRevision[]>([])
  const [edit, setEdit] = useState<BrokerReplyEdit>({ recipientEmail: "", subject: "", body: "" })
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(""), [loadError, setLoadError] = useState("")
  const inFlight = useRef(false)
  const headers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("You must be signed in.")
    return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setLoadError("")
    try {
      const response = await fetch(`/api/freight-quotes/broker-reply?quoteRequestId=${encodeURIComponent(quoteRequestId)}`, { headers: await headers(), cache: "no-store" })
      const result = await response.json() as BrokerReplyView & { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Unable to load draft.")
      setDraft(result.draft); setHistory(result.history)
      setEditing(false)
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load draft.") }
    finally { setLoading(false) }
  }, [headers, quoteRequestId])
  useEffect(() => { void load() }, [load])
  async function act(action: BrokerReplyCommand["action"]) {
    if (inFlight.current || loading || loadError) return
    if (action === "APPROVE" && editing) return
    inFlight.current = true; setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/freight-quotes/broker-reply", {
        method: "POST", headers: await headers(),
        body: JSON.stringify({ quoteRequestId, action, expectedRevision: draft?.revision, ...(action === "SAVE" ? { edit } : {}) }),
      })
      const result = await response.json() as BrokerReplyResult & { error?: string }
      if (result.outcome === "CONFLICT") {
        setDraft(result.draft); setEditing(false)
        setHistory(current => [result.draft, ...current.filter(row => row.id !== result.draft.id)])
        setMessage("A newer revision was saved elsewhere. Your changes were not saved. Review the latest draft before editing or approving again.")
        return
      }
      if (!response.ok) throw new Error(result.error ?? "Unable to save draft.")
      setDraft(result.draft); setEditing(false)
      setHistory(current => [result.draft, ...current.filter(row => row.id !== result.draft.id)])
      setMessage(result.outcome === "APPROVED" ? "Approved internally. Nothing was sent. Microsoft connection is not configured."
        : result.outcome === "EXISTING" ? "Showing the existing saved revision. No duplicate was created." : "Draft saved internally. Nothing was sent.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save draft. Retry safely.") }
    finally { inFlight.current = false; setBusy(false) }
  }
  const buttonClass = "rounded-lg bg-[#081C35] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
  return <section aria-label="Broker reply draft" className="mt-6 rounded-xl border-2 border-[#C9A227] bg-muted/20 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-black">Broker Reply Draft</h3><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">DRAFT — NOT SENT</span></div>
    <p className="mt-2 text-sm text-muted-foreground">Internal review only. Approval does not send an email, contact the broker, or book freight.</p>
    {loading ? <p className="mt-4">Loading draft…</p> : loadError ? <div className="mt-4"><p role="alert">{loadError}</p><button type="button" onClick={() => void load()} className={buttonClass + " mt-3"}>RELOAD DRAFT</button></div> : !draft ?
      <button type="button" disabled={busy} onClick={() => void act("GENERATE")} className={buttonClass + " mt-4"}>{busy ? "GENERATING…" : "GENERATE BROKER REPLY"}</button> :
      <>
        <p className="mt-4 font-bold">{draft.draft_status === "APPROVED" ? "APPROVED — NOT SENT" : "Ready for human review"} · Revision {draft.revision}</p>
        {editing ? <div className="mt-4 grid gap-4">
          <label className="grid gap-1 text-sm font-bold">To<input aria-label="Reply recipient" disabled={busy} type="email" value={edit.recipientEmail} onChange={e => setEdit({ ...edit, recipientEmail: e.target.value })} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm font-bold">Subject<input aria-label="Reply subject" disabled={busy} maxLength={300} value={edit.subject} onChange={e => setEdit({ ...edit, subject: e.target.value })} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm font-bold">Message<textarea aria-label="Reply message" disabled={busy} rows={11} maxLength={10000} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} className={fieldClass} /></label>
          <p className="text-sm text-muted-foreground">Keep the saved offer line unchanged. Do not include internal pricing details. Saving an edit clears prior approval.</p>
          <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void act("SAVE")} className={buttonClass}>SAVE DRAFT</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className={buttonClass}>CANCEL EDIT</button></div>
        </div> : <>
          <dl className="mt-4 grid gap-3"><div><dt className="text-sm font-bold">To:</dt><dd className="break-all">{draft.recipient_email}</dd></div><div><dt className="text-sm font-bold">Subject:</dt><dd>{draft.reply_subject}</dd></div><div><dt className="text-sm font-bold">Message:</dt><dd className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-sm">{draft.reply_body}</dd></div></dl>
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setEdit(editOf(draft)); setEditing(true); setMessage("") }} className={buttonClass}>EDIT DRAFT</button><button type="button" disabled={busy || draft.draft_status === "APPROVED"} onClick={() => void act("APPROVE")} className="rounded-lg bg-[#C9A227] px-4 py-3 text-sm font-black text-[#081C35] disabled:opacity-50">APPROVE FOR SENDING</button></div>
          <p className="mt-2 text-xs text-muted-foreground">Microsoft connection is not configured. Sending is unavailable.</p>
        </>}
        <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-bold">Draft revision history ({history.length})</summary><div className="mt-3 grid gap-3">{history.map(row => <details key={row.id} className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm">Revision {row.revision} · {row.action} · {new Date(row.recorded_at).toLocaleString()}</summary>
          <p className="mt-2 break-all text-xs">Recorded by: {row.recorded_by}</p>
          <p className="text-xs">Generated: {row.generated_at} · By: {row.generated_by}</p>
          {row.approved_at && <p className="text-xs">Approved: {row.approved_at} · By: {row.approved_by}</p>}
          <p className="mt-2 text-sm">To: {row.recipient_email}</p><p className="text-sm">Subject: {row.reply_subject}</p><pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{row.reply_body}</pre>
        </details>)}</div></details>
      </>}
    {message && <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{message}</p>}
  </section>
}
