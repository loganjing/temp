import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { LoginResponse, RegisterRequest, UserRole } from '../types'

type Mode = 'login' | 'register'

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const navigate = useNavigate()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      if (mode === 'register') {
        const body: RegisterRequest = {
          username: String(formData.get('username') ?? ''),
          password: String(formData.get('password') ?? ''),
          displayName: String(formData.get('displayName') ?? ''),
          email: String(formData.get('email') ?? ''),
          companyId: String(formData.get('companyId') ?? ''),
          departmentId: null,
          role: (String(formData.get('role') ?? 'admin') as UserRole),
        }
        await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(body) })
        setInfo('账户已创建，请登录')
        form.reset()
        setMode('login')
      } else {
        const body = {
          email: String(formData.get('username') ?? ''),
          password: String(formData.get('password') ?? ''),
        }
        const result = await apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        onLogin(result.token)
        navigate('/')
      }
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === 'FORBIDDEN') {
        setError('已有用户存在，请直接登录')
        setMode('login')
      } else {
        setError(cause instanceof Error ? cause.message : '操作失败')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>{mode === 'register' ? '创建首个账户' : '登录'}</h1>
        <p className="auth-desc">
          {mode === 'register'
            ? '首次使用时创建管理员账户。系统将自动创建关联公司。'
            : '使用您的账户登录工单系统。'}
        </p>
        <form onSubmit={(event) => void submit(event)} className="stack">
          <label>用户名<input name="username" autoComplete="username" required maxLength={100} /></label>
          {mode === 'register' && (
            <>
              <label>姓名<input name="displayName" autoComplete="name" required maxLength={200} /></label>
              <label>邮箱<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
              <label>公司名称<input name="companyId" required maxLength={200} placeholder="输入公司名称" /></label>
              <label>角色
                <select name="role" defaultValue="admin">
                  <option value="admin">管理员</option>
                  <option value="handler">处理人</option>
                  <option value="submitter">提交人</option>
                </select>
              </label>
            </>
          )}
          <label>密码<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 12 : 1} /></label>
          {error && <p role="alert" className="error">{error}</p>}
          {info && <p role="status" className="success">{info}</p>}
          <button disabled={busy}>{busy ? '处理中…' : mode === 'register' ? '创建账户' : '登录'}</button>
        </form>
        <p className="auth-toggle">
          {mode === 'login' ? (
            <button className="link-btn" onClick={() => { setMode('register'); setError(''); setInfo('') }}>首次使用？创建账户</button>
          ) : (
            <button className="link-btn" onClick={() => { setMode('login'); setError(''); setInfo('') }}>已有账户？去登录</button>
          )}
        </p>
      </section>
    </main>
  )
}
