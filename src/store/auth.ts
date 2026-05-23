// src/store/auth.ts
import { createContext, useContext, useState, useMemo, useRef } from 'react'

export type Role = 'admin' | 'sales' | 'technical' | 'technical_lead'

export interface AuthUser {
  id: number
  username: string
  full_name: string
  role: Role
}

interface AuthCtx {
  user:   AuthUser | null
  login:  (u: AuthUser) => void
  logout: () => void
}

const DEFAULT_CTX: AuthCtx = { user: null, login: () => {}, logout: () => {} }

export const AuthContext = createContext<AuthCtx>(DEFAULT_CTX)

export function useAuth() { return useContext(AuthContext) }

// ── Lưu/đọc user từ sessionStorage ───────────────────────────
function saveUser(u: AuthUser | null) {
  if (u) sessionStorage.setItem('uni-pom-user', JSON.stringify(u))
  else   sessionStorage.removeItem('uni-pom-user')
}
function loadUser(): AuthUser | null {
  try { return JSON.parse(sessionStorage.getItem('uni-pom-user') ?? 'null') }
  catch { return null }
}

export function useAuthProvider(): AuthCtx {
  const [user, setUser] = useState<AuthUser | null>(loadUser)

  // useRef để login/logout không thay đổi reference mỗi render
  const login = useRef((u: AuthUser) => {
    saveUser(u)
    setUser(u)
  }).current

  const logout = useRef(() => {
    saveUser(null)
    setUser(null)
    try { (window as any).api?.window?.resetSize?.() } catch { /* ignore */ }
    window.location.hash = '#/'
  }).current

  // useMemo: value chỉ đổi khi user thay đổi
  return useMemo(() => ({ user, login, logout }), [user, login, logout])
}
