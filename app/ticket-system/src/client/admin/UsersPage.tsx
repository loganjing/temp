import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest, toUserMessage } from '../platform/api-client'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS } from '../domain/labels'
import { EmptyState, ErrorBanner, LoadingIndicator, PageHeader, SectionCard, buttonPrimaryClass, buttonSecondaryClass, inputClass, useAutoNotice } from '../components/feedback'
import type { Role } from '../platform/types'

type AdminUser = {
  id: string
  name: string
  email: string
  phone: string | null
  enabled: boolean
  department?: string | null
  role?: string | null
}

const ROLE_OPTIONS: Role[] = ['submitter', 'agent', 'company_admin']
const PAGE_LIMIT = 50

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useAutoNotice()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest<{ users: AdminUser[]; total: number }>(
        `/api/admin/users?search=${encodeURIComponent(search)}&limit=${PAGE_LIMIT}&offset=${offset}`,
      )
      setUsers(result.users)
      setTotal(result.total)
      setError('')
    } catch (cause) {
      setError(toUserMessage(cause, '用户列表加载失败'))
    } finally {
      setLoading(false)
    }
  }, [search, offset])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = async (action: () => Promise<string>) => {
    setBusy(true)
    setError('')
    try {
      setNotice(await action())
      await load()
    } catch (cause) {
      setError(toUserMessage(cause, '操作失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    void runAction(async () => {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ ...body, department: (body.department as string)?.trim() || null, phone: (body.phone as string)?.trim() || null }),
      })
      form.reset()
      return '用户已创建。'
    })
  }

  const updateUser = (event: FormEvent<HTMLFormElement>, target: AdminUser) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    void runAction(async () => {
      await apiRequest(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...body, department: (body.department as string)?.trim() || null, phone: (body.phone as string)?.trim() || null }),
      })
      return `已更新 ${target.email}。`
    })
  }

  const setEnabled = (target: AdminUser) => {
    void runAction(async () => {
      await apiRequest(`/api/admin/users/${encodeURIComponent(target.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !target.enabled }),
      })
      return target.enabled ? `已停用 ${target.email}。` : `已启用 ${target.email}。`
    })
  }

  const resetPassword = (event: FormEvent<HTMLFormElement>, target: AdminUser) => {
    event.preventDefault()
    const form = event.currentTarget
    const password = new FormData(form).get('password')
    form.reset()
    void runAction(async () => {
      await apiRequest(`/api/admin/users/${encodeURIComponent(target.id)}/password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      return `已重置 ${target.email} 的密码。`
    })
  }

  if (!user) return null
  if (user.role !== 'company_admin') {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBanner message="无权访问：用户管理仅公司配置员可用。" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="用户管理" description={`管理 ${user.companyName} 的用户与档案（部门、角色）；新用户将加入本公司。`} />

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} />}

      <SectionCard title="添加用户">
        <form className="grid gap-4 md:grid-cols-3" onSubmit={submitCreate}>
          <label className="text-sm text-slate-600">
            姓名 <span className="text-red-500">*</span>
            <input className={`${inputClass} mt-1.5`} name="name" required maxLength={200} />
          </label>
          <label className="text-sm text-slate-600">
            邮箱 <span className="text-red-500">*</span>
            <input className={`${inputClass} mt-1.5`} name="email" type="email" required maxLength={320} />
          </label>
          <label className="text-sm text-slate-600">
            手机号（可选）
            <input className={`${inputClass} mt-1.5`} name="phone" type="tel" />
          </label>
          <label className="text-sm text-slate-600">
            部门（可选）
            <input className={`${inputClass} mt-1.5`} name="department" maxLength={100} />
          </label>
          <label className="text-sm text-slate-600">
            角色 <span className="text-red-500">*</span>
            <select className={`${inputClass} mt-1.5`} name="role" required defaultValue="submitter">
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            临时密码 <span className="text-red-500">*</span>
            <input className={`${inputClass} mt-1.5`} name="password" type="password" minLength={12} required autoComplete="new-password" />
          </label>
          <div className="md:col-span-3">
            <button type="submit" className={buttonPrimaryClass} disabled={busy}>
              创建用户
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title={`用户（${total}）`}
        actions={
          <label className="text-sm text-slate-600">
            搜索
            <input
              className={`${inputClass} ml-2 inline-block w-56 align-middle`}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value)
                setOffset(0)
              }}
            />
          </label>
        }
      >
        {loading && users.length === 0 && <LoadingIndicator label="加载用户…" />}
        {!loading && users.length === 0 && <EmptyState title="暂无用户" hint={search ? '尝试更换搜索关键字。' : '在上方创建第一个用户。'} />}
        {users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-medium">用户</th>
                  <th className="px-3 py-2.5 font-medium">手机号</th>
                  <th className="px-3 py-2.5 font-medium">部门</th>
                  <th className="px-3 py-2.5 font-medium">角色</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 align-top">
                    <td className="px-3 py-2.5">
                      <span className="block max-w-56 truncate font-medium text-slate-700" title={row.name}>
                        {row.name}
                      </span>
                      <span className="block max-w-56 truncate text-xs text-slate-500" title={row.email}>
                        {row.email}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{row.department || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{(row.role && ROLE_LABELS[row.role as Role]) || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/30' : 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300'
                        }`}
                      >
                        {row.enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1.5">
                        <button type="button" className={buttonSecondaryClass} onClick={() => setEnabled(row)}>
                          {row.enabled ? '停用' : '启用'}
                        </button>
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-700">编辑档案</summary>
                          <form className="mt-2 grid w-64 gap-2" onSubmit={(event) => updateUser(event, row)}>
                            <input aria-label="姓名" name="name" defaultValue={row.name} required maxLength={200} className={inputClass} />
                            <input aria-label="邮箱" name="email" type="email" defaultValue={row.email} required maxLength={320} className={inputClass} />
                            <input aria-label="手机号" name="phone" defaultValue={row.phone ?? ''} className={inputClass} />
                            <input aria-label="部门" name="department" defaultValue={row.department ?? ''} maxLength={100} className={inputClass} />
                            <select aria-label="角色" name="role" defaultValue={row.role ?? 'submitter'} className={inputClass}>
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {ROLE_LABELS[option]}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className={buttonSecondaryClass}>
                              保存
                            </button>
                          </form>
                        </details>
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-700">重置密码</summary>
                          <form className="mt-2 grid w-64 gap-2" onSubmit={(event) => resetPassword(event, row)}>
                            <input aria-label="新密码" name="password" type="password" minLength={12} required autoComplete="new-password" className={inputClass} />
                            <button type="submit" className={buttonSecondaryClass}>
                              重置密码
                            </button>
                          </form>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{total === 0 ? '共 0 条' : `第 ${offset + 1}–${Math.min(offset + users.length, total)} 条，共 ${total} 条`}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={buttonSecondaryClass} disabled={offset === 0} onClick={() => setOffset(Math.max(offset - PAGE_LIMIT, 0))}>
              上一页
            </button>
            <button type="button" className={buttonSecondaryClass} disabled={offset + users.length >= total} onClick={() => setOffset(offset + PAGE_LIMIT)}>
              下一页
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
