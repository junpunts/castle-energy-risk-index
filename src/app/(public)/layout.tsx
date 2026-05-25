import type { ReactNode } from 'react'
import './public.css'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
