import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge middleware. Refreshes the Supabase session cookie on every request
 * so server components see a valid session, and gates /admin/* behind both
 * authentication and the ADMIN_EMAILS allowlist.
 *
 * Login page (/admin/login) and the OAuth callback (/auth/callback) are
 * unprotected.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
      // Same defang as the server client; middleware runs on edge runtime
      // (no ws issue there) but the import would still pull realtime in.
      realtime: { params: { eventsPerSecond: 0 } },
    },
  )

  const { pathname } = request.nextUrl

  // Gate /admin/* (except /admin/login).
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    // Allowlist check (mirrors lib/auth.ts isAdminEmail — duplicated because
    // middleware runs on edge runtime and can't import server-only modules).
    const allow = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (!user.email || allow.length === 0 || !allow.includes(user.email.toLowerCase())) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('error', 'not_authorized')
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/auth/:path*'],
}
