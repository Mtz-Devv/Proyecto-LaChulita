import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import type { RoleName } from '../types'

const links: { to: string; label: string; icon: string; roles: RoleName[] }[] = [
  { to: '/', label: 'Reporte del día', icon: '📊', roles: ['admin'] },
  { to: '/mesas', label: 'Mesas', icon: '🪑', roles: ['admin', 'mesero'] },
  { to: '/cuentas', label: 'Cuentas', icon: '🧾', roles: ['admin', 'mesero'] },
  { to: '/barra', label: 'Barra', icon: '🍹', roles: ['admin', 'cantinero'] },
  { to: '/insumos', label: 'Insumos', icon: '🍾', roles: ['admin', 'cantinero'] },
  { to: '/productos', label: 'Menú y recetas', icon: '🍸', roles: ['admin'] },
  { to: '/categorias', label: 'Categorías', icon: '🏷️', roles: ['admin'] },
  { to: '/proveedores', label: 'Proveedores', icon: '🚚', roles: ['admin'] },
  { to: '/compras', label: 'Compras', icon: '📦', roles: ['admin'] },
  { to: '/movimientos', label: 'Bitácora', icon: '📋', roles: ['admin'] },
  { to: '/admin/mesas', label: 'Administrar mesas', icon: '⚙️', roles: ['admin'] },
  { to: '/metodos-pago', label: 'Métodos de pago', icon: '💳', roles: ['admin'] },
  { to: '/usuarios', label: 'Usuarios', icon: '👥', roles: ['admin'] },
]

const roleBadge: Record<RoleName, string> = {
  admin: 'bg-amber-100 text-amber-900 border-amber-300/70',
  mesero: 'bg-emerald-100 text-emerald-900 border-emerald-300/70',
  cantinero: 'bg-violet-100 text-violet-900 border-violet-300/70',
}

export default function Layout() {
  const { user, hasRole, logout } = useAuth()
  const roleName = user?.role?.name

  return (
    <div className="flex min-h-screen bg-[#faf7f2]">
      <aside className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-stone-950 via-stone-900 to-[#1f140d] p-4 text-stone-300 shadow-xl">
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-white/5 px-3.5 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-xl shadow-md shadow-amber-900/40">
            🍺
          </div>
          <div>
            <h1 className="font-brand text-xl font-extrabold tracking-wide text-amber-300">
              La Chulita
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-widest text-stone-400">
              Bar & Cantina
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {links
            .filter((l) => hasRole(...l.roles))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-950/50'
                      : 'text-stone-300 hover:bg-white/10 hover:text-amber-200'
                  }`
                }
              >
                <span className="text-base leading-none">{l.icon}</span>
                <span>{l.label}</span>
              </NavLink>
            ))}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-3 text-center text-[11px] text-stone-500">
          La Chulita · POS
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200/80 bg-white/90 px-6 py-3.5 backdrop-blur-md">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            Panel de operación
          </div>

          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-xs font-bold text-white shadow-xs">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-stone-800">{user?.name}</span>
                {roleName && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${roleBadge[roleName]}`}
                  >
                    {roleName}
                  </span>
                )}
              </div>
            </div>
            <button className="btn-secondary !py-1.5 !text-xs" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
