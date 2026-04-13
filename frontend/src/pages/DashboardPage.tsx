import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, StatCard, LoadingScreen, Alert } from '@/components/ui'
import { formatDate, formatQty, MOVEMENT_LABELS } from '@/lib/utils'
import type { StockSummary, Movement } from '@/types'
import { TrendingDown, AlertTriangle } from 'lucide-react'

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary, error: errSummary } = useQuery<StockSummary>({
    queryKey: ['stock-summary'],
    queryFn: () => api.get('/stock/summary').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: recentMovements, isLoading: loadingMov } = useQuery<{ items: Movement[] }>({
    queryKey: ['movements-recent'],
    queryFn: () => api.get('/movements/?size=8').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: lowStock, isLoading: loadingLow } = useQuery<any[]>({
    queryKey: ['stock-low'],
    queryFn: () => api.get('/stock/?status=low').then(r => r.data),
  })

  if (loadingSummary) return <LoadingScreen />

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <PageHeader
        title="Dashboard"
        subtitle="Vista general del inventario"
      />

      {errSummary && <Alert type="error" message="Error al cargar los datos del sistema" />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Productos activos" value={summary?.total_products ?? '—'} sub="en catálogo" />
        <StatCard label="Depósitos" value={summary?.total_warehouses ?? '—'} sub="configurados" />
        <StatCard
          label="Bajo mínimo"
          value={summary?.low_stock_count ?? '—'}
          sub="requieren reposición"
          alert={(summary?.low_stock_count ?? 0) > 0}
        />
        <StatCard
          label="Sin stock"
          value={summary?.out_of_stock_count ?? '—'}
          sub="productos agotados"
          alert={(summary?.out_of_stock_count ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Movimientos recientes */}
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Movimientos recientes</h2>
          </div>
          {loadingMov ? (
            <div className="p-4 flex justify-center"><LoadingScreen /></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentMovements?.items.map((m) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`badge-${m.movement_type} flex-shrink-0 mt-0.5`}>
                    {MOVEMENT_LABELS[m.movement_type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate font-medium">{m.product.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatQty(m.quantity, m.product.unit.symbol)} · {m.performed_by_user.full_name ?? m.performed_by_user.username}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(m.performed_at)}</span>
                </div>
              ))}
              {!recentMovements?.items.length && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  No hay movimientos registrados aún
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stock bajo mínimo */}
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-700">Productos bajo mínimo</h2>
          </div>
          {loadingLow ? (
            <div className="p-4 flex justify-center"><LoadingScreen /></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {lowStock?.slice(0, 8).map((item) => (
                <div key={`${item.product_id}-${item.warehouse_id}`} className="flex items-center gap-3 px-4 py-3">
                  <TrendingDown size={14} className="text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{item.product_name}</p>
                    <p className="text-xs text-slate-400">{item.warehouse_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium text-amber-600">
                      {item.quantity} {item.unit}
                    </div>
                    <div className="text-xs text-slate-400">mín: {item.min_stock}</div>
                  </div>
                </div>
              ))}
              {!lowStock?.length && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  ✓ Todos los productos tienen stock suficiente
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
