"use client"

import { ArrowRight, BriefcaseBusiness, ChartNoAxesCombined, ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useBenData } from "./use-ben-data"
import { BenShell } from "./shell"
import { BenLoginLanding } from "./login-landing"
import { BenWorkspace } from "./workspace"
import styles from "./ben.module.css"

async function signOut() {
  const { error } = await supabase.auth.signOut()
  return error ? "Could not sign out. Please try again." : null
}
export function BenDashboard() {
  return <BenDashboardView {...useBenData()} />
}

export function BenDashboardView({ state, refresh, selectOrganization }: ReturnType<typeof useBenData>) {
  if (state.status === "ready") return <BenWorkspace key={`${state.userId}:${state.organization.id}`} data={state} refresh={refresh} selectOrganization={selectOrganization} onSignOut={signOut} />
  if (state.status === "unauthenticated") return <BenLoginLanding />
  if (state.status === "loading") return <BenLoginLanding loading />
  return <BenShell onRefresh={refresh} onSignOut={["empty", "choose"].includes(state.status) ? signOut : undefined}>
    {state.status === "choose" ? <section className={styles.chooseWorkspace}><p className={styles.eyebrow}>YOUR ORGANIZATIONS</p><h1>Choose your workspace.</h1><p>Open one organization at a time. Each workspace keeps its own businesses and financial picture.</p><div className={styles.organizationGrid}>{state.organizations.map(row => <Card key={row.id} className={styles.organizationCard}><span className={styles.businessSymbol}><BriefcaseBusiness size={25} /></span><h2>{row.name}</h2><span className={styles.badge}>{row.role} access</span><Button className={styles.primaryButton} onClick={() => selectOrganization(row.id)}>Open workspace<ArrowRight size={17} /></Button></Card>)}</div></section>
      : <Card className={styles.connectionCard}><span className={styles.accessCrown}><ChartNoAxesCombined size={38} /></span><p className={styles.eyebrow}>YOUR BEN OS WORKSPACE</p><h1>{state.status === "empty" ? "Let’s connect your organization." : "Your workspace needs a moment."}</h1><p role={state.status === "error" ? "alert" : undefined}>{state.status === "empty" ? "You’re signed in, but your account has no Ben OS organization membership yet. Ask your organization’s owner to add you, then refresh here." : state.status === "error" ? state.message : ""}</p><Button className={styles.primaryButton} onClick={refresh}>Try again<ArrowRight size={17} /></Button><span className={styles.formTrust}><ShieldCheck size={15} />Your organization data stays protected.</span></Card>}
  </BenShell>
}
