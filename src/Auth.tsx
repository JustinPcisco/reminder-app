import { useState } from "react"
import { supabase } from "./supabaseClient"

export function Auth() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

async function submit(e: React.FormEvent) {
  e.preventDefault()
  if (busy) return

  setBusy(true)
  setError(null)

  try {
    console.log("AUTH submit", { mode, email })

    const res =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })

    console.log("AUTH response", res)

    if (res.error) setError(res.error.message)
  } catch (err: any) {
    console.error("AUTH exception", err)
    setError(err?.message ?? "Unknown error during auth")
  } finally {
    setBusy(false)
  }
}

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-3"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {mode === "signup" ? "Create account" : "Sign in"}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Shared tasks for you and your AM
          </p>
        </div>

        <input
          className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 p-2 rounded-lg"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 p-2 rounded-lg"
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {error && (
          <div className="text-sm text-red-600 dark:text-red-300">{error}</div>
        )}

        <button
  disabled={busy || !email || !password}
  className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60
             dark:bg-white dark:text-slate-900"
>
  {busy ? "..." : mode === "signup" ? "Sign up" : "Sign in"}
</button>

        <button
          type="button"
          onClick={() => setMode(m => (m === "signin" ? "signup" : "signin"))}
          className="w-full text-sm text-slate-700 dark:text-slate-200 hover:underline"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  )
}