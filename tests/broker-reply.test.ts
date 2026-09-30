import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { mutateBrokerReply, readBrokerReply, validBrokerEmail } from "../lib/freight-quoting/broker-reply-service"
import { GET, POST } from "../app/api/freight-quotes/broker-reply/route"
import { brokerFixture, draftQuote, draftUser, draftTable } from "./fixtures/broker-reply-fixture"
import type { BrokerReplyRevision } from "../lib/freight-quoting/broker-reply-types"

const originalFetch = globalThis.fetch
before(() => { globalThis.fetch = async () => { throw new Error("All network calls are forbidden in broker draft tests") } })
after(() => { globalThis.fetch = originalFetch })
const generate = (f = brokerFixture(), extra = {}) => mutateBrokerReply(f.client, draftUser, { quoteRequestId: draftQuote, action: "GENERATE", ...extra })
const editOf = (d: BrokerReplyRevision) => ({ recipientEmail: d.recipient_email, subject: d.reply_subject, body: d.reply_body })
const approve = (f: ReturnType<typeof brokerFixture>, revision = 1) => mutateBrokerReply(f.client, draftUser, { quoteRequestId: draftQuote, action: "APPROVE", expectedRevision: revision })
test("generation uses only saved $1,450 quote and source sender, not row price or opportunity broker address", async () => {
  const f = brokerFixture(), result = await generate(f), d = result.draft
  assert.equal(result.outcome, "GENERATED")
  assert.equal(d.recipient_email, "broker@example.test")
  assert.equal(d.reply_subject, "RE: Atlanta to Orlando load")
  assert.equal(d.reply_body, "Hello,\n\nWe can offer $1,450 for this load from Atlanta, GA to Orlando, FL.\n\nPlease let me know if this works for you.\n\nThank you,\nAbraha Transportation Inc.\nDispatch Team")
  assert.equal(d.draft_status, "DRAFT"); assert.equal(d.original_external_message_id, "original-message-1")
  assert.equal(d.generated_by, draftUser); assert.equal(d.recorded_by, draftUser); assert.ok(Date.parse(d.generated_at))
  assert.equal(d.sent_at, null); assert.equal(d.approved_at, null); assert.equal(d.sending_status, "NOT_CONFIGURED")
})
test("existing RE prefix is preserved without repeated prefixing", async () => {
  const f=brokerFixture(); f.records.gbgs_incoming_load_emails[0].subject="Re: Load 42"
  assert.equal((await generate(f)).draft.reply_subject, "Re: Load 42")
})
test("original subject is stored verbatim and folded header is normalized for reply", async () => {
  const f=brokerFixture(); f.records.gbgs_incoming_load_emails[0].subject="Load\r\n 42"
  const d=(await generate(f)).draft
  assert.equal(d.original_subject,"Load\r\n 42"); assert.ok(!/[\r\n]/.test(d.reply_subject))
})
test("empty subject gets a safe fallback", async () => {
  const f=brokerFixture(); f.records.gbgs_incoming_load_emails[0].subject=""
  assert.equal((await generate(f)).draft.reply_subject,"RE: Freight load")
})
test("repeat generation returns saved edits and never duplicates or overwrites them", async () => {
  const f=brokerFixture(), d=(await generate(f)).draft
  await mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit:{...editOf(d),body:d.reply_body+"\nPlease confirm availability."}})
  const repeated=await generate(f)
  assert.equal(repeated.outcome,"EXISTING"); assert.equal(repeated.draft.revision,2); assert.equal(f.records[draftTable].length,2)
})
test("concurrent generation creates exactly one first revision", async () => {
  const f=brokerFixture(), results=await Promise.all([generate(f),generate(f)])
  assert.deepEqual(results.map(r=>r.outcome).sort(),["EXISTING","GENERATED"]); assert.equal(f.records[draftTable].length,1)
})
test("edit/save appends exact content and preserves original revision and generation metadata", async () => {
  const f=brokerFixture(), d=(await generate(f)).draft
  const edit={recipientEmail:"dispatcher@example.test",subject:"RE: Atlanta to Orlando load - offer",body:d.reply_body.replace("Hello,","Good morning,")}
  const saved=await mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit})
  assert.equal(saved.outcome,"SAVED"); assert.equal(saved.draft.previous_revision,1); assert.equal(saved.draft.action,"EDITED")
  assert.deepEqual(editOf(saved.draft),edit); assert.equal(saved.draft.generated_at,d.generated_at)
  assert.equal(f.records[draftTable][0].reply_body,d.reply_body)
  assert.equal((await readBrokerReply(f.client,draftUser,draftQuote)).history.length,2)
})
test("approval appends internal-only approved revision and repeated approval is idempotent", async () => {
  const f=brokerFixture(); await generate(f)
  const a=await approve(f)
  assert.equal(a.outcome,"APPROVED"); assert.equal(a.draft.approved_by,draftUser); assert.ok(a.draft.approved_at)
  assert.equal(a.draft.sent_at,null); assert.equal(a.draft.sending_status,"NOT_CONFIGURED")
  assert.equal((await approve(f)).outcome,"EXISTING"); assert.equal((await approve(f,2)).outcome,"EXISTING")
  assert.equal(f.records[draftTable].length,2)
})
test("concurrent approval appends only one approved revision", async () => {
  const f=brokerFixture(); await generate(f)
  const results=await Promise.all([approve(f),approve(f)])
  assert.deepEqual(results.map(r=>r.outcome).sort(),["APPROVED","EXISTING"]); assert.equal(f.records[draftTable].length,2)
})
test("editing approved content clears approval and requires another explicit approval", async () => {
  const f=brokerFixture(); await generate(f); const a=(await approve(f)).draft
  const saved=await mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:2,edit:{...editOf(a),body:a.reply_body.replace("Hello,","Hello again,")}})
  assert.equal(saved.draft.draft_status,"DRAFT"); assert.equal(saved.draft.approved_at,null); assert.equal(saved.draft.approved_by,null)
})
test("repeated save is idempotent", async () => {
  const f=brokerFixture(), d=(await generate(f)).draft
  const command={quoteRequestId:draftQuote,action:"SAVE" as const,expectedRevision:1,edit:{...editOf(d),body:d.reply_body+"\nThank you for reviewing."}}
  await mutateBrokerReply(f.client,draftUser,command)
  assert.equal((await mutateBrokerReply(f.client,draftUser,command)).outcome,"EXISTING"); assert.equal(f.records[draftTable].length,2)
})
test("stale approval after an edit returns conflict without approving unseen content", async () => {
  const f=brokerFixture(), d=(await generate(f)).draft
  await mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit:{...editOf(d),body:d.reply_body+"\nThanks again."}})
  assert.equal((await approve(f)).outcome,"CONFLICT"); assert.equal(f.records[draftTable].length,2)
})
test("competing different edits cannot overwrite each other", async () => {
  const f=brokerFixture(), d=(await generate(f)).draft
  const results=await Promise.all(["Hello team,","Greetings,"].map(greeting=>mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit:{...editOf(d),body:d.reply_body.replace("Hello,",greeting)}})))
  assert.deepEqual(results.map(r=>r.outcome).sort(),["CONFLICT","SAVED"]); assert.equal(f.records[draftTable].length,2)
})
test("ownership protection blocks reads, generation and approval by another user", async () => {
  const f=brokerFixture(); await generate(f)
  await assert.rejects(readBrokerReply(f.client,"other",draftQuote),/not found/)
  await assert.rejects(mutateBrokerReply(f.client,"other",{quoteRequestId:draftQuote,action:"GENERATE"}),/not found/)
  await assert.rejects(mutateBrokerReply(f.client,"other",{quoteRequestId:draftQuote,action:"APPROVE",expectedRevision:1}),/not found/)
})
test("unauthenticated GET and POST are rejected without any network calls", async () => {
  assert.equal((await GET(new Request("http://localhost/api/freight-quotes/broker-reply"))).status,401)
  assert.equal((await POST(new Request("http://localhost/api/freight-quotes/broker-reply",{method:"POST"}))).status,401)
})
test("missing quote fails safely", async () => {
  const f=brokerFixture(); f.records.gbgs_quote_requests=[]
  await assert.rejects(generate(f),/not found/); assert.equal(f.writes.length,0)
})
for (const recipient of ["", "bad", "a@example", "a\r\nBcc:x@example.com", "a@example.com,b@example.com", ".a@example.com"]) {
  test("invalid original recipient rejected: "+JSON.stringify(recipient), async () => {
    const f=brokerFixture(); f.records.gbgs_incoming_load_emails[0].sender_email=recipient
    await assert.rejects(generate(f),/recipient/); assert.equal(f.writes.length,0)
  })
}
for (const change of [null, {}, { recommended_quote: "1450" }, { recommended_quote: NaN }, { recommended_quote: -1 }, { origin: null }, { mileage_provider: "PTV" }, { user_id: "other" }, { pricing_decision: "DECLINE" }]) {
  test("missing or malformed snapshot blocked: "+JSON.stringify(change), async () => {
    const f=brokerFixture()
    f.records.gbgs_quote_requests[0].pricing_snapshot=change===null?null:Object.keys(change).length?{...f.records.gbgs_quote_requests[0].pricing_snapshot,...change}:{}
    await assert.rejects(generate(f),/snapshot/); assert.equal(f.writes.length,0)
  })
}
test("ineligible status and non-email source fail safely", async () => {
  for (const changes of [{status:"Accepted"},{status:"Declined"},{status:"Quoted"},{source:"Manual"}]) {
    const f=brokerFixture(); Object.assign(f.records.gbgs_quote_requests[0],changes)
    await assert.rejects(generate(f),/eligible/)
  }
})
test("missing or cross-owner source links block drafting", async () => {
  for(const table of ["gbgs_load_opportunities","gbgs_incoming_load_emails"]) {
    const f=brokerFixture(); f.records[table][0].user_id="other"
    await assert.rejects(generate(f),/identified/); assert.equal(f.writes.length,0)
  }
})
test("browser price, ownership, mileage and send flags are ignored", async () => {
  const f=brokerFixture()
  const result=await generate(f,{user_id:"attacker",price:1,mileage:1,send:true,approved_by:"attacker"})
  assert.ok(result.draft.reply_body.includes("$1,450")); assert.equal(result.draft.user_id,draftUser); assert.equal(result.draft.approved_by,null)
})
test("changed saved quote amount blocks approving an old message", async () => {
  const f=brokerFixture(); await generate(f)
  f.records.gbgs_quote_requests[0].pricing_snapshot.recommended_quote=1500
  await assert.rejects(approve(f),/offer line/); assert.equal(f.records[draftTable].length,1)
})
test("source change blocks old draft approval", async () => {
  const f=brokerFixture(); await generate(f)
  f.records.gbgs_incoming_load_emails[0].subject="Different source"
  await assert.rejects(approve(f),/source/); assert.equal(f.records[draftTable].length,1)
})
test("editing cannot alter saved offered price or expose internal calculations", async () => {
  const f=brokerFixture(),d=(await generate(f)).draft
  for(const body of [d.reply_body.replace("$1,450","$999"),d.reply_body+"\nRPM: 3.30",d.reply_body+"\nLane premium: 109.75",d.reply_body+"\nAlternative: $1",d.reply_body+"\n"+draftQuote]) {
    await assert.rejects(mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit:{...editOf(d),body}}))
  }
  assert.equal(f.records[draftTable].length,1)
})
test("invalid edited recipient and subject injection are rejected", async () => {
  const f=brokerFixture(),d=(await generate(f)).draft
  for(const edit of [{...editOf(d),recipientEmail:"bad"},{...editOf(d),subject:"Hi\r\nBcc: x@example.com"}]) {
    await assert.rejects(mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit}))
  }
})
test("approval without generation and unsupported send action are rejected", async () => {
  const f=brokerFixture()
  await assert.rejects(approve(f),/Generate/)
  await assert.rejects(generate(f,{action:"SEND"}),/Invalid draft action/)
})
test("database failure does not report a saved draft", async () => {
  const f=brokerFixture(); f.controls.failInsert=true
  await assert.rejects(generate(f),/Unable to save/); assert.equal(f.records[draftTable].length,0)
})
test("draft actions neither recalculate nor call providers, email, Microsoft, rules, or quote/history mutations", async () => {
  const f=brokerFixture(), before=JSON.stringify(f.records)
  const d=(await generate(f)).draft
  await mutateBrokerReply(f.client,draftUser,{quoteRequestId:draftQuote,action:"SAVE",expectedRevision:1,edit:{...editOf(d),body:d.reply_body+"\nWe appreciate your consideration."}})
  await approve(f,2)
  assert.ok(f.writes.every(t=>t===draftTable))
  const initial=JSON.parse(before)
  for(const name of Object.keys(initial).filter(t=>t!==draftTable)) assert.deepEqual(f.records[name],initial[name])
  assert.deepEqual([...new Set(f.reads)].sort(),[draftTable,"gbgs_incoming_load_emails","gbgs_load_opportunities","gbgs_quote_requests"].sort())
})
test("normal email address validation accepts broker plus addressing", () => { assert.ok(validBrokerEmail("dispatch+loads@example.com")) })

test("live original GBGS TEST subject is preserved without disclosing generated internal details", async () => {
  const f=brokerFixture()
  f.records.gbgs_incoming_load_emails[0].subject="[GBGS TEST] Email Intake V1 immutable evidence"
  f.records.gbgs_incoming_load_emails[0].sender_email="email-intake-test@example.invalid"
  const d=(await generate(f)).draft
  assert.equal(d.reply_subject,"RE: [GBGS TEST] Email Intake V1 immutable evidence")
  assert.equal(d.recipient_email,"email-intake-test@example.invalid")
  assert.ok(d.reply_body.includes("We can offer $1,450 for this load from Atlanta, GA to Orlando, FL."))
  assert.ok(!/GBGS|RPM|Trimble|lane premium/.test(d.reply_body))
  assert.equal((await approve(f)).outcome,"APPROVED")
})