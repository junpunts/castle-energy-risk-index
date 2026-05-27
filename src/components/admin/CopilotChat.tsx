'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'

interface ProposalRef {
  id: string
  op: string
  target: string | null
  reasoning: string
}
interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  proposals?: ProposalRef[]
  applied?: Record<string, 'applied' | 'rejected' | 'pending'>
}

interface ArchetypeOption {
  id: string
  name: string
}

export function CopilotChat({ archetypes }: { archetypes: ArchetypeOption[] }) {
  const [archetypeId, setArchetypeId] = useState(archetypes[0]?.id ?? '')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [cost, setCost] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // Switching archetype starts a fresh conversation.
  function switchArchetype(id: string) {
    setArchetypeId(id)
    setSessionId(null)
    setMessages([])
    setCost(0)
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await fetch('/api/admin/copilot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archetype_id: archetypeId, message: text, session_id: sessionId }),
      })
      const data = await res.json()
      if (!data.ok) {
        setMessages((m) => [...m, { role: 'assistant', text: `⚠ ${data.message ?? 'error'}` }])
      } else {
        setSessionId(data.session_id)
        setCost((c) => c + (data.cost_usd ?? 0))
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: data.reply,
            proposals: data.proposals ?? [],
            applied: Object.fromEntries((data.proposals ?? []).map((p: ProposalRef) => [p.id, 'pending'])),
          },
        ])
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', text: `⚠ ${e?.message ?? 'request failed'}` }])
    } finally {
      setBusy(false)
    }
  }

  async function act(msgIdx: number, id: string, action: 'apply' | 'reject') {
    const res = await fetch(`/api/admin/proposals/${id}/${action}`, { method: 'POST' })
    const ok = res.ok
    setMessages((m) => {
      const copy = [...m]
      const msg = { ...copy[msgIdx] }
      msg.applied = { ...(msg.applied ?? {}), [id]: ok ? (action === 'apply' ? 'applied' : 'rejected') : 'pending' }
      copy[msgIdx] = msg
      return copy
    })
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="copilot">
      <div className="copilot-bar">
        <label className="copilot-pick">
          <span className="l">Archetype</span>
          <select value={archetypeId} onChange={(e) => switchArchetype(e.target.value)}>
            {archetypes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="copilot-meta">
          <span className="mono">{sessionId ? `session ${sessionId.slice(0, 8)}` : 'new session'}</span>
          <span className="sep">·</span>
          <span className="mono">${cost.toFixed(4)}</span>
        </div>
      </div>

      <div className="copilot-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="copilot-empty">
            <p>Ask about this archetype, or instruct an edit.</p>
            <ul>
              <li><code>what&apos;s the biggest risk right now?</code></li>
              <li><code>bump ns1 probability to 0.78 — FSER slipped</code></li>
              <li><code>rewrite the ns5 view to mention the SHINE loan close</code></li>
            </ul>
            <p className="copilot-note">
              The copilot never writes directly. Every edit becomes a proposal you approve here or in the{' '}
              <Link href="/admin/proposals">queue</Link>.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`copilot-msg ${m.role}`}>
            <div className="copilot-role">{m.role === 'user' ? 'You' : 'Copilot'}</div>
            <div className="copilot-text">{m.text}</div>
            {m.proposals && m.proposals.length > 0 && (
              <div className="copilot-proposals">
                {m.proposals.map((p) => {
                  const state = m.applied?.[p.id] ?? 'pending'
                  return (
                    <div key={p.id} className={`copilot-prop ${state}`}>
                      <div className="copilot-prop-head">
                        <span className="op mono">{p.op}</span>
                        {p.target && <span className="tgt mono">{p.target}</span>}
                        <span className={`pill ${state}`}>{state}</span>
                      </div>
                      <div className="copilot-prop-reason">{p.reasoning}</div>
                      {state === 'pending' && (
                        <div className="copilot-prop-actions">
                          <button className="btn" onClick={() => act(i, p.id, 'apply')}>
                            Approve
                          </button>{' '}
                          <button className="btn is-ghost" onClick={() => act(i, p.id, 'reject')}>
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="copilot-msg assistant">
            <div className="copilot-role">Copilot</div>
            <div className="copilot-text copilot-thinking">thinking…</div>
          </div>
        )}
      </div>

      <div className="copilot-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask or instruct… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={busy}
        />
        <button className="btn" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
