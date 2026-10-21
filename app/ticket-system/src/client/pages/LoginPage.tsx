import { LifeBuoy, Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const DEMO_ACCOUNTS = [
  { username: 'alice', label: '张丽 · 示例科技有限公司（提交人）' },
  { username: 'bob', label: '王强 · 示例科技有限公司（处理人）' },
  { username: 'carol', label: '李梅 · 星辰控股集团（提交人）' },
  { username: 'dave', label: '赵磊 · 星辰控股集团（处理人）' },
]

export default function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 已登录时离开登录页
  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/workspace', { replace: true })
    }
  }, [status, navigate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      const state = location.state as { from?: string } | null
      const target = state?.from && state.from !== '/login' ? state.from : '/workspace'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <LifeBuoy className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-900">工单系统</h1>
            <p className="mt-0.5 text-xs text-slate-500">多公司服务台 · 请登录后继续</p>
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-1.5">
            <label htmlFor="login-username" className="text-xs font-medium text-slate-700">
              用户名
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="输入用户名"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-xs font-medium text-slate-700">
              密码
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="输入密码"
            />
          </div>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
        <div className="mt-5 rounded-lg border border-slate-200 bg-white/60 px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">演示账号（密码 Demo@1234）</p>
          <ul className="mt-1.5 space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.username} className="flex items-center gap-2 text-[11px] text-slate-400">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{account.username}</code>
                <span className="truncate">{account.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
