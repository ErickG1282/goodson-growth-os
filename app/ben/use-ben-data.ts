"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadBenData, type BenData } from "./data"

type State = BenData | { status: "loading" | "unauthenticated" } | { status: "error"; message: string }

export function useBenData() {
  const [state, setState] = useState<State>({ status: "loading" })
  const [selection, setSelection] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)

  function invalidate() {
    generation.current += 1
    request.current?.abort()
    setState({ status: "loading" })
  }
  function refresh() {
    invalidate()
    setRevision(value => value + 1)
  }
  function selectOrganization(id: string) {
    invalidate()
    setSelection(id || null)
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return // Initial getUser validates auth below.
      // Synchronously discard tenant data and stale requests. Do not call an
      // async Supabase API from inside the auth callback.
      generation.current += 1
      request.current?.abort()
      setState(event === "SIGNED_OUT" ? { status: "unauthenticated" } : { status: "loading" })
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") setSelection(null)
      setRevision(value => value + 1)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    const current = ++generation.current
    const update = (next: State) => {
      if (!controller.signal.aborted && current === generation.current) setState(next)
    }
    // Defer auth work outside auth-event callbacks.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await supabase.auth.getUser()
          if (controller.signal.aborted || current !== generation.current) return
          if (error) {
            if (error.name === "AuthSessionMissingError") update({ status: "unauthenticated" })
            else update({ status: "error", message: "Unable to verify your login. Please retry or sign in again." })
            return
          }
          if (!data.user) { update({ status: "unauthenticated" }); return }
          const loaded = await loadBenData(supabase, data.user.id, selection, controller.signal)
          update(loaded.status === "ready" ? { ...loaded, userEmail: data.user.email } : loaded)
        } catch {
          update({ status: "error", message: "Unable to load Ben OS. Check your connection and organization access, then retry." })
        }
      })()
    }, 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [selection, revision])

  return { state, refresh, selectOrganization }
}
