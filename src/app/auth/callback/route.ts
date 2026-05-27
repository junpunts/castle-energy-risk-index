import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * Magic-link callback. Supabase redirects here with ?code=<one-time>.
 * We exchange the code for a session, set cookies, and forward to /admin.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/admin'

  // Behind Render's proxy, new URL(request.url).origin resolves to the internal
  // container address (e.g. https://localhost:10000), NOT the public URL. Use
  // WEB_URL as the canonical origin for all redirects so the magic-link flow
  // lands on the real site. Falls back to request origin for local dev.
  const origin = process.env.WEB_URL ?? new URL(request.url).origin

  if (!code) {
    return NextResponse.redirect(`${origin}/admin/login?error=missing_code`)
  }

  const response = NextResponse.redirect(`${origin}${next}`)
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
      realtime: { params: { eventsPerSecond: 0 } },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/admin/login?error=${encodeURIComponent(error.message)}`)
  }

  return response
}
