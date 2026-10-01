import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BenLoginLanding } from "../app/ben/login-landing"
import { BenDashboardView } from "../app/ben/dashboard"

test("signed-out landing contains real form controls and no workspace navigation", () => {
  const html = renderToStaticMarkup(<BenLoginLanding />)
  for (const text of ["All of Your Businesses.", "One Command Center.", "Organize. Track. Manage. Grow.", "Welcome to Ben OS", "Sign In"]) assert.ok(html.includes(text))
  assert.ok(html.includes('type="email"'))
  assert.ok(html.includes('type="password"'))
  assert.ok(html.includes('aria-label="Show password"'))
  assert.ok(html.includes('type="submit"'))
  assert.ok(html.includes('type="checkbox"'))
  assert.ok(!html.includes("<aside"))
  assert.ok(!html.includes("<nav"))
  assert.ok(!html.includes("Open navigation menu"))
  assert.ok(!html.includes('id="businesses"'))
  assert.ok(!html.includes('id="financials"'))
})

test("session loading never exposes workspace controls or an active sign-in form", () => {
  const html = renderToStaticMarkup(<BenLoginLanding loading />)
  assert.ok(html.includes('role="status"'))
  assert.ok(html.includes("Preparing your workspace"))
  assert.ok(!html.includes("<form"))
  assert.ok(!html.includes("<aside"))
  assert.ok(!html.includes("<nav"))
})

test("authentication state gates replace the entire landing with the existing workspace", () => {
  const callbacks = { refresh: () => {}, selectOrganization: () => {} }
  const signedOut = renderToStaticMarkup(<BenDashboardView {...callbacks} state={{ status: "unauthenticated" }} />)
  assert.ok(signedOut.includes("Welcome to Ben OS"))
  assert.ok(!signedOut.includes("<aside"))
  const organization = { id: "test-org", name: "Test Organization", owner_name: "Test Owner", status: "active", role: "owner" }
  const signedIn = renderToStaticMarkup(<BenDashboardView {...callbacks} state={{ status: "ready", userId: "test-user", organization, organizations: [organization], businesses: [], financials: { businesses: [], transactions: [], receivables: [], bills: [] }, financialError: null }} />)
  assert.ok(signedIn.includes("Test Organization"))
  assert.ok(signedIn.includes("<aside"))
  assert.ok(signedIn.includes('id="businesses"'))
  assert.ok(!signedIn.includes("Welcome to Ben OS"))
  const signedOutAgain = renderToStaticMarkup(<BenDashboardView {...callbacks} state={{ status: "unauthenticated" }} />)
  assert.ok(signedOutAgain.includes("Welcome to Ben OS"))
  assert.ok(!signedOutAgain.includes("Test Organization"))
  assert.ok(!signedOutAgain.includes("<aside"))
})
