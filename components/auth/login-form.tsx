"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { GoogleIcon } from "./google-icon"

export function LoginForm() {
  const [rememberMe, setRememberMe] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) router.replace("/dashboard")
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/dashboard")
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    router.replace("/dashboard")
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-[0_20px_60px_-15px_rgba(8,28,53,0.25)] md:p-10">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-[#081C35]">Welcome Back</h2>
        <p className="mt-2 text-base text-muted-foreground">Sign in to your Command Center</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-medium text-[#081C35]">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 rounded-lg"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-sm font-medium text-[#081C35]">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 rounded-lg"
          />
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
              Remember Me
            </Label>
          </div>
          <a href="#" className="text-sm font-medium text-[#C9A227] hover:underline">
            Forgot Password?
          </a>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-lg bg-[#081C35] text-base font-semibold text-white hover:bg-[#0D2C4F]"
        >
          {loading ? "Signing In..." : "Sign In"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-12 w-full rounded-lg border-border bg-transparent text-base font-medium text-[#081C35] hover:bg-muted"
      >
        <GoogleIcon className="mr-2 h-5 w-5" />
        Continue with Google
      </Button>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {"Don't have an account? "}
        <a href="#" className="font-semibold text-[#C9A227] hover:underline">
          Sign up
        </a>
      </p>
    </div>
  )
}
