"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return

      if (data.session) {
        setAuthenticated(true)
      } else {
        router.replace("/")
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthenticated(true)
      } else {
        setAuthenticated(false)
        router.replace("/")
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  if (!authenticated) return null

  return children
}
