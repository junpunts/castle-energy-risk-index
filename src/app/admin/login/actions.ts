'use server'

import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { isAdminEmail } from '@/lib/auth'

export async function sendMagicLink(formData: FormData): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) return { error: 'Email is required' }

  // Refuse to spam non-admins. The allowlist check happens on /admin/* anyway,
  // but bouncing it here saves a round trip to Supabase Auth.
  if (!isAdminEmail(email)) {
    return { error: 'Not authorized' }
  }

  const sb = createAuthServerClient()
  const origin = process.env.WEB_URL ?? 'http://localhost:3000'
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/admin` },
  })
  if (error) return { error: error.message }
  return { sent: true }
}

export async function signOut() {
  const sb = createAuthServerClient()
  await sb.auth.signOut()
  redirect('/admin/login')
}
