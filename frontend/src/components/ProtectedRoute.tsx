import { useAuth } from "../context/AuthContext";
import type { RoleName } from "../types";
import { Navigate, Outlet} from 'react-router'


export default function ProtectedRoute({ roles }: { roles?: RoleName[] }) {
    const { user, loading, hasRole } = useAuth()
     
    if (loading) return <p className="p-8 text-gray-500">Cargando</p>
    if (!user) return <Navigate to="/login" replace /> 
    if (roles && !hasRole(...roles)) return <Navigate to="/" replace />

    return <Outlet />
}

