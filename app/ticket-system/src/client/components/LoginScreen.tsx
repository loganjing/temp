// 登录页：本地密码登录；无任何账户时按 starter 生成流程创建首个账户。

import { useEffect, useState, type FormEvent } from 'react'
import { describeApiError } from '../platform/api-client'
import { bootstrapFirstAccount, fetchBootstrapStatus, fetchCurrentUser, login } from '../api'
import type { CurrentUser } from '../contracts'
import { IconInbox } from './icons'

type Mode = 'checking' | 'bootstrap' | 'login'

export default function LoginScreen({ onSuccess }: { onSuccess: (user: CurrentUser) => void }) {
  const [mode, setMode] = useState<Mode>('checking')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchBootstrapStatus()
      .then((status) => {
        if (!cancelled) setMode(status.required ? 'bootstrap' : 'login')
      })
      .catch(() => {
        if (!cancelled) setMode('login')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'bootstrap') {
        await bootstrapFirstAccount({ name: name.trim(), email: email.trim(), password })
        setMode('login')
        setNotice('首个账户已创建，请使用邮箱和密码登录')
        setPassword('')
      } else {
        const result = await login({ email: email.trim(), password })
        localStorage.setItem('platform-token', result.token)
        onSuccess(await fetchCurrentUser())
      }
    } catch (cause) {
      setError(describeApiError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="card w-full max-w-sm p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white">
            <IconInbox size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">工单系统</h1>
            <p className="text-xs text-slate-500">多公司工单服务</p>
          </div>
        </div>
        {mode === 'checking' ? (
          <p className="mt-6 text-sm text-slate-500">加载中…</p>
        ) : (
          <>
            <h2 className="mt-6 text-sm font-semibold text-slate-800">
              {mode === 'bootstrap' ? '创建首个账户' : '登录'}
            </h2>
            <p className="mt-1 mb-4 text-xs text-slate-500">
              {mode === 'bootstrap'
                ? '当前没有任何账户，请先创建管理员账户（仅可执行一次）。'
                : '使用本地账户的邮箱和密码登录。'}
            </p>
            <form className="space-y-3.5" onSubmit={(event) => void submit(event)}>
              {mode === 'bootstrap' && (
                <div>
                  <label className="label" htmlFor="login-name">
                    姓名
                  </label>
                  <input
                    id="login-name"
                    className="input"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    autoComplete="name"
                    required
                    maxLength={200}
                  />
                </div>
              )}
              <div>
                <label className="label" htmlFor="login-email">
                  邮箱
                </label>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  autoComplete="email"
                  required
                  maxLength={320}
                />
              </div>
              <div>
                <label className="label" htmlFor="login-password">
                  密码
                </label>
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'bootstrap' ? 12 : 1}
                />
              </div>
              {notice && (
                <p className="break-words rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <p className="break-words rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? '处理中…' : mode === 'bootstrap' ? '创建账户' : '登录'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
