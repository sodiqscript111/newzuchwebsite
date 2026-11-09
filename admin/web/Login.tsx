import { useState, type FormEvent } from "react"
import { api } from "./api.ts"

export function Login({ onSignedIn }: { readonly onSignedIn: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(password)
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in")
      setBusy(false)
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>ZUCH admin</h1>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="button primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  )
}
