import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Alert, Spinner } from '@/components/ui'
import { api } from '@/lib/api'

type Step = 'login' | 'forgot' | 'reset'

export default function LoginPage() {
  const { login } = useAuth()
  const [step, setStep] = useState<Step>('login')

  // Login
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Forgot / Reset
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const clearMessages = () => { setError(''); setSuccess('') }

  // ── Login ──────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    try {
      await login(username, password)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }
  // ── Forgot password ────────────────────────────────────────────────────────

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSuccess('Si el email existe, recibirás un código en breve')
      setStep('reset')
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Error al enviar el código')
    } finally {
      setLoading(false)
    }
  }

  // ── Reset password ─────────────────────────────────────────────────────────

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        email,
        code,
        new_password: newPassword,
      })
      setSuccess('Contraseña actualizada. Ya podés ingresar.')
      setStep('login')
      setCode('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Código inválido o expirado')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white text-xl">📦</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-800">StockControl</h1>
          <p className="text-sm text-slate-500 mt-1">
            {step === 'login'  && 'Ingresá con tu cuenta'}
            {step === 'forgot' && 'Recuperar contraseña'}
            {step === 'reset'  && 'Ingresá el código recibido'}
          </p>
        </div>

        <div className="card p-6">
          {error   && <Alert type="error"   message={error}   onClose={clearMessages} className="mb-4" />}
          {success && <Alert type="success" message={success} onClose={clearMessages} className="mb-4" />}

          {/* ── Step: login ── */}
          {step === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">Usuario o email</label>
                <input
                  className="input"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label className="label">Contraseña</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2">
                {loading ? <Spinner size={14} className="text-white" /> : 'Ingresar'}
              </button>
              <button
                type="button"
                className="w-full text-xs text-slate-400 hover:text-blue-600 transition-colors pt-1"
                onClick={() => { clearMessages(); setStep('forgot') }}
              >
                Olvidé mi contraseña
              </button>
            </form>
          )}

          {/* ── Step: forgot ── */}
          {step === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-slate-500">
                Ingresá tu email y te enviaremos un código de 6 dígitos.
              </p>
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2">
                {loading ? <Spinner size={14} className="text-white" /> : 'Enviar código'}
              </button>
              <button
                type="button"
                className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => { clearMessages(); setStep('login') }}
              >
                Volver al login
              </button>
            </form>
          )}

          {/* ── Step: reset ── */}
          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                />
              </div>
              <div>
                <label className="label">Código de 6 dígitos</label>
                <input
                  className="input text-center tracking-widest font-mono text-lg"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                />
              </div>
              <div>
                <label className="label">Nueva contraseña</label>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div>
                <label className="label">Confirmar contraseña</label>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2">
                {loading ? <Spinner size={14} className="text-white" /> : 'Cambiar contraseña'}
              </button>
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  className="hover:text-slate-600 transition-colors"
                  onClick={() => { clearMessages(); setStep('forgot') }}
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  className="hover:text-slate-600 transition-colors"
                  onClick={() => { clearMessages(); setStep('login') }}
                >
                  Volver al login
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          StockControl v1.0 MVP
        </p>
      </div>
    </div>
  )
}