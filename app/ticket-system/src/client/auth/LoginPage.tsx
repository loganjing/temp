import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { buttonPrimaryClass, inputClass } from '../components/feedback'
import { toUserMessage } from '../platform/api-client'

export default function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'authenticated') return <Navigate to="/workbench" replace />
  if (status === 'checking') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-sm text-slate-500">加载中…</p>
      </main>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username.trim(), password)
      navigate('/workbench', { replace: true })
    } catch (cause) {
      setError(toUserMessage(cause, '登录失败，请检查用户名与密码'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">登录工单系统</h1>
        <p className="mt-1 text-sm text-slate-500">使用本地账户登录，进入本公司工单工作区。</p>
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm text-slate-600">
            用户名
            <input
              className={`${inputClass} mt-1.5`}
              value={username}
              autoComplete="username"
              autoFocus
              required
              maxLength={320}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          </label>
          <label className="block text-sm text-slate-600">
            密码
            <input
              className={`${inputClass} mt-1.5`}
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className={`${buttonPrimaryClass} w-full`} disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </section>
    </main>
  )
}
