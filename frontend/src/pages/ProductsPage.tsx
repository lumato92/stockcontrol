import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import {
  PageHeader, LoadingScreen, Empty, Pagination,
  Modal, Field, Input, Select, Textarea, Alert, Spinner
} from '@/components/ui'
import { formatCurrency, canWrite } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, ScanLine, ChevronDown, X } from 'lucide-react'
import type { Product, Category, Unit, PaginatedResponse, ProductUnitConversion } from '@/types'

type DispatchRule = 'FIFO' | 'FEFO' | 'LIFO'

type FormData = {
  sku: string; name: string; barcode?: string; description?: string
  category_id?: number; unit_id: number; min_stock: number; cost_price?: number
  // Avanzados
  weight_kg?: number; length_cm?: number; width_cm?: number; height_cm?: number
  track_batches?: boolean; track_serial?: boolean; has_expiry?: boolean; expiry_alert_days?: number
  requires_cold?: boolean; is_fragile?: boolean; is_stackable?: boolean; is_hazardous?: boolean
  dispatch_rule?: DispatchRule
}

export default function ProductsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [newConv, setNewConv] = useState<{ from_unit_id: string; to_unit_id: string; factor: string }>({
    from_unit_id: '', to_unit_id: '', factor: ''
  })

  const { data, isLoading } = useQuery<PaginatedResponse<Product>>({
    queryKey: ['products', search, categoryId, statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), size: '20' })
      if (search) params.set('search', search)
      if (categoryId) params.set('category_id', String(categoryId))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      return api.get(`/products/?${params}`).then(r => r.data)
    },
    placeholderData: (prev) => prev,
  })

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories/').then(r => r.data),
  })

  const { data: units } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: () => api.get('/units/').then(r => r.data),
  })

  const { data: conversions } = useQuery<ProductUnitConversion[]>({
    queryKey: ['conversions', editProduct?.id],
    queryFn: () => api.get(`/products/${editProduct!.id}/conversions`).then(r => r.data),
    enabled: !!editProduct,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  const createMut = useMutation({
    mutationFn: (d: FormData) => api.post('/products/', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setModalOpen(false); reset(); setSuccess('Producto creado correctamente')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: FormData & { id: string }) => api.put(`/products/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setModalOpen(false); setEditProduct(null); reset(); setSuccess('Producto actualizado')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al actualizar'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/products/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const addConvMut = useMutation({
    mutationFn: (d: { from_unit_id: number; to_unit_id: number; factor: number }) =>
      api.post(`/products/${editProduct!.id}/conversions`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversions', editProduct?.id] }),
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al agregar conversión'),
  })

  const deleteConvMut = useMutation({
    mutationFn: (convId: number) =>
      api.delete(`/products/${editProduct!.id}/conversions/${convId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversions', editProduct?.id] }),
  })

  const resetModal = () => {
    setModalOpen(false)
    setError('')
    setAdvancedOpen(false)
    setNewConv({ from_unit_id: '', to_unit_id: '', factor: '' })
  }

  const openCreate = () => {
    setEditProduct(null)
    reset()
    resetModal()
    setModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    reset({
      sku: p.sku, name: p.name, barcode: p.barcode ?? '', description: p.description ?? '',
      category_id: p.category?.id, unit_id: p.unit.id,
      min_stock: Number(p.min_stock), cost_price: p.cost_price ? Number(p.cost_price) : undefined,
      // Avanzados
      weight_kg:         (p as any).weight_kg         ? Number((p as any).weight_kg)    : undefined,
      length_cm:         (p as any).length_cm         ? Number((p as any).length_cm)    : undefined,
      width_cm:          (p as any).width_cm          ? Number((p as any).width_cm)     : undefined,
      height_cm:         (p as any).height_cm         ? Number((p as any).height_cm)    : undefined,
      track_batches:     (p as any).track_batches     ?? false,
      track_serial:      (p as any).track_serial      ?? false,
      has_expiry:        (p as any).has_expiry        ?? false,
      expiry_alert_days: (p as any).expiry_alert_days ?? undefined,
      requires_cold:     (p as any).requires_cold     ?? false,
      is_fragile:        (p as any).is_fragile        ?? false,
      is_stackable:      (p as any).is_stackable      ?? true,
      is_hazardous:      (p as any).is_hazardous      ?? false,
      dispatch_rule:     (p as any).dispatch_rule     ?? 'FIFO',
    })
    setError('')
    setAdvancedOpen(false)
    setNewConv({ from_unit_id: '', to_unit_id: '', factor: '' })
    setModalOpen(true)
  }

  const onSubmit = (d: FormData) => {
    if (editProduct) updateMut.mutate({ ...d, id: editProduct.id })
    else createMut.mutate(d)
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <PageHeader
        title="Productos"
        subtitle={data ? `${data.total} productos en catálogo` : undefined}
        actions={
          canWrite(user?.role ?? '') ? (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={14} /> Nuevo producto
            </button>
          ) : undefined
        }
      />

      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} className="mb-4" />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Buscar por nombre, SKU o código de barras..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="input w-auto"
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
        >
          <option value="">Todas las categorías</option>
          {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['all', 'low', 'out'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1.5 text-xs transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'Todos' : s === 'low' ? 'Bajo mínimo' : 'Sin stock'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingScreen /> : !data?.items.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Producto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">SKU / Barcode</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Categoría</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Unidad</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Stock mín.</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Precio costo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Estado</th>
                  {canWrite(user?.role ?? '') && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-600">{p.sku}</div>
                      {p.barcode && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <ScanLine size={10} />
                          {p.barcode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.unit.name}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      {Number(p.min_stock)} {p.unit.symbol}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(p.cost_price)}</td>
                    <td className="px-4 py-3">
                      <span className={p.is_active ? 'badge-normal' : 'badge-out'}>
                        {p.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canWrite(user?.role ?? '') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            className="btn-secondary py-1 px-2 text-xs"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil size={11} /> Editar
                          </button>
                          <button
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400"
                            title={p.is_active ? 'Desactivar' : 'Activar'}
                            onClick={() => toggleMut.mutate({ id: p.id, is_active: !p.is_active })}
                          >
                            {p.is_active ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} />}
                          </button>
                        </div>
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

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={resetModal}
        title={editProduct ? 'Editar producto' : 'Nuevo producto'}
        size="lg"
      >
        {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required error={errors.name?.message}>
              <Input {...register('name', { required: 'Requerido' })} placeholder="Tornillo M8 × 40mm" />
            </Field>
            <Field label="SKU" required error={errors.sku?.message}>
              <Input
                {...register('sku', { required: 'Requerido' })}
                placeholder="TRN-M8-40"
                disabled={!!editProduct}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código de barras">
              <Input {...register('barcode')} placeholder="7891234560001" />
            </Field>
            <Field label="Unidad de medida" required error={errors.unit_id?.message}>
              <Select {...register('unit_id', { required: 'Requerido', valueAsNumber: true })}>
                <option value="">Seleccionar...</option>
                {units?.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select {...register('category_id', { valueAsNumber: true })}>
                <option value="">Sin categoría</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Stock mínimo">
              <Input
                type="number" step="0.001" min="0"
                {...register('min_stock', { valueAsNumber: true })}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio de costo">
              <Input
                type="number" step="0.01" min="0"
                {...register('cost_price', { valueAsNumber: true })}
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea {...register('description')} placeholder="Descripción opcional del producto..." />
          </Field>

          {/* Campos avanzados colapsable */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              Campos avanzados — dimensiones, trazabilidad, restricciones
              <ChevronDown size={14} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>

            {advancedOpen && (
              <div className="p-4 space-y-4">
                {/* Dimensiones */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Dimensiones físicas</p>
                <div className="grid grid-cols-4 gap-3">
                  {([
                    ['weight_kg', 'Peso (kg)'],
                    ['length_cm', 'Largo (cm)'],
                    ['width_cm',  'Ancho (cm)'],
                    ['height_cm', 'Alto (cm)'],
                  ] as const).map(([f, label]) => (
                    <Field key={f} label={label}>
                      <Input type="number" step="0.001" min="0" {...register(f, { valueAsNumber: true })} placeholder="0" />
                    </Field>
                  ))}
                </div>

                {/* Trazabilidad */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Trazabilidad</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('track_batches')} className="rounded" /> Maneja lotes
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('track_serial')} className="rounded" /> Maneja número de serie
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('has_expiry')} className="rounded" /> Tiene vencimiento
                  </label>
                  <Field label="Días alerta vencimiento">
                    <Input type="number" min="0" {...register('expiry_alert_days', { valueAsNumber: true })} placeholder="30" />
                  </Field>
                </div>

                {/* Restricciones */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Almacenamiento</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('requires_cold')} className="rounded" /> Requiere frío
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('is_fragile')} className="rounded" /> Frágil
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('is_hazardous')} className="rounded" /> Material peligroso
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" {...register('is_stackable')} className="rounded" /> Apilable
                  </label>
                </div>

                {/* Despacho */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Regla de despacho</p>
                <Field label="Método" className="w-48">
                  <Select {...register('dispatch_rule')}>
                    <option value="FIFO">FIFO — Primero en entrar</option>
                    <option value="FEFO">FEFO — Primero en vencer</option>
                    <option value="LIFO">LIFO — Último en entrar</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>

          {/* Subpanel conversiones — solo en edición */}
          {editProduct && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <span className="text-sm font-medium text-slate-600">Conversiones de unidad</span>
                <span className="text-xs text-slate-400">{conversions?.length ?? 0} definidas</span>
              </div>

              <div className="p-4 space-y-3">
                {!conversions?.length ? (
                  <p className="text-xs text-slate-400 text-center py-2">
                    Sin conversiones. Ej: 1 caja = 12 unidades.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conversions.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-500">1</span>
                        <span className="font-medium text-slate-700">
                          {units?.find(u => u.id === c.from_unit_id)?.name ?? c.from_unit_id}
                        </span>
                        <span className="text-slate-400">=</span>
                        <span className="font-mono font-semibold text-slate-800">{Number(c.factor)}</span>
                        <span className="font-medium text-slate-700">
                          {units?.find(u => u.id === c.to_unit_id)?.name ?? c.to_unit_id}
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-slate-300 hover:text-red-400 transition-colors"
                          onClick={() => deleteConvMut.mutate(c.id)}
                          title="Eliminar"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Nueva conversión */}
                <div className="flex items-end gap-2 pt-2 border-t border-slate-100">
                  <Field label="De unidad" className="flex-1">
                    <Select
                      value={newConv.from_unit_id}
                      onChange={e => setNewConv(p => ({ ...p, from_unit_id: e.target.value }))}
                    >
                      <option value="">Unidad...</option>
                      {units?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Factor" className="w-24">
                    <Input
                      type="number" step="0.000001" min="0.000001"
                      placeholder="12"
                      value={newConv.factor}
                      onChange={e => setNewConv(p => ({ ...p, factor: e.target.value }))}
                    />
                  </Field>
                  <Field label="A unidad" className="flex-1">
                    <Select
                      value={newConv.to_unit_id}
                      onChange={e => setNewConv(p => ({ ...p, to_unit_id: e.target.value }))}
                    >
                      <option value="">Unidad...</option>
                      {units?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  <button
                    type="button"
                    className="btn-primary py-1.5 px-3 mb-0.5 flex-shrink-0"
                    disabled={!newConv.from_unit_id || !newConv.to_unit_id || !newConv.factor || addConvMut.isPending}
                    onClick={() => {
                      addConvMut.mutate({
                        from_unit_id: Number(newConv.from_unit_id),
                        to_unit_id:   Number(newConv.to_unit_id),
                        factor:       Number(newConv.factor),
                      })
                      setNewConv({ from_unit_id: '', to_unit_id: '', factor: '' })
                    }}
                  >
                    {addConvMut.isPending ? <Spinner size={12} className="text-white" /> : <Plus size={13} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={resetModal}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size={13} className="text-white" /> : (editProduct ? 'Guardar cambios' : 'Crear producto')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}