import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'

type User = { id: string; name: string; email: string; phone: string | null; enabled: boolean }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await apiRequest<{ users: User[]; total: number }>(`/api/admin/users?search=${encodeURIComponent(search)}&limit=50&offset=${offset}`)
    setUsers(result.users)
    setTotal(result.total)
  }, [search, offset])

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : '加载失败 / Load failed')) }, [load])

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      setMessage('用户已创建 / User created')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败 / Create failed')
    } finally {
      setBusy(false)
    }
  }

  const setEnabled = async (user: User) => {
    setError('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/status`, { method: 'PATCH', body: JSON.stringify({ enabled: !user.enabled }) })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败 / Update failed')
    }
  }

  const updateUser = async (event: FormEvent<HTMLFormElement>, user: User) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setError('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
      setMessage(`已更新 ${user.email} / Updated ${user.email}`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败 / Update failed')
    }
  }

  const resetPassword = async (event: FormEvent<HTMLFormElement>, user: User) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setError('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/password`, { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      setMessage(`已重置 ${user.email} 的密码 / Password reset for ${user.email}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重置失败 / Reset failed')
    }
  }

  return (
    <div className="admin-grid">
      <section className="card">
        <h2>添加用户 / Add user</h2>
        <form className="form-grid" onSubmit={(event) => void submitCreate(event)}>
          <label>姓名 / Name<input name="name" required maxLength={200} /></label>
          <label>邮箱 / Email<input name="email" type="email" required maxLength={320} /></label>
          <label>手机号（可选）/ Phone (optional)<input name="phone" type="tel" /></label>
          <label>临时密码 / Temporary password<input name="password" type="password" minLength={12} required /></label>
          <button disabled={busy}>创建 / Create</button>
        </form>
      </section>

      <section className="card">
        <div className="section-heading"><h2>用户 / Users ({total})</h2><label className="search">搜索 / Search<input value={search} onChange={(event) => { setSearch(event.currentTarget.value); setOffset(0) }} /></label></div>
        {message && <p role="status" className="success">{message}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>用户 / User</th><th>手机号 / Phone</th><th>状态 / Status</th><th>操作 / Actions</th></tr></thead>
            <tbody>{users.map((user) => <tr key={user.id}>
              <td><strong title={user.name}>{user.name}</strong><span className="subtext" title={user.email}>{user.email}</span></td>
              <td title={user.phone ?? ''}>{user.phone || '—'}</td>
              <td>{user.enabled ? '启用 / Active' : '停用 / Disabled'}</td>
              <td><div className="row-actions">
                <button className="secondary" onClick={() => void setEnabled(user)}>{user.enabled ? '停用 / Disable' : '启用 / Enable'}</button>
                <details><summary>编辑 / Edit</summary><form className="reset-form" onSubmit={(event) => void updateUser(event, user)}>
                  <input aria-label="姓名 / Name" name="name" defaultValue={user.name} required maxLength={200} />
                  <input aria-label="邮箱 / Email" name="email" type="email" defaultValue={user.email} required maxLength={320} />
                  <input aria-label="手机号 / Phone" name="phone" type="tel" defaultValue={user.phone ?? ''} />
                  <button className="secondary">保存 / Save</button>
                </form></details>
                <form className="reset-form" onSubmit={(event) => void resetPassword(event, user)}><input aria-label="新密码 / New password" name="password" type="password" minLength={12} placeholder="新密码 / New password" required /><button className="secondary">重置密码 / Reset</button></form>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="section-heading pagination"><span>{total === 0 ? '无用户 / No users' : `${offset + 1}–${Math.min(offset + users.length, total)} / ${total}`}</span><div className="row-actions"><button className="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - 50, 0))}>上一页 / Previous</button><button className="secondary" disabled={offset + users.length >= total} onClick={() => setOffset(offset + 50)}>下一页 / Next</button></div></div>
      </section>
    </div>
  )
}
