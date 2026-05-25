import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Server-side only — never imported into a
 * client component. Bypasses RLS; do not expose to the browser.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the service-role client'
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
    global: { headers: { 'x-application-name': 'castle-eri-server' } },
  })
}

/**
 * Anon Supabase client for server components that render public data.
 * RLS-protected. Anon key is safe to leak (it's already public on every
 * page load via NEXT_PUBLIC_).
 */
export function createAnonServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required'
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
    global: { headers: { 'x-application-name': 'castle-eri-anon-server' } },
  })
}
