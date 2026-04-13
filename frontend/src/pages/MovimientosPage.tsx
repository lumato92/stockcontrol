import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import {
  PageHeader, LoadingScreen, Empty, Pagination,
  Modal, Field, Input, Select, Textarea, Alert, Spinner
} from '@/components/ui'
import { formatDate, formatQty, MOVEMENT_LABELS, canWrite } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { Plus, RotateCcw } from 'lucide-react'
import type { Movement, Product, Warehouse, PaginatedResponse } from '@/types'
import { cn } from '@/lib/utils'

type MovType = 'entrada' | 'salida' | 'transferencia' | 'ajuste'

type FormData = {
  movement_type: MovType
  product_id: string
  from_warehouse_id?: string
  to_warehouse_id?: string
  quantity: number
  reference_doc?: string
  notes?: string
}

const MOV_COLORS: Record<string, string> = {
  entrada: 'badge-entrada',
  salida: 'badge-salida',
  transferencia: 'badge-transferencia',
  ajuste: 'badge-ajuste',
  devolucion: 'badge-ajuste',
}

export default function MovimientosPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('')
  const [productFilter, setProductFilter] = useState<string>(searchParams.get('product_id') ?? '')
  const [modalOpen, setModalOpen] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<Movement | null>(null)
  const [reverseNotes, setReverseNotes] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data, isLoading } = useQuery<PaginatedResponse<Movement>>({
    queryKey: ['movements', page, typeFilter, warehouseFilter, productFilter],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), size: '20' })
      if (typeFilter) p.set('movement_type', typeFilter)
      if (warehouseFilter) p.set('warehouse_id', warehouseFilter)
      if (productFilter) p.set('product_id', productFilter)
      return api.get(`/movements/?${p}`).then(r => r.data)
    },
    placeholderData: prev => prev,
  })

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/warehouses/').then(r => r.data),
  })

  const { data: products } = useQuery<{ items: Product[] }>({
    queryKey: ['products-all'],
    queryFn: () => api.get('/products/?size=500&is_active=true').then(r => r.data),
    staleTime: 0,
  })

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: { movement_type: 'entrada' },
  })
  const movType = watch('movement_type')

  const createMut = useMutation({
    mutationFn: (d: FormData) => api.post('/movements/', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
      setModalOpen(false)
      reset()
      setSuccess('Movimiento registrado correctamente')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al registrar'),
  })

  const reverseMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/movements/${id}/reverse?notes=${encodeURIComponent(notes)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
      setReverseTarget(null)
      setSuccess('Movimiento revertido')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al revertir'),
  })

  const onSubmit = (d: FormData) => {
    setError('')
    // Limpiar campos vacíos para que el backend reciba null en lugar de ""
    const clean = {
      ...d,
      from_warehouse_id: d.from_warehouse_id || undefined,
      to_warehouse_id: d.to_warehouse_id || undefined,
      reference_doc: d.reference_doc || undefined,
      notes: d.notes || undefined,
    }
    createMut.mutate(clean)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <PageHeader
        title="Movimientos de stock"
        subtitle={data ? `${data.total} registros en total` : undefined}
        actions={
          canWrite(user?.role ?? '') ? (
            <button className="btn-primary" onClick={() => { reset(); setError(''); setModalOpen(true) }}>
              <Plus size={14} /> Nuevo movimiento
            </button>
          ) : undefined
        }
      />

      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} className="mb-4" />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select className="input w-auto" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">Todos los tipos</option>
          {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="input w-auto" value={warehouseFilter} onChange={e => { setWarehouseFilter(e.target.value); setPage(1) }}>
          <option value="">Todos los depósitos</option>
          {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="input w-auto flex-1 min-w-48" value={productFilter} onChange={e => { setProductFilter(e.target.value); setPage(1) }}>
          <option value="">Todos los productos</option>
          {products?.items.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(typeFilter || warehouseFilter || productFilter) && (
          <button
            className="btn-secondary text-xs"
            onClick={() => { setTypeFilter(''); setWarehouseFilter(''); setProductFilter(''); setPage(1) }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingScreen /> : !data?.items.length ? (
          <Empty message="No hay movimientos que coincidan con los filtros" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Producto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Origen → Destino</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Cantidad</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Referencia</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Usuario</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Fecha</th>
                  {canWrite(user?.role ?? '') && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.items.map((m) => (
                  <tr key={m.id} className={cn('hover:bg-slate-50 transition-colors', m.is_reversal && 'opacity-70')}>
                    <td className="px-4 py-3">
                      <span className={MOV_COLORS[m.movement_type] ?? 'badge-ajuste'}>
                        {MOVEMENT_LABELS[m.movement_type]}
                      </span>
                      {m.is_reversal && (
                        <span className="ml-1.5 text-xs text-slate-400 italic">reversión</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{m.product.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{m.product.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {m.from_warehouse && <span>{m.from_warehouse.name}</span>}
                      {m.from_warehouse && m.to_warehouse && <span className="mx-1.5 text-slate-300">→</span>}
                      {m.to_warehouse && <span>{m.to_warehouse.name}</span>}
                      {!m.from_warehouse && !m.to_warehouse && <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatQty(m.quantity, m.product.unit.symbol)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {m.reference_doc || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {m.performed_by_user.full_name ?? m.performed_by_user.username}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(m.performed_at)}
                    </td>
                    {canWrite(user?.role ?? '') && (
                      <td className="px-4 py-3">
                        {!m.is_reversal && ['admin', 'supervisor'].includes(user?.role ?? '') && (
                          <button
                            className="btn-secondary py-1 px-2 text-xs"
                            onClick={() => { setReverseTarget(m); setReverseNotes(''); setError('') }}
                            title="Revertir este movimiento"
                          >
                            <RotateCcw size={11} /> Revertir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && (
        <Pagination page={data.page} pages={data.pages} total={data.total} size={data.size} onPage={setPage} />
      )}

      {/* New movement modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setError('') }}
        title="Registrar movimiento"
        size="md"
      >
        {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Tipo de movimiento" required>
            <Select {...register('movement_type', { required: true })}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="transferencia">Transferencia entre depósitos</option>
              <option value="ajuste">Ajuste de inventario</option>
            </Select>
          </Field>

          <Field label="Producto" required error={errors.product_id?.message}>
            <Select {...register('product_id', { required: 'Requerido' })}>
              <option value="">
                {!products ? 'Cargando...' : products.items.length === 0 ? 'No hay productos activos' : 'Seleccionar producto...'}
              </option>
              {(products?.items ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </Select>
          </Field>

          {(movType === 'salida' || movType === 'transferencia') && (
            <Field label="Depósito origen" required error={errors.from_warehouse_id?.message}>
              <Select {...register('from_warehouse_id', { required: 'Requerido' })}>
                <option value="">Seleccionar...</option>
                {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}

          {(movType === 'entrada' || movType === 'transferencia' || movType === 'ajuste') && (
            <Field label="Depósito destino" required error={errors.to_warehouse_id?.message}>
              <Select {...register('to_warehouse_id', { required: 'Requerido' })}>
                <option value="">Seleccionar...</option>
                {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Cantidad" required error={errors.quantity?.message}>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              {...register('quantity', { required: 'Requerido', valueAsNumber: true, min: { value: 0.001, message: 'Debe ser mayor a 0' } })}
              placeholder="0"
            />
          </Field>

          <Field label="N° de referencia / remito">
            <Input {...register('reference_doc')} placeholder="Ej: REM-0042" />
          </Field>

          <Field label={movType === 'ajuste' ? 'Motivo del ajuste (requerido)' : 'Notas'}>
            <Textarea
              {...register('notes', { required: movType === 'ajuste' ? 'Los ajustes requieren una nota' : false })}
              placeholder={movType === 'ajuste' ? 'Explicá el motivo del ajuste...' : 'Notas opcionales...'}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={createMut.isPending}>
              {createMut.isPending ? <Spinner size={13} className="text-white" /> : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reverse confirmation modal */}
      <Modal
        open={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        title="Confirmar reversión"
        size="sm"
      >
        {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}
        {reverseTarget && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Esto creará un movimiento inverso que cancela el{' '}
              <strong>{MOVEMENT_LABELS[reverseTarget.movement_type]}</strong> de{' '}
              <strong>{formatQty(reverseTarget.quantity, reverseTarget.product.unit.symbol)}</strong> de{' '}
              <strong>{reverseTarget.product.name}</strong>.
            </div>
            <Field label="Motivo de la reversión" required>
              <Textarea
                value={reverseNotes}
                onChange={e => setReverseNotes(e.target.value)}
                placeholder="Explicá por qué se revierte este movimiento..."
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setReverseTarget(null)}>Cancelar</button>
              <button
                className="btn-danger"
                disabled={!reverseNotes.trim() || reverseMut.isPending}
                onClick={() => reverseMut.mutate({ id: reverseTarget.id, notes: reverseNotes })}
              >
                {reverseMut.isPending ? <Spinner size={13} className="text-white" /> : 'Confirmar reversión'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}