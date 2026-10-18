import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Field, Input, LoadingBlock } from '../components/ui'
import { Icon } from '../components/icons'
import { errorText } from '../domain/format'
import { usePlatformText } from '../platform/i18n'
import { roleHome, useSession } from '../platform/session'

export function LoginPage() {
  const t = usePlatformText()
  const { status, me, login } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <LoadingBlock label={t('common.loading')} />
      </div>
    )
  }
  if (status === 'authenticated' && me) {
    return <Navigate to={roleHome(me.role)} replace />
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const profile = await login(email, password)
      navigate(roleHome(profile.role), { replace: true })
    } catch (reason) {
      setError(errorText(reason, t('login.failed')))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Icon name="ticket" className="h-8 w-8 text-indigo-600" />
          <h1 className="text-lg font-semibold text-slate-800">Helpdesk</h1>
          <p className="text-sm text-slate-500">{t('login.title')}</p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Field label={t('login.email')} required>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label={t('login.password')} required>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button variant="primary" type="submit" disabled={busy} className="w-full justify-center">
            {busy ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}
