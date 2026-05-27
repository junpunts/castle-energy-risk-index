import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

/**
 * Returns the current admin user if authenticated AND email is in the
 * ADMIN_EMAILS allowlist. Redirects to /admin/login otherwise.
 *
 * Use this in every admin server component as the first call.
 */
export async function requireAdmin() {
  // TEMPORARY: auth bypass. When AUTH_DISABLED=true, return a stub admin user
  // so all `user.email` consumers keep working. Re-enable by unsetting the var.
  if (process.env.AUTH_DISABLED === 'true') {
    return { id: 'auth-disabled', email: 'admin@castle.tech' } as any
  }

  const sb = createAuthServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user || !user.email) {
    redirect('/admin/login')
  }

  if (!isAdminEmail(user.email)) {
    redirect('/admin/login?error=not_authorized')
  }

  return user
}

/** Non-redirecting variant. Returns null instead of throwing. */
export async function getAdminOrNull() {
  if (process.env.AUTH_DISABLED === 'true') {
    return { id: 'auth-disabled', email: 'admin@castle.tech' } as any
  }
  const sb = createAuthServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email || !isAdminEmail(user.email)) return null
  return user
}

export function isAdminEmail(email: string): boolean {
  const allow = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (allow.length === 0) {
    // Empty allowlist = no admins. Deny by default.
    return false
  }
  return allow.includes(email.toLowerCase())
}
