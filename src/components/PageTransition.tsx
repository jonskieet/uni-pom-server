// ============================================================
// src/components/PageTransition.tsx
// ============================================================
import { FC, ReactNode } from 'react'

export const PageTransition: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="slide-up" style={{ height: '100%' }}>
    {children}
  </div>
)
