import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, LoadingScreen, Empty } from '@/components/ui'
import { Link } from 'react-router-dom'
import { Search, ExternalLink } from 'lucide-react'
import type { StockItem, Warehouse } from '@/types'
import { cn } from '@/lib/utils'

export default function StockPage() {
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all')
  const [search, setSearch] = useState('')

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/warehouses/').then(r => r.data),
  })

  const { data: stock, isLoading } = useQuery<StockItem[]>({
    queryKey: ['stock', warehouseId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (warehouseId) params.set('warehouse_id', warehouseId)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      return api.get(`/stock/?${params}`).then(r => r.data)
    },
    refetchInterval: 20_000,
  })

  const filtered = stock?.filter(item =>
    !search ||
    item.product_name.toLowerCase().includes(search.toLowerCase()) ||
    item.sku.toLowerCase().includes(search.toLowerCase()) ||
    (item.barcode ?? '').includes(search)
  ) ?? []

  const counts = {
    all: stock?.length ?? 0,
    low: stock?.filter(s => s.status === 'low').length ?? 0,
    out: stock?.filter(s => s.status === 'out').length ?? 0,
  }

  const statusBar = (qty: number, min: number) => {
    if (min <= 0) return null
    const pct = Math.min((qty / min) * 100, 100)
    const color = qty === 0 ? 'bg-red-400' : qty <= min ? 'bg-amber-400' : 'bg-green-400'
    return (
      <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <PageHeader
        title="Stock actual"
        subtitle="Estado del inventario en tiempo real"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Buscar producto, SKU o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input w-auto"
          value={warehouseId}
          onChange={e => setWarehouseId(e.target.value)}
        >
          <option value="">Todos los depósitos</option>
          {warehouses?.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {(['all', 'low', 'out'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              {s === 'all' ? `Todos (${counts.all})` : s === 'low' ? `Bajo mínimo (${counts.low})` : `Sin stock (${counts.out})`}
            </button>
          ))}
        </div>
      </div>

      {/* Summary by warehouse */}
      {!warehouseId && warehouses && warehouses.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {warehouses.map(w => {
            const wItems = stock?.filter(s => s.warehouse_id === w.id) ?? []
            const wLow = wItems.filter(s => s.status === 'low' || s.status === 'out').length
            return (
              <div key={w.id} className="card p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                  🏭
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{w.name}</div>
                  <div className="text-xs text-slate-400">{wItems.length} productos</div>
                </div>
                {wLow > 0 && (
                  <span className="badge-low">{wLow} alertas</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingScreen /> : !filtered.length ? (
          <Empty message={search ? 'No se encontraron productos con ese criterio' : 'No hay stock registrado'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Producto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">SKU</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Categoría</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Depósito</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Cantidad</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Mínimo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Nivel</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Estado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item) => (
                  <tr
                    key={`${item.product_id}-${item.warehouse_id}`}
                    className={cn(
                      'hover:bg-slate-50 transition-colors',
                      item.status === 'out' && 'bg-red-50/30',
                      item.status === 'low' && 'bg-amber-50/20',
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{item.product_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{item.category ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{item.warehouse_name}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={cn(
                        item.status === 'out' ? 'text-red-600' :
                        item.status === 'low' ? 'text-amber-600' : 'text-slate-800'
                      )}>
                        {Number(item.quantity).toLocaleString('es-AR')}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 font-mono text-xs">
                      {item.min_stock > 0 ? item.min_stock : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {statusBar(item.quantity, item.min_stock)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-${item.status}`}>
                        {item.status === 'normal' ? 'Normal' : item.status === 'low' ? 'Bajo mínimo' : 'Sin stock'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/movimientos?product_id=${item.product_id}`}
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                      >
                        <ExternalLink size={11} /> Ver historial
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
