import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import { errorMessage } from '../utils/format'




export default function LoginPage() {
    const { user, login } = useAuth()
    const navigate = useNavigate()
    const [email, setEmail] = useState(' ')
    const [password, setPassword] = useState(' ')
    const [error, setError] = useState(' ')
    const [sending, setSending] = useState(false)

    if (user) return <Navigate to="/" />

    async function handleLogin() {
        setError(' ')
        setSending(true)
        try {
            await login(email, password)
            navigate('/')
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setSending(false)
        }
    }
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
         <form 
        onSubmit={(e) => {e.preventDefault(); handleLogin() }}
        className="card w-full max-w-sm space-y-4"
        >
        <h1 className="text-2xl font-blod">Bar · Iniciar sesion</h1>
        {error && <p className="error-box">{error}</p>}
        <div>
          <label className="label">Corrreo</label>
          <input className="input" type="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>   
        <div>
            <label className="label">Correo</label>
            <input className="input" type="password" required
             value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
         <button className="btn-primary w-full" disabled={sending}>
            {sending ? 'Entrando...' : 'Entrar'}
         </button>
         </form>
        </div>
    )

}