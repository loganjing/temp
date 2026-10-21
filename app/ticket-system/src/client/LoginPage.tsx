// 登录页：首个账户初始化、账号登录与临时密码修改。
import { useState, type FormEvent } from 'react'
import { Ticket } from 'lucide-react'
import { useAuth } from './auth'
import { apiErrorMessage, ErrorBanner, SuccessBanner } from './shared'

export default function LoginPage() {
  const { phase, bootstrapRequired, connectionError, login, createFirstAccount, submitNewPassword } = useAuth()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (phase === 'change-password') {
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = event.currentTarget
      const password = String(new FormData(form).get('password') ?? '')
      setBusy(true)
      setError('')
      try {
        await submitNewPassword(password)
      } catch (cause) {
        setError(apiErrorMessage(cause, '密码更新失败'))
      } finally {
        setBusy(false)
      }
    }
    return (
      <AuthFrame title="更改临时密码" description="继续使用前，请为账户设置新密码。">
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label className="label">
            新密码（至少 12 位）
            <input className="input" name="password" type="password" autoComplete="new-password" minLength={12} required />
          </label>
          {error && <ErrorBanner message={error} />}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? '处理中…' : '更新密码'}
          </button>
        </form>
      </AuthFrame>
    )
  }

  if (bootstrapRequired) {
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = event.currentTarget
      const data = new FormData(form)
      setBusy(true)
      setError('')
      try {
        const text = await createFirstAccount(
          String(data.get('name') ?? ''),
          String(data.get('email') ?? ''),
          String(data.get('password') ?? ''),
        )
        form.reset()
        setMessage(text)
      } catch (cause) {
        setError(apiErrorMessage(cause, '账户创建失败'))
      } finally {
        setBusy(false)
      }
    }
    return (
      <AuthFrame title="创建首个账户" description="系统尚无账户，此初始化仅可执行一次。">
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label className="label">
            姓名
            <input className="input" name="name" autoComplete="name" required maxLength={200} />
          </label>
          <label className="label">
            邮箱
            <input className="input" name="email" type="email" autoComplete="email" required maxLength={320} />
          </label>
          <label className="label">
            临时密码（至少 12 位）
            <input className="input" name="password" type="password" autoComplete="new-password" minLength={12} required />
          </label>
          {error && <ErrorBanner message={error} />}
          {message && <SuccessBanner message={message} />}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? '处理中…' : '创建账户'}
          </button>
        </form>
      </AuthFrame>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await login(String(data.get('username') ?? ''), String(data.get('password') ?? ''))
    } catch (cause) {
      setError(apiErrorMessage(cause, '登录失败，请检查邮箱与密码'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthFrame title="登录工单系统" description="使用本地账户邮箱登录。">
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <label className="label">
          邮箱
          <input className="input" name="username" type="email" autoComplete="email" required maxLength={320} />
        </label>
        <label className="label">
          密码
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <ErrorBanner message={error} />}
        {connectionError && <ErrorBanner message={connectionError} />}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </AuthFrame>
  )
}

function AuthFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Ticket className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  )
}
