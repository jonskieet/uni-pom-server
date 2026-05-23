// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import type { Role } from '../store/auth'

export default function ProtectedRoute({ children, allowedRoles }: {
  children: React.ReactNode
  allowedRoles?: Role[]
}) {
  const { user } = useAuth()

  if (!user) return null

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect thẳng về home theo role — KHÔNG về "/" để tránh loop
    const home = user.role === 'technical' ? '/create-pom' : '/products'
    return <Navigate to={home} replace />
  }

  return <>{children}</>
}
