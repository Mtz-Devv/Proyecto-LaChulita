import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../utils/format'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleLogin() {
    setError('')
    setSending(true)
    try {
      await login(email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-end bg-stone-950 bg-cover bg-center p-4 pb-10 sm:justify-center sm:pb-6"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      {/* Velo cálido sutil para legibilidad sin tapar a los enanos ni el letrero */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-950/30 via-stone-950/45 to-stone-950/80" />

      <div className="relative z-10 mt-28 w-full max-w-md sm:mt-36">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleLogin()
          }}
          className="space-y-5 rounded-3xl border border-amber-300/30 bg-stone-950/75 p-7 shadow-2xl shadow-black/70 backdrop-blur-md"
        >
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-200">
              🍺 Bar & Cantina
            </span>
            <h1 className="font-brand mt-2.5 bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-4xl font-extrabold tracking-wide text-transparent drop-shadow">
              La Chulita
            </h1>
            <p className="mt-1 text-sm text-stone-300">
              Inicia sesión para entrar al sistema
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-950/80 px-4 py-3 text-sm font-medium text-rose-200">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-amber-200/90">
                Correo electrónico
              </label>
              <input
                className="w-full rounded-xl border border-amber-200/25 bg-stone-900/80 px-4 py-2.5 text-sm text-white placeholder:text-stone-400 transition-all focus:border-amber-400 focus:bg-stone-900 focus:outline-none focus:ring-4 focus:ring-amber-400/20"
                type="email"
                placeholder="admin@bar.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-amber-200/90">
                Contraseña
              </label>
              <input
                className="w-full rounded-xl border border-amber-200/25 bg-stone-900/80 px-4 py-2.5 text-sm text-white placeholder:text-stone-400 transition-all focus:border-amber-400 focus:bg-stone-900 focus:outline-none focus:ring-4 focus:ring-amber-400/20"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="btn-primary w-full !rounded-xl !py-3 text-base shadow-lg shadow-amber-900/40"
          >
            {sending ? 'Entrando…' : 'Entrar a La Chulita'}
          </button>
        </form>
      </div>
    </div>
  )
}
