import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'

type User = {
  id: string
  name: string
  email: string
  phone: string | null
  enabled: boolean
  companyName?: string
  department?: string
}

const LIST_PAGE_SIZE = 50

/** 用户管理（starter 扩展）：支持公司名（不存在则创建 company）与部门字段（契约第 1 节）。 */
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await apiRequest<{ users: User[]; total: number }>(
      `/api/admin/users?${new URLSearchParams({
        search,
        limit: String(LIST_PAGE_SIZE),
        offset: String(offset),
      })}`,
    )
    setUsers(result.users)
    setTotal(result.total)
  }, [search, offset])

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : '加载失败，请重试'))
  }, [load])

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const raw = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: raw.name,
          email: raw.email,
          password: raw.password,
          phone: raw.phone || undefined,
          companyName: raw.companyName || undefined,
          department: raw.department || undefined,
        }),
      })
      form.reset()
      setMessage(`用户 ${raw.email} 已创建（首次登录需修改临时密码）`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const setEnabled = async (user: User) => {
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !user.enabled }),
      })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败，请重试')
    }
  }

  const updateUser = async (event: FormEvent<HTMLFormElement>, user: User) => {
    event.preventDefault()
    const form = event.currentTarget
    const raw = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: raw.name,
          email: raw.email,
          phone: raw.phone || undefined,
          companyName: raw.companyName || undefined,
          department: raw.department || undefined,
        }),
      })
      setMessage(`已更新 ${user.email}`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败，请重试')
    }
  }

  const resetPassword = async (event: FormEvent<HTMLFormElement>, user: User) => {
    event.preventDefault()
    const form = event.currentTarget
    const raw = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: raw.password }),
      })
      form.reset()
      setMessage(`已重置 ${user.email} 的临时密码`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重置失败，请重试')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">用户管理</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          为本公司创建用户并维护资料（姓名、邮箱、手机号、公司名、部门）与凭证。
        </p>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">添加用户</h2>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={(event) => void submitCreate(event)}>
          <label className="field">
            <span className="label">姓名（必填）</span>
            <input name="name" className="input" required maxLength={200} disabled={busy} />
          </label>
          <label className="field">
            <span className="label">邮箱（必填）</span>
            <input name="email" type="email" className="input" required maxLength={320} disabled={busy} />
          </label>
          <label className="field">
            <span className="label">公司名（不存在时将创建公司）</span>
            <input name="companyName" className="input" maxLength={200} disabled={busy} />
          </label>
          <label className="field">
            <span className="label">部门</span>
            <input name="department" className="input" maxLength={200} disabled={busy} />
          </label>
          <label className="field">
            <span className="label">手机号（可选）</span>
            <input name="phone" type="tel" className="input" disabled={busy} />
          </label>
          <label className="field">
            <span className="label">临时密码（必填，至少 12 位）</span>
            <input name="password" type="password" className="input" minLength={12} required disabled={busy} />
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? '创建中…' : '创建用户'}
            </button>
          </div>
        </form>
        {(message || error) && (
          <div className="mt-3 space-y-2">
            {message && (
              <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700">用户（{total}）</h2>
          <input
            type="search"
            className="input max-w-[14rem]"
            placeholder="搜索姓名 / 邮箱"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value)
              setOffset(0)
            }}
            aria-label="搜索用户"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">用户</th>
                <th className="px-3 py-2 font-medium">公司 / 部门</th>
                <th className="px-3 py-2 font-medium">手机号</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-slate-700" title={user.name}>
                      {user.name}
                    </span>
                    <span className="block text-slate-400" title={user.email}>
                      {user.email}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {user.companyName || '—'} / {user.department || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{user.phone || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`badge ${
                        user.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      {user.enabled ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => void setEnabled(user)}>
                        {user.enabled ? '停用' : '启用'}
                      </button>
                      <details>
                        <summary className="btn-secondary btn-sm cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">编辑</summary>
                        <form
                          className="mt-2 grid gap-2 rounded-lg border border-slate-200 p-3"
                          onSubmit={(event) => void updateUser(event, user)}
                        >
                          <input aria-label="姓名" name="name" className="input" defaultValue={user.name} required maxLength={200} />
                          <input aria-label="邮箱" name="email" type="email" className="input" defaultValue={user.email} required maxLength={320} />
                          <input aria-label="公司名" name="companyName" className="input" defaultValue={user.companyName ?? ''} maxLength={200} />
                          <input aria-label="部门" name="department" className="input" defaultValue={user.department ?? ''} maxLength={200} />
                          <input aria-label="手机号" name="phone" type="tel" className="input" defaultValue={user.phone ?? ''} />
                          <button type="submit" className="btn btn-sm justify-self-start">
                            保存
                          </button>
                        </form>
                      </details>
                      <form className="flex items-center gap-1.5" onSubmit={(event) => void resetPassword(event, user)}>
                        <input
                          aria-label={`重置 ${user.email} 的密码`}
                          name="password"
                          type="password"
                          className="input max-w-[10rem]"
                          minLength={12}
                          placeholder="新临时密码"
                          required
                        />
                        <button type="submit" className="btn-secondary btn-sm">
                          重置密码
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>
            {total === 0
              ? '无用户'
              : `${offset + 1}–${Math.min(offset + users.length, total)} / ${total}`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - LIST_PAGE_SIZE, 0))}
            >
              上一页
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={offset + users.length >= total}
              onClick={() => setOffset(offset + LIST_PAGE_SIZE)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
