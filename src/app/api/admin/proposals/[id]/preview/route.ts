import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { previewProposal } from '@/lib/archetypes/preview'

export const runtime = 'nodejs'

/**
 * Dry-run preview of a proposal's changes. Powers the admin diff modal.
 * Read-only — never persists.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin()
  const result = await previewProposal(params.id)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
