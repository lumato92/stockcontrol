import { clsx, type ClassValue } from 'clsx'
import { format, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(iso: string) {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm")
  } catch {
    return iso
  }
}

export function formatQty(n: number, symbol: string) {
  return `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${symbol}`
}

export function formatCurrency(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

export const MOVEMENT_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  transferencia: 'Transferencia',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operator: 'Operador',
  auditor: 'Auditor',
  viewer: 'Viewer',
}

export const STATUS_LABELS: Record<string, string> = {
  normal: 'Normal',
  low: 'Bajo mínimo',
  out: 'Sin stock',
}

export function canWrite(role: string) {
  return ['admin', 'supervisor', 'operator'].includes(role)
}

export function canManageUsers(role: string) {
  return role === 'admin'
}

export function canApprove(role: string) {
  return ['admin', 'supervisor'].includes(role)
}
