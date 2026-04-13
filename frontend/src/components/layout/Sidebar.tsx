import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, ArrowLeftRight,
  Warehouse, Users, LogOut
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn, ROLE_LABELS } from '@/lib/utils'

const NAV = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard',    roles: ['admin','supervisor','operator','auditor','viewer'] },
  { to: '/productos',   icon: Package,         label: 'Productos',    roles: ['admin','supervisor','operator','auditor','viewer'] },
  { to: '/stock',       icon: Warehouse,       label: 'Stock',        roles: ['admin','supervisor','operator','auditor','viewer'] },
  { to: '/movimientos', icon: ArrowLeftRight,  label: 'Movimientos',  roles: ['admin','supervisor','operator','auditor','viewer'] },
  { to: '/depositos',   icon: Warehouse,       label: 'Depósitos',    roles: ['admin','supervisor'] },
  { to: '/usuarios',    icon: Users,           label: 'Usuarios',     roles: ['admin'] },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.username?.slice(0, 2).toUpperCase() ?? 'US'

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="text-sm font-semibold text-slate-800">StockControl</div>
        <div className="text-xs text-slate-400 mt-0.5">v1.0 MVP</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.filter(item => user && item.roles.includes(user.role)).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            )}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-700 truncate">
              {user?.full_name || user?.username}
            </div>
            <div className="text-xs text-slate-400">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-1 w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
