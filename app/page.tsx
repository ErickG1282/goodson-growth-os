import { BrandPanel } from "@/components/auth/brand-panel"
import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center bg-[#F1F3F5] px-6 py-16 lg:w-1/2">
        <LoginForm />
      </div>
    </main>
  )
}
