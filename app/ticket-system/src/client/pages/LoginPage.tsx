import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorText } from '../api/helpers'
import { roleHome, useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('请输入邮箱和密码')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const user = await login(trimmedEmail, password)
      navigate(roleHome(user.role), { replace: true })
    } catch (err) {
      setError(apiErrorText(err, '登录失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card-base w-full max-w-sm p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">工</span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">工单系统</h1>
            <p className="text-xs text-slate-400">多公司工单受理与处理平台</p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">邮箱</span>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="input-base"
              autoComplete="username"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">密码</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="请输入密码"
              className="input-base"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
