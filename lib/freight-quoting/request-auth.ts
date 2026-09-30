import { createClient } from "@supabase/supabase-js"

export async function authenticateQuoteRequest(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase is not configured.")
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: { user }, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ""))
  return error || !user ? null : { client, userId: user.id }
}
