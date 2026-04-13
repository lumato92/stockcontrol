spage · TSX
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { PageHeader, LoadingScreen, Empty, Modal, Field, Input, Textarea, Alert, Spinner } from '@/components/ui'
import { Plus, Pencil, Warehouse } from 'lucide-react'
import type { Warehouse as WHType } from '@/types'
 
type FormData = { name: string; address?: string }
 
export default function DepositosPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editWH, setEditWH] = useState<WHType | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
 
  const { data: warehouses, isLoading } = useQuery<WHType[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/warehouses/').then(r => r.data),
  })
 
  const { data: stock } = useQuery<any[]>({
    queryKey: ['stock'],
    queryFn: () => api.get('/stock/').then(r => r.data),
  })
 
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()
 
  const createMut = useMutation({
    mutationFn: (d: FormData) => api.post('/warehouses/', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      setModalOpen(false); reset(); setSuccess('Depósito creado')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error'),
  })
 
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: FormData & { id: string }) => api.put(`/warehouses/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      setModalOpen(false); setEditWH(null); reset(); setSuccess('Depósito actualizado')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error'),
  })
 
  const openCreate = () => { setEditWH(null); reset(); setError(''); setModalOpen(true) }
  const openEdit = (w: WHType) => {
    setEditWH(w)
    reset({ name: w.name, address: w.address ?? '' })
    setError(''); setModalOpen(true)
  }
 
  const onSubmit = (d: FormData) => {
    if (editWH) updateMut.mutate({ ...d, id: editWH.id })
    else createMut.mutate(d)
  }
 
  const saving = createMut.isPending || updateMut.isPending
 
  const stockByWarehouse = (whId: string) => {
    const items = stock?.filter(s => s.warehouse_id === whId) ?? []
    const low = items.filter(s => s.status === 'low' || s.status === 'out').length
    return { total: items.length, low }
  }
 
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <PageHeader
        title="Depósitos"
        subtitle="Gestión de ubicaciones de almacenamiento"
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={14} /> Nuevo depósito
          </button>
        }
      />
 
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} className="mb-4" />}
 
      {isLoading ? <LoadingScreen /> : !warehouses?.length ? (
        <Empty message="No hay depósitos configurados" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map(w => {
            const { total, low } = stockByWarehouse(w.id)
            return (
              <div
                key={w.id}
                className="card p-5 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/depositos/${w.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Warehouse size={18} className="text-blue-600" />
                  </div>
                  <button
                    className="btn-secondary py-1 px-2 text-xs"
                    onClick={(e) => { e.stopPropagation(); openEdit(w) }}
                  >
                    <Pencil size={11} /> Editar
                  </button>
                </div>
                <h3 className="font-semibold text-slate-800 mb-1">{w.name}</h3>
                {w.address && (
                  <p className="text-xs text-slate-500 mb-3">{w.address}</p>
                )}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-700">{total}</div>
                    <div className="text-xs text-slate-400">productos</div>
                  </div>
                  {low > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-semibold text-amber-600">{low}</div>
                      <div className="text-xs text-slate-400">alertas</div>
                    </div>
                  )}
                  <span className={w.is_active ? 'badge-normal ml-auto' : 'badge-out ml-auto'}>
                    {w.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
 
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setError('') }}
        title={editWH ? 'Editar depósito' : 'Nuevo depósito'}
        size="sm"
      >
        {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Nombre" required error={errors.name?.message}>
            <Input {...register('name', { required: 'Requerido' })} placeholder="Depósito Central" />
          </Field>
          <Field label="Dirección / ubicación">
            <Textarea {...register('address')} placeholder="Calle Falsa 123, Buenos Aires..." />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size={13} className="text-white" /> : (editWH ? 'Guardar' : 'Crear depósito')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
 