import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { LoadingScreen, Field, Input, Select, Alert, Spinner } from '@/components/ui'
import {
  ArrowLeft, Plus, ChevronRight, ChevronDown,
  MapPin, ToggleLeft, ToggleRight
} from 'lucide-react'
import type { Warehouse } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

type LocationType = 'zone' | 'aisle' | 'rack' | 'level' | 'cell'

type Location = {
  id: string
  warehouse_id: string
  parent_id: string | null
  location_type: LocationType
  code: string
  name: string | null
  max_weight_kg: number | null
  allows_cold: boolean
  allows_hazardous: boolean
  is_active: boolean
}

type TreeNode = Location & { children: TreeNode[]; depth: number }

type FormData = {
  code: string
  name?: string
  location_type: LocationType
  max_weight_kg?: number
  allows_cold: boolean
  allows_hazardous: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const LOCATION_TYPES: LocationType[] = ['zone', 'aisle', 'rack', 'level', 'cell']

const TYPE_LABELS: Record<LocationType, string> = {
  zone:  'Zona',
  aisle: 'Pasillo',
  rack:  'Rack / Estantería',
  level: 'Nivel',
  cell:  'Celda',
}

const TYPE_COLORS: Record<LocationType, string> = {
  zone:  'bg-violet-100 text-violet-700',
  aisle: 'bg-blue-100 text-blue-700',
  rack:  'bg-cyan-100 text-cyan-700',
  level: 'bg-teal-100 text-teal-700',
  cell:  'bg-slate-100 text-slate-600',
}

// Sugerencia de tipo según profundidad en el árbol
function suggestedType(depth: number): LocationType {
  return LOCATION_TYPES[Math.min(depth, LOCATION_TYPES.length - 1)]
}

// ── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(locations: Location[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  locations.forEach(l => map.set(l.id, { ...l, children: [], depth: 0 }))

  const roots: TreeNode[] = []
  map.forEach(node => {
    if (!node.parent_id) {
      roots.push(node)
    } else {
      const parent = map.get(node.parent_id)
      if (parent) {
        node.depth = parent.depth + 1
        parent.children.push(node)
      }
    }
  })

  // Propagar depth correctamente (BFS)
  const queue = [...roots]
  while (queue.length) {
    const node = queue.shift()!
    node.children.forEach(child => {
      child.depth = node.depth + 1
      queue.push(child)
    })
  }

  return roots
}

// ── Tree Node Component ───────────────────────────────────────────────────────

function LocationNode({
  node,
  collapsed,
  onToggleCollapse,
  onAddChild,
  onToggleActive,
  selectedParentId,
}: {
  node: TreeNode
  collapsed: Set<string>
  onToggleCollapse: (id: string) => void
  onAddChild: (parentId: string, depth: number) => void
  onToggleActive: (id: string, current: boolean) => void
  selectedParentId: string | null
}) {
  const isCollapsed = collapsed.has(node.id)
  const hasChildren = node.children.length > 0
  const isSelected = selectedParentId === node.id
  const indent = node.depth * 20

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group ${
          isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'
        } ${!node.is_active ? 'opacity-50' : ''}`}
        style={{ marginLeft: indent }}
      >
        {/* Colapsar/expandir */}
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center text-slate-400 flex-shrink-0"
          onClick={() => hasChildren && onToggleCollapse(node.id)}
        >
          {hasChildren
            ? isCollapsed
              ? <ChevronRight size={12} />
              : <ChevronDown size={12} />
            : <span className="w-1 h-1 rounded-full bg-slate-300 mx-auto" />
          }
        </button>

        {/* Tipo badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_COLORS[node.location_type]}`}>
          {TYPE_LABELS[node.location_type].charAt(0).toUpperCase()}
        </span>

        {/* Código y nombre */}
        <span className="font-mono text-xs font-semibold text-slate-700">{node.code}</span>
        {node.name && (
          <span className="text-xs text-slate-500 truncate">{node.name}</span>
        )}

        {/* Flags */}
        <div className="flex items-center gap-1 ml-1">
          {node.allows_cold && (
            <span className="text-[10px] bg-sky-100 text-sky-600 px-1 rounded">❄</span>
          )}
          {node.allows_hazardous && (
            <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded">⚠</span>
          )}
          {node.max_weight_kg && (
            <span className="text-[10px] text-slate-400">{node.max_weight_kg}kg</span>
          )}
        </div>

        {/* Acciones — visibles en hover o cuando está seleccionado */}
        <div className={`ml-auto flex items-center gap-1 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
            title="Agregar ubicación hija"
            onClick={() => onAddChild(node.id, node.depth + 1)}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-200 text-slate-400 transition-colors"
            title={node.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => onToggleActive(node.id, node.is_active)}
          >
            {node.is_active
              ? <ToggleRight size={13} className="text-green-500" />
              : <ToggleLeft size={13} />
            }
          </button>
        </div>
      </div>

      {/* Hijos */}
      {!isCollapsed && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <LocationNode
              key={child.id}
              node={child}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              onToggleActive={onToggleActive}
              selectedParentId={selectedParentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [selectedDepth, setSelectedDepth] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: warehouse } = useQuery<Warehouse>({
    queryKey: ['warehouse', id],
    queryFn: () => api.get(`/warehouses/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: locations, isLoading } = useQuery<Location[]>({
    queryKey: ['locations', id],
    queryFn: () => api.get(`/warehouses/${id}/locations`).then(r => r.data),
    enabled: !!id,
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { allows_cold: false, allows_hazardous: false },
  })

  const createMut = useMutation({
    mutationFn: (d: FormData & { parent_id: string | null }) =>
      api.post(`/warehouses/${id}/locations`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations', id] })
      reset({ allows_cold: false, allows_hazardous: false })
      setSelectedParentId(null)
      setSuccess('Ubicación creada')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al crear ubicación'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ locId, is_active }: { locId: string; is_active: boolean }) =>
      api.patch(`/warehouses/${id}/locations/${locId}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', id] }),
  })

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
      return next
    })
  }, [])

  const handleAddChild = useCallback((parentId: string, depth: number) => {
    setSelectedParentId(parentId)
    setSelectedDepth(depth)
    setValue('location_type', suggestedType(depth))
    setError('')
  }, [setValue])

  const handleAddRoot = () => {
    setSelectedParentId('__root__')
    setSelectedDepth(0)
    setValue('location_type', suggestedType(0))
    setError('')
  }

  const onSubmit = (d: FormData) => {
    createMut.mutate({
      ...d,
      parent_id: selectedParentId === '__root__' ? null : selectedParentId,
    })
  }

  const tree = locations ? buildTree(locations) : []
  const formVisible = selectedParentId !== null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
        <button
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          onClick={() => navigate('/depositos')}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-blue-600" />
          <span className="font-semibold text-slate-800">
            {warehouse?.name ?? '…'}
          </span>
          {warehouse?.address && (
            <span className="text-sm text-slate-400">— {warehouse.address}</span>
          )}
        </div>
      </div>

      {success && (
        <div className="px-6 pt-3">
          <Alert type="success" message={success} onClose={() => setSuccess('')} />
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Panel árbol */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">
              Ubicaciones
              {locations && (
                <span className="ml-2 text-slate-400 font-normal">
                  ({locations.length})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setCollapsed(new Set(tree.map(n => n.id)))}
              >
                Colapsar todo
              </button>
              <span className="text-slate-200">|</span>
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setCollapsed(new Set())}
              >
                Expandir todo
              </button>
              <button
                className="btn-primary py-1 px-3 text-xs ml-2"
                onClick={handleAddRoot}
              >
                <Plus size={12} /> Nueva zona raíz
              </button>
            </div>
          </div>

          {isLoading ? (
            <LoadingScreen />
          ) : !tree.length ? (
            <div className="text-center py-16 text-slate-400">
              <MapPin size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sin ubicaciones. Agregá una zona raíz para empezar.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {tree.map(node => (
                <LocationNode
                  key={node.id}
                  node={node}
                  collapsed={collapsed}
                  onToggleCollapse={toggleCollapse}
                  onAddChild={handleAddChild}
                  onToggleActive={(locId, current) =>
                    toggleMut.mutate({ locId, is_active: !current })
                  }
                  selectedParentId={selectedParentId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panel formulario */}
        {formVisible && (
          <div className="w-80 border-l border-slate-100 p-6 overflow-y-auto bg-white flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">
                {selectedParentId === '__root__'
                  ? 'Nueva ubicación raíz'
                  : 'Nueva ubicación hija'
                }
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 transition-colors text-xs"
                onClick={() => { setSelectedParentId(null); reset({ allows_cold: false, allows_hazardous: false }) }}
              >
                Cancelar
              </button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}

            {selectedParentId && selectedParentId !== '__root__' && (
              <div className="mb-4 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-500">
                Padre: <span className="font-mono font-semibold text-slate-700">
                  {locations?.find(l => l.id === selectedParentId)?.code ?? '—'}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <Field label="Tipo" required>
                <Select {...register('location_type', { required: 'Requerido' })}>
                  {LOCATION_TYPES.map(t => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                      {t === suggestedType(selectedDepth) ? ' (sugerido)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Código" required error={errors.code?.message}>
                <Input
                  {...register('code', { required: 'Requerido' })}
                  placeholder="A-01"
                  className="font-mono"
                />
              </Field>

              <Field label="Nombre descriptivo">
                <Input {...register('name')} placeholder="Pasillo principal..." />
              </Field>

              <Field label="Peso máximo (kg)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('max_weight_kg', { valueAsNumber: true })}
                  placeholder="500"
                />
              </Field>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" {...register('allows_cold')} className="rounded" />
                  Permite almacenamiento en frío
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" {...register('allows_hazardous')} className="rounded" />
                  Permite materiales peligrosos
                </label>
              </div>

              <button
                type="submit"
                className="btn-primary w-full mt-2"
                disabled={createMut.isPending}
              >
                {createMut.isPending
                  ? <Spinner size={13} className="text-white" />
                  : 'Crear ubicación'
                }
              </button>
            </form>

            {/* Leyenda de tipos */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Jerarquía sugerida
              </p>
              <div className="space-y-1">
                {LOCATION_TYPES.map((t, i) => (
                  <div key={t} className="flex items-center gap-2" style={{ paddingLeft: i * 10 }}>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[t]}`}>
                      {TYPE_LABELS[t].charAt(0)}
                    </span>
                    <span className="text-xs text-slate-500">{TYPE_LABELS[t]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}