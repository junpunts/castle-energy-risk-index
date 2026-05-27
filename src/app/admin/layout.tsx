import type { ReactNode } from 'react'
import Link from 'next/link'
import { getAdminOrNull } from '@/lib/auth'
import { signOut } from './login/actions'
import './admin.css'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getAdminOrNull()

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link className="brand" href="/admin">
            <img src="/assets/svg/castle-logo-black.svg" alt="Castle" />
            <span className="product">Risk Index · Admin</span>
          </Link>
          <div className="crumb admin-nav">
            <Link href="/admin">Overview</Link>
            <span className="sep">·</span>
            <Link href="/admin/archetypes">Archetypes</Link>
            <span className="sep">·</span>
            <Link href="/admin/proposals">Proposals</Link>
            <span className="sep">·</span>
            <Link href="/admin/copilot">Copilot</Link>
            <span className="sep">·</span>
            <Link href="/admin/runs">Runs</Link>
          </div>
          <div className="right">
            {user ? (
              <>
                <span className="admin-user">{user.email}</span>
                <form action={signOut}>
                  <button className="btn is-ghost" type="submit">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/admin/login">Sign in</Link>
            )}
          </div>
        </div>
      </nav>
      {children}
    </>
  )
}
