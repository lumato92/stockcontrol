import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Field, Input, Alert, Spinner } from '@/components/ui'
import { Lock } from 'lucide-react'

type FormData = {
  current_password: string
  new_password: string
  confirm_password: string
}

export default function ChangePasswordPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>()
  const newPassword = watch('new_password')
  const isForced = user?.must_change_password ?? false

  const onSubmit = async (d: FormData) => {
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: d.current_password,
        new_password: d.new_password,
      })
      // Refrescar el usuario para que must_change_password quede false
      navigate('/', { replace: true })
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Lock size={18} className="text-blue-600" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-800">
                {isForced ? 'Configurá tu contraseña' : 'Cambiar contraseña'}
              </h1>
              {isForced && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Necesitás configurar una contraseña propia antes de continuar
                </p>
              )}
            </div>
          </div>

          {error && (
            <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Contraseña actual" required error={errors.current_password?.message}>
              <Input
                type="password"
                {...register('current_password', { required: 'Requerido' })}
                placeholder="••••••••"
              />
            </Field>

            <Field label="Nueva contraseña" required error={errors.new_password?.message}>
              <Input
                type="password"
                {...register('new_password', {
                  required: 'Requerido',
                  minLength: { value: 8, message: 'Mínimo 8 caracteres' },
                })}
                placeholder="••••••••"
              />
            </Field>

            <Field label="Confirmar contraseña" required error={errors.confirm_password?.message}>
              <Input
                type="password"
                {...register('confirm_password', {
                  required: 'Requerido',
                  validate: v => v === newPassword || 'Las contraseñas no coinciden',
                })}
                placeholder="••••••••"
              />
            </Field>

            <div className="flex gap-2 pt-2">
              {!isForced && (
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => navigate(-1)}
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="btn-primary flex-1"
                disabled={loading}
              >
                {loading ? <Spinner size={13} className="text-white" /> : 'Cambiar contraseña'}
              </button>
            </div>

            {isForced && (
              <button
                type="button"
                className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors pt-1"
                onClick={logout}
              >
                Cerrar sesión
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}