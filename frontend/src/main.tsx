import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter} from 'react-router'
import { AuthProvider } from './context/AuthContext'
import RealtimeProvider from './realtime/RealtimeProvider'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
     <AuthProvider>
      <RealtimeProvider>
       <App />
      </RealtimeProvider>
     </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
