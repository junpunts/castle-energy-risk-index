import { createAnonServerClient } from '@/lib/supabase/server'
import { parseArchetypeBundle, type ArchetypeBundle } from '@/lib/schemas'

/**
 * Read one archetype's canonical state. Throws if not found or invalid.
 * Used by every public page.
 */
export async function readArchetype(id: string): Promise<ArchetypeBundle | null> {
  const sb = createAnonServerClient()
  const { data, error } = await sb
    .from('archetypes')
    .select('state')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`readArchetype(${id}) failed: ${error.message}`)
  if (!data) return null

  return parseArchetypeBundle(data.state)
}

/** All archetypes for the public index grid. */
export async function readAllArchetypes(): Promise<ArchetypeBundle[]> {
  const sb = createAnonServerClient()
  const { data, error } = await sb
    .from('archetypes')
    .select('state')
    .order('id')

  if (error) throw new Error(`readAllArchetypes failed: ${error.message}`)
  return (data ?? []).map((row) => parseArchetypeBundle(row.state))
}

/**
 * Read state at a historical point in time. Used by the audit-history view
 * (later milestone) — "what did ow5 look like on April 1?"
 */
export async function readArchetypeAt(
  id: string,
  at: Date,
): Promise<ArchetypeBundle | null> {
  const sb = createAnonServerClient()
  const { data, error } = await sb
    .from('archetype_revisions')
    .select('state')
    .eq('archetype_id', id)
    .lte('applied_at', at.toISOString())
    .order('state_version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`readArchetypeAt(${id}, ${at.toISOString()}) failed: ${error.message}`)
  if (!data) return null
  return parseArchetypeBundle(data.state)
}
