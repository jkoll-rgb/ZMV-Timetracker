import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TimeTracking from './pages/TimeTracking'
import Clients from './pages/Clients'
import Reports from './pages/Reports'
import Screenshots from './pages/Screenshots'
import Invoices from './pages/Invoices'
import SettingsPage from './pages/Settings'
import Offers from './pages/Offers'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/tracking" element={<TimeTracking />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/screenshots" element={<Screenshots />} />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute requiredRole="admin">
              <Invoices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offers"
          element={
            <ProtectedRoute requiredRole="admin">
              <Offers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requiredRole="admin">
              <SettingsPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}
