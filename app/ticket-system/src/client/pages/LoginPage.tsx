import { useState, type FormEvent } from 'react'
import { useSession } from '../app/session'
import { describeError } from '../platform/api-client'
import { Field, Feedback } from '../components/ui'

export default function LoginPage() {
  const session = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await session.signIn(username.trim(), password)
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white">工</div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">工单系统</h1>
          <p className="mt-1 text-sm text-slate-500">使用账号登录工单系统</p>
        </div>
        <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => { void submit(event) }}>
          <Field label="用户名">
            <input
              className="input-base"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="密码">
            <input
              className="input-base"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {session.bootstrapError !== '' && <Feedback tone="warning">服务暂时不可用：{session.bootstrapError}</Feedback>}
          {error !== '' && <Feedback tone="error">{error}</Feedback>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
