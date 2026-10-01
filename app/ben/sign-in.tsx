"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"
import styles from "./login.module.css"

export function BenSignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) setError(result.error.message)
      // The existing subscriber validates membership and loads the workspace.
    } catch { setError("Could not connect. Please try again.") }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className={styles.form} aria-busy={busy}>
    <span className={styles.lockBadge}><LockKeyhole size={32} strokeWidth={1.8} aria-hidden="true" /></span>
    <h2>Welcome to Ben OS</h2>
    <p className={styles.formIntro}>Sign in to access Berhane Abraha&apos;s<br className={styles.desktopBreak} /> business command center.</p>
    <div className={styles.fields}>
      <label className={styles.field} htmlFor="ben-email"><span className={styles.srOnly}>Email address</span><Mail size={24} aria-hidden="true" /><input id="ben-email" type="email" autoComplete="username" required placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
      <div className={styles.field}><label className={styles.srOnly} htmlFor="ben-password">Password</label><LockKeyhole size={24} aria-hidden="true" /><input id="ben-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /><button type="button" className={styles.eyeButton} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? <EyeOff size={23} /> : <Eye size={23} />}</button></div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign In"}<ArrowRight size={24} aria-hidden="true" /></button>
    {/* The shared Supabase client already persists sessions. Do not introduce a
        conflicting persistence setting that could affect the GBGS workspace. */}
    <label className={styles.remember} title="Your existing sign-in settings keep you signed in until you sign out."><input type="checkbox" checked disabled aria-describedby="ben-session-note" /><span>Keep me signed in</span></label>
    <p className={styles.sessionNote} id="ben-session-note">Your session stays signed in until you sign out.</p>
  </form>
}
