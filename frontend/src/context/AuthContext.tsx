import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import api, { TOKEN_KEY } from '../api/client'
import type { RoleName, User } from '../types'

interface AuthContextValue {
    user: User | null
    loading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>
    hasRole: (...roles: RoleName[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode}) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)


useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
        setLoading(false)
        return
    }
    api.get<User>('/me')
    .then((res) => setUser(res.data))
    .catch(() => localStorage.removeItem(TOKEN_KEY))
    .finally(() => setLoading(false))
}, [])

async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User}>('/login', { email, password})
    localStorage.setItem(TOKEN_KEY, res.data.token)
    setUser(res.data.user)
}
async function logout() {
    try{
        await api.post('/logout')
    } finally {
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
    }
}

function hasRole(...roles: RoleName[]) {
    return !!user?.role && roles.includes(user.role.name)
}

return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}> 
    {children}
    </AuthContext.Provider>
)
}
export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
        return ctx
}
