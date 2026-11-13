import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TablesPage from './pages/TablesPage'
import OrderPage from './pages/OrderPage'
import OrdersPage from './pages/OrdersPage'
import BarQueuePage from './pages/BarQueuePage'
import IngredientsPage from './pages/IngredientsPage'
import ProductsPage from './pages/ProductsPage'
import CategoriesPage from './pages/CategoriesPage'
import SuppliersPage from './pages/SuppliersPage'
import PaymentMethodsPage from './pages/PaymentMethodsPage'
import BarTablesPage from './pages/BarTablesPage'
import PurchasesPage from './pages/PurchasesPage'
import NewPurchasePage from './pages/NewPurchasePage'
import MovementsPage from './pages/MovementsPage'
import UsersPage from './pages/UsersPage'

function HomePage() {
  const { hasRole } = useAuth()
  if (hasRole('admin')) return <DashboardPage />
  if (hasRole('mesero')) return <Navigate to="/mesas" replace />
  return <Navigate to="/barra" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />

          <Route element={<ProtectedRoute roles={['admin', 'mesero']} />}>
            <Route path="/mesas" element={<TablesPage />} />
            <Route path="/cuentas" element={<OrdersPage />} />
            <Route path="/cuentas/:id" element={<OrderPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin', 'cantinero']} />}>
            <Route path="/barra" element={<BarQueuePage />} />
            <Route path="/insumos" element={<IngredientsPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/productos" element={<ProductsPage />} />
            <Route path="/categorias" element={<CategoriesPage />} />
            <Route path="/proveedores" element={<SuppliersPage />} />
            <Route path="/metodos-pago" element={<PaymentMethodsPage />} />
            <Route path="/admin/mesas" element={<BarTablesPage />} />
            <Route path="/compras" element={<PurchasesPage />} />
            <Route path="/compras/nueva" element={<NewPurchasePage />} />
            <Route path="/movimientos" element={<MovementsPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}