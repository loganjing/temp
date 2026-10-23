import { useState, type FormEvent } from 'react'
import { getBootstrapStatus, bootstrap, login, changePassword } from '../platform/ticket-api'
import type { CurrentUser } from '../types'

type Mode = 'checking' | 'required' | 'login' | 'passwordChange'

export default function LoginPage({ onAuthed }: { onAuthed: (user: CurrentUser) => void }) {
  const [mode, setMode] = useState<Mode>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const check = async () => {
    try {
      const status = await getBootstrapStatus()
      setMode(status.required ? 'required' : 'login')
    } catch {
      setError('无法连接服务 / Cannot connect to server')
      setMode('login')
    }
  }
  if (mode === 'checking') {
    void check()
    return <main className="auth-shell"><p>加载中…</p></main>
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (mode === 'required') {
        await bootstrap(body as { name: string; email: string; password: string })
        setMode('login')
        setError('账户已创建，请登录 / Account created. Please sign in.')
      } else if (mode === 'passwordChange' && user) {
        await changePassword({ password: body.password as string })
        onAuthed({ ...user, passwordChangeRequired: false })
      } else {
        const result = await login(body as { email: string; password: string })
        if (result.token) localStorage.setItem('platform-token', result.token)
        if (result.user.passwordChangeRequired) {
          setUser(result.user)
          setMode('passwordChange')
        } else {
          onAuthed(result.user)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败 / Request failed')
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<string, string> = {
    required: '创建首个账户',
    login: '登录工单系统',
    passwordChange: '更改临时密码',
  }
  const subtitles: Record<string, string> = {
    required: '仅在没有用户时可执行一次。',
    login: '使用本地账户登录。',
    passwordChange: '继续使用前请设置新密码。',
  }
  const isBootstrap = mode === 'required'
  const isPassword = mode === 'passwordChange'

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>{titles[mode]}</h1>
        <p className="subtitle">{subtitles[mode]}</p>
        <form onSubmit={(event) => void submit(event)} className="stack">
          {isBootstrap && (
            <label>姓名<input name="name" autoComplete="name" required maxLength={200} /></label>
          )}
          {!isPassword && (
            <label>邮箱<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
          )}
          <label>{isPassword ? '新密码' : '密码'}
            <input name="password" type="password"
              autoComplete={isBootstrap ? 'new-password' : isPassword ? 'new-password' : 'current-password'}
              required minLength={isBootstrap || isPassword ? 12 : 1} />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>
            {busy ? '处理中…' : isBootstrap ? '创建账户' : isPassword ? '更新密码' : '登录'}
          </button>
        </form>
      </section>
    </main>
  )
}
