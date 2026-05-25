'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  archetypeId: string
  pipelineName: string
  label: string
  disabled?: boolean
}

export function TriggerPipeline({ archetypeId, pipelineName, label, disabled }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function trigger() {
    setError(null)
    start(async () => {
      const res = await fetch(`/api/admin/pipelines/${pipelineName}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archetypeId }),
      })
      if (!res.ok) {
        setError(`Trigger failed (${res.status})`)
        return
      }
      const { runId } = await res.json()
      router.push(`/admin/runs/${runId}`)
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        className="btn"
        onClick={trigger}
        disabled={pending || disabled}
        title={disabled ? 'Coming soon' : ''}
      >
        {pending ? 'Starting…' : label} →
      </button>
      {error && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--neg)' }}>{error}</span>}
    </div>
  )
}
