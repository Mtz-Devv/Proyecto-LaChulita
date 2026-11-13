import { NavLink, Outlet } from "react-router";
import { useAuth } from '../context/AuthContext'
import type { RoleName } from '../types'



const links: { to: string; label: string; roles: RoleName[] }[] = [
   { to: '/', label: 'Reporte del dia', roles: ['admin'] },
   { to: '/mesas', label: 'Mesas', roles: ['admin', 'mesero'] },
   { to: '/cuentas', label: 'Cuentas', roles: ['admin', 'mesero'] },
   { to: '/barra', label: 'Barra', roles: ['admin', 'cantinero'] },
   { to: '/insumos', label: 'Insumos', roles: ['admin', 'cantinero'] },
   { to: '/productos', label: 'Menu y recetas', roles: ['admin'] },
   { to: '/categorias', label: 'Categorias', roles: ['admin'] },
   { to: '/proveedores', label: 'Proveedores', roles: ['admin'] },
   { to: '/compras', label: 'Compras', roles: ['admin'] },
   { to: '/moviminetos', label: 'Bitacora', roles: ['admin'] },
   { to: '/admin/mesas', label: 'Administrar mesas', roles: ['admin'] },
   { to: '/metodos-pago', label: 'Metodos de pago', roles: ['admin'] },
   { to: '/usuarios', label: 'Usuarios', roles: ['admin'] },
]

export default function Layout() {
    const { user, hasRole, logout } = useAuth()

    return(
        <div className="flex min-h-screen bg-gray-100">
            <aside className="w-60 shrink-0 bg-gray-900 p-4 text-gray-300">
                <h1 className="mb-6 text-lg font-bold text-white">Bar</h1>
                <nav className="space-y-1">
                    {links.filter((l) => hasRole(...l.roles)).map((l) => (
                 <NavLink
                  key={l.to}
                  to={l.to}
                  end
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-sm ${
                        isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-800'
                    }`
                }
                >
                   {l.label} 
                </NavLink>
                    ))}
                </nav>
            </aside>
            <div className="flex-1">
                <header className="flex items-center justify-end gap-4 border-b bg-white px-6 py-3 text-sm">
            <span>
                {user?.name}{' '}
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                    {user?.role?.name}
                </span>
            </span>
            <button className="btn-secondary" onClick={logout}>Cerrar sesion</button>
                </header>
                <main className="p-6">
                    <Outlet />
                </main>

            </div>
        </div>

    )
}