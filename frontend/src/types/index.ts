export type Role = 'admin' | 'supervisor' | 'operator' | 'auditor' | 'viewer'
export type MovementType = 'entrada' | 'salida' | 'transferencia' | 'ajuste' | 'devolucion'
export type StockStatus = 'normal' | 'low' | 'out'

export interface User {
  id: string
  email: string
  username: string
  full_name: string | null
  role: Role
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface Category {
  id: number
  name: string
  description: string | null
  is_active: boolean
}

export interface Unit {
  id: number
  name: string
  symbol: string
}

export interface Product {
  id: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  category: Category | null
  unit: Unit
  min_stock: number
  cost_price: number | null
  is_active: boolean
  created_at: string
}

export interface Warehouse {
  id: string
  name: string
  address: string | null
  is_active: boolean
}

export interface StockItem {
  product_id: string
  product_name: string
  sku: string
  barcode: string | null
  category: string | null
  unit: string
  warehouse_id: string
  warehouse_name: string
  quantity: number
  min_stock: number
  status: StockStatus
}

export interface StockSummary {
  total_products: number
  total_warehouses: number
  low_stock_count: number
  out_of_stock_count: number
}

export interface Movement {
  id: string
  movement_type: MovementType
  product: Product
  from_warehouse: WarehouseLocation | null
  to_warehouse: WarehouseLocation | null
  quantity: number
  reference_doc: string | null
  notes: string | null
  performed_by_user: User
  performed_at: string
  is_reversal: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pages: number
  size: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}


 
export type LocationType = 'zone' | 'aisle' | 'rack' | 'level' | 'cell'
export type DispatchRule = 'FIFO' | 'FEFO' | 'LIFO'
 
export interface WarehouseLocation {
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
  created_at: string
}
 
export interface ProductUnitConversion {
  id: number
  product_id: string
  from_unit_id: number
  to_unit_id: number
  factor: number
  is_active: boolean
}
 
