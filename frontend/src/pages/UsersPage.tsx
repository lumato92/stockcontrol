import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import {
  PageHeader, LoadingScreen, Empty, Modal,
  Field, Input, Select, Alert, Spinner
} from '@/components/ui'
import { ROLE_LABELS, formatDate } from '@/lib/utils'
import { Plus, Pencil, UserCheck, UserX } from 'lucide-react'
import type { User } from '@/types'

type CreateForm = {
  email: string; username: string; password: string
  full_name?: string; role: string
}
type UpdateForm = { full_name?: string; role: string; is_active: boolean }

export default function UsersPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users/').then(r => r.data),
  })

  const createForm = useForm<CreateForm>({ defaultValues: { role: 'operator' } })
  const updateForm = useForm<UpdateForm>()

  const createMut = useMutation({
    mutationFn: (d: CreateForm) => api.post('/users/', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModalOpen(false); createForm.reset(); setSuccess('Usuario creado correctamente')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al crear usuario'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: UpdateForm & { id: string }) => api.put(`/users/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModalOpen(false); setEditUser(null); setSuccess('Usuario actualizado')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al actualizar'),
  })

  const openCreate = () => {
    setEditUser(null); createForm.reset({ role: 'operator' }); setError(''); setModalOpen(true)
  }
  const openEdit = (u: User) => {
    setEditUser(u)
    updateForm.reset({ full_name: u.full_name ?? '', role: u.role, is_active: u.is_active })
    setError(''); setModalOpen(true)
  }

  const roleClass: Record<string, string> = {
    admin: 'badge-admin',
    supervisor: 'badge-supervisor',
    operator: 'badge-operator',
    auditor: 'badge-operator',
    viewer: 'badge-operator',
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de acceso al sistema"
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={14} /> Nuevo usuario
          </button>
        }
      />

      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} className="mb-4" />}

      {isLoading ? <LoadingScreen /> : !users?.length ? <Empty /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Usuario</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Rol</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Último acceso</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                        {(u.full_name ?? u.username).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{u.full_name ?? u.username}</div>
                        <div className="text-xs text-slate-400">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={roleClass[u.role] ?? 'badge-operator'}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {u.is_active
                        ? <><UserCheck size={13} className="text-green-500" /><span className="text-xs text-green-700">Activo</span></>
                        : <><UserX size={13} className="text-red-400" /><span className="text-xs text-red-600">Inactivo</span></>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.last_login ? formatDate(u.last_login) : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => openEdit(u)}>
                      <Pencil size={11} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={modalOpen && !editUser}
        onClose={() => { setModalOpen(false); setError('') }}
        title="Nuevo usuario"
        size="md"
      >
        {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}
        <form onSubmit={createForm.handleSubmit(d => { setError(''); createMut.mutate(d) })} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre completo">
              <Input {...createForm.register('full_name')} placeholder="Juan García" />
            </Field>
            <Field label="Usuario" required error={createForm.formState.errors.username?.message}>
              <Input {...createForm.register('username', { required: 'Requerido' })} placeholder="jgarcia" />
            </Field>
          </div>
          <Field label="Email" required error={createForm.formState.errors.email?.message}>
            <Input type="email" {...createForm.register('email', { required: 'Requerido' })} placeholder="jgarcia@empresa.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contraseña" required error={createForm.formState.errors.password?.message}>
              <Input type="password" {...createForm.register('password', { required: 'Requerido', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })} placeholder="••••••••" />
            </Field>
            <Field label="Rol" required>
              <Select {...createForm.register('role', { required: true })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={createMut.isPending}>
              {createMut.isPending ? <Spinner size={13} className="text-white" /> : 'Crear usuario'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={modalOpen && !!editUser}
        onClose={() => { setModalOpen(false); setEditUser(null); setError('') }}
        title={`Editar: ${editUser?.full_name ?? editUser?.username}`}
        size="sm"
      >
        {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}
        <form
          onSubmit={updateForm.handleSubmit(d => {
            setError(''); updateMut.mutate({ ...d, id: editUser!.id })
          })}
          className="space-y-4"
        >
          <Field label="Nombre completo">
            <Input {...updateForm.register('full_name')} />
          </Field>
          <Field label="Rol">
            <Select {...updateForm.register('role')}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            <Select {...updateForm.register('is_active', { setValueAs: v => v === 'true' })}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={updateMut.isPending}>
              {updateMut.isPending ? <Spinner size={13} className="text-white" /> : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
