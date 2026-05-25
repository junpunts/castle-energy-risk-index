import { createServerClient as createSSRServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client that reads/writes auth cookies.
 * Used in server components, route handlers, and server actions to
 * resolve the current authenticated user.
 */
export function createAuthServerClient() {
  const cookieStore = cookies()
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // server components can't set cookies; that's fine — the middleware
            // handles cookie refresh on every admin request.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // see note above
          }
        },
      },
      // The realtime client crashes on Node 20 without a polyfilled WebSocket.
      // No admin server-side code uses realtime — we only ever subscribe from
      // the browser. Defang it here so module load doesn't blow up.
      realtime: { params: { eventsPerSecond: 0 } },
    },
  )
}
