import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applyProposal } from '@/lib/archetypes/apply'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAdmin()
  const result = await applyProposal(params.id, `admin:${user.email}`)

  // Best-effort ISR revalidate for the affected archetype page.
  if (result.ok) {
    const tag = `archetype:${params.id}` // we don't know archetype_id here without an extra read; revalidate broadly.
    try {
      const { revalidatePath } = await import('next/cache')
      revalidatePath('/', 'layout')
    } catch {}
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
