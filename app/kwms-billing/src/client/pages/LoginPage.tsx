import { useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { errorText } from '../platform/errors'
import { useSession } from '../platform/session'

// 登录页：本地账号密码登录；凭证错误与服务异常给出中文提示。
// 首次登录（临时密码）按平台要求先完成修改密码再进入工作台。
export default function LoginPage() {
  const { login, refresh } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState('')

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const username = String(data.get('username') ?? '').trim()
    const password = String(data.get('password') ?? '')
    if (!username || !password) {
      setError('请输入用户名和密码')
      return
    }
    setBusy(true)
    setError('')
    try {
      await login(username, password)
      // 登录成功后由 App 切换工作台；若服务端要求修改密码，则进入改密分支
      setNeedsPassword(true)
    } catch (cause) {
      setError(errorText(cause, '登录失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const password = String(data.get('newPassword') ?? '')
    if (password.length < 12) {
      setError('新密码长度至少 12 位')
      return
    }
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify({ password }) })
      form.reset()
      setNeedsPassword(false)
      setPasswordNotice('密码已更新，请使用新密码重新登录')
      await refresh()
    } catch (cause) {
      setError(errorText(cause, '密码更新失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <section className="login-card">
        <div>
          <h1 className="login-title">KWMS 仓储费用管理</h1>
          <p className="login-sub">报价配置 · 自动计费 · 对账结算</p>
        </div>
        {passwordNotice && <div className="alert alert-success" role="status">{passwordNotice}</div>}
        {needsPassword ? (
          <form className="stack" onSubmit={(event) => void submitNewPassword(event)}>
            <label className="field">
              <span className="field-label">新密码<span className="required">*</span></span>
              <input name="newPassword" type="password" className="input" minLength={12} required autoComplete="new-password" />
              <span className="field-hint">首次登录需修改临时密码，长度至少 12 位。</span>
            </label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <button type="submit" className="btn" disabled={busy}>{busy ? '提交中…' : '更新密码'}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={(event) => void submitLogin(event)}>
            <label className="field">
              <span className="field-label">用户名<span className="required">*</span></span>
              <input name="username" className="input" autoComplete="username" placeholder="例如 finance@kwms.local" required maxLength={320} />
            </label>
            <label className="field">
              <span className="field-label">密码<span className="required">*</span></span>
              <input name="password" type="password" className="input" autoComplete="current-password" required maxLength={256} />
            </label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <button type="submit" className="btn" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
          </form>
        )}
      </section>
    </div>
  )
}
