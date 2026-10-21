import { useEffect, useState, type FormEvent } from 'react'
import { bootstrapFirstAccount, fetchBootstrapStatus, login } from '../api'
import { apiErrorMessage } from '../components/ui'

interface Props {
  onSuccess: () => void
}

export default function LoginPage({ onSuccess }: Props) {
  const [mode, setMode] = useState<'checking' | 'bootstrap' | 'login'>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchBootstrapStatus()
      .then((status) => setMode(status.required ? 'bootstrap' : 'login'))
      .catch(() => setMode('login'))
  }, [])

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    setError('')
    try {
      await login(username.trim(), password)
      onSuccess()
    } catch (cause) {
      setError(apiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const submitBootstrap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await bootstrapFirstAccount({ name: name.trim(), email: email.trim(), password })
      setMode('login')
      setUsername(email.trim())
      setMessage('账户已创建，请使用邮箱登录。')
    } catch (cause) {
      setError(apiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'checking') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-sm text-slate-500">加载中…</p>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="panel p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg font-bold text-white">工</div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">工单系统</h1>
              <p className="text-xs text-slate-400">多公司工单协作与运营平台</p>
            </div>
          </div>

          {mode === 'bootstrap' ? (
            <form className="space-y-4" onSubmit={(event) => void submitBootstrap(event)}>
              <p className="text-sm text-slate-500">系统暂无账户，请先创建首个账户（仅可执行一次）。</p>
              <label className="block">
                <span className="label-text">姓名</span>
                <input
                  className="input"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <label className="block">
                <span className="label-text">邮箱</span>
                <input
                  className="input"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </label>
              <label className="block">
                <span className="label-text">密码（至少 12 位）</span>
                <input
                  className="input"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? '创建中…' : '创建首个账户'}
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={(event) => void submitLogin(event)}>
              <label className="block">
                <span className="label-text">用户名</span>
                <input
                  className="input"
                  name="username"
                  autoComplete="username"
                  required
                  maxLength={200}
                  placeholder="例如 a-sub1"
                  value={username}
                  onChange={(event) => setUsername(event.currentTarget.value)}
                />
              </label>
              <label className="block">
                <span className="label-text">密码</span>
                <input
                  className="input"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              {message && <p className="text-sm text-emerald-600">{message}</p>}
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? '登录中…' : '登录'}
              </button>
            </form>
          )}
        </div>

        {mode === 'login' && (
          <details className="mt-4 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
            <summary className="cursor-pointer select-none font-medium text-slate-600">演示账号（首次启动自动创建）</summary>
            <table className="mt-2 w-full border-collapse text-left">
              <tbody>
                {[
                  ['a-sub1 / a-sub2', '华东科技 · 提交人'],
                  ['a-agent1 / a-agent2', '华东科技 · 处理人'],
                  ['a-admin', '华东科技 · 公司管理者'],
                  ['b-sub1 / b-agent1 / b-admin', '南方制造'],
                  ['ops1', '平台运营（跨公司只读）'],
                ].map(([account, description]) => (
                  <tr key={account} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-mono">{account}</td>
                    <td className="py-1.5">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-slate-400">统一演示密码：demo-131</p>
          </details>
        )}
      </div>
    </main>
  )
}
