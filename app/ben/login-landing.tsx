"use client"

import { Crown, LoaderCircle } from "lucide-react"
import { BenSignIn } from "./sign-in"
import styles from "./login.module.css"

export function BenLoginLanding({ loading = false }: { loading?: boolean }) {
  return <main className={styles.landing}>
    <div className={styles.content}>
      <header className={styles.brand} aria-label="Ben OS — Business Operating System">
        <Crown className={styles.crown} strokeWidth={2} aria-hidden="true" />
        <div className={styles.wordmark}>BEN <span>OS</span></div>
        <p className={styles.brandCaption}>BUSINESS OPERATING SYSTEM</p>
      </header>
      <section className={styles.hero} aria-labelledby="ben-login-title">
        <h1 id="ben-login-title">All of Your Businesses.<br /><span>One Command Center.</span></h1>
        <p className={styles.tagline}>Organize. Track. Manage. Grow.</p>
        <p className={styles.description}>A complete view of Berhane Abraha&apos;s businesses,<br className={styles.desktopBreak} /> financials, and operations.</p>
      </section>
      <section className={styles.card} aria-label={loading ? "Checking your session" : "Sign in to Ben OS"}>
        {loading ? <div className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={32} /><p>Preparing your workspace…</p></div> : <BenSignIn />}
      </section>
    </div>
  </main>
}
