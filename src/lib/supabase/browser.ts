'use client'

import { createClient } from '@supabase/supabase-js'

let cached: ReturnType<typeof createClient> | null = null

/** Singleton anon client for the browser. Used for Supabase Realtime subscriptions. */
export function createBrowserClient() {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return cached
}
