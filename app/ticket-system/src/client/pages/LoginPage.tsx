import { useState, type FormEvent } from 'react'
import { login, saveToken, fetchMe } from '../api/auth'
import { ApiRequestError } from '../platform/api-client'
import { Button, ErrorBanner, Field, inputClass, Spinner } from '../components/ui'
import { IconTicket } from '../components/icons'
import type { CurrentUser } from '../contracts/types'
import { errorMessage } from '../hooks/useAsync'

export function LoginPage({ onLoggedIn }: { onLoggedIn: (me: CurrentUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await login({ username: username.trim(), password })
      saveToken(result.token)
      const me = await fetchMe()
      onLoggedIn(me)
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === 'INVALID_CREDENTIALS') {
        setError('用户名或密码不正确')
      } else {
        setError(errorMessage(cause, '登录失败，请稍后重试'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-2xl text-white shadow-sm">
            <IconTicket />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-slate-900">工单系统</h1>
            <p className="mt-1 text-sm text-slate-500">多公司工单提交、处理与运营分析平台</p>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <Field label="用户名" required>
            <input
              className={inputClass}
              name="username"
              autoComplete="username"
              required
              maxLength={64}
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          </Field>
          <Field label="密码" required>
            <input
              className={inputClass}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </Field>
          <ErrorBanner message={error || null} />
          <Button type="submit" className="w-full" disabled={busy || !username.trim() || !password}>
            {busy ? <Spinner /> : null}
            {busy ? '登录中…' : '登录'}
          </Button>
        </form>
      </div>
    </div>
  )
}
