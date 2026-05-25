import { sendMagicLink } from './actions'

interface PageProps {
  searchParams: { error?: string; sent?: string; next?: string }
}

export default function LoginPage({ searchParams }: PageProps) {
  const error = searchParams.error
  const sent = searchParams.sent === '1'

  async function action(formData: FormData) {
    'use server'
    const result = await sendMagicLink(formData)
    const { redirect } = await import('next/navigation')
    if (result.error) redirect(`/admin/login?error=${encodeURIComponent(result.error)}`)
    if (result.sent) redirect('/admin/login?sent=1')
  }

  return (
    <main className="page admin-login">
      <div className="login-card">
        <span className="eyebrow">Castle / Risk Index</span>
        <h1 className="display-2">Admin sign-in.</h1>
        <p className="lede">
          Enter your email; we&rsquo;ll send a one-time link. Only emails on the admin allowlist
          can sign in.
        </p>

        {sent ? (
          <div className="login-confirm">
            <div className="kind">Link sent</div>
            <p>Check your email and click the link to continue.</p>
          </div>
        ) : (
          <form action={action} className="login-form">
            <label htmlFor="email" className="tiny-label">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@example.com"
            />
            <button type="submit" className="btn is-primary">
              Send link →
            </button>
            {error && <p className="login-error">{prettyError(error)}</p>}
          </form>
        )}
      </div>
    </main>
  )
}

function prettyError(e: string): string {
  if (e === 'not_authorized') return 'That email is not on the admin allowlist.'
  if (e === 'missing_code') return 'Auth callback was missing a code.'
  return e
}
