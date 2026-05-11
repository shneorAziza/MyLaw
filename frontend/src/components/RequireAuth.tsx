import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../state/auth.tsx'

export function RequireAuth() {
  const { token } = useAuth()
  const loc = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <Outlet />
}
