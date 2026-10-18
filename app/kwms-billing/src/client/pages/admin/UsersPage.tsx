import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, Modal, PageHeader, Pagination, StatusBadge, statusTone } from '../../components/ui'
import { CheckField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { ROLE_LABELS, USER_STATUS_LABELS, labelOf } from '../../labels'
import type { ManagedUser, Paged, RoleRef } from '../../types'

const PAGE_SIZE = 20

// 用户与角色管理：复用 starter 用户管理页形态，按技术契约第 12 节承载 /api/users 用户管理与角色权限配置（role:config）。
export default function UsersPage() {
  const { can, user: current } = useSession()
  const [rows, setRows] = useState<ManagedUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ username: '', password: '', name: '', roles: [] as string[], orgId: '' })
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})

  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [editForm, setEditForm] = useState({ name: '', roles: [] as string[], orgId: '', status: 'active' })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const roles = useOptionList<RoleRef>('/api/admin/roles', (item) => labelOf(ROLE_LABELS, item.key) === item.key ? item.name : labelOf(ROLE_LABELS, item.key))

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await apiRequest<Paged<ManagedUser>>(`/api/users?page=${page}&pageSize=${PAGE_SIZE}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '用户列表加载失败'))
    }
  }, [page])

  useEffect(() => { void load() }, [load])

  const roleOptions = roles.items.map((role) => ({
    value: role.key,
    label: ROLE_LABELS[role.key] ?? role.name,
  }))

  const openCreate = () => {
    setCreateForm({ username: '', password: '', name: '', roles: [], orgId: '' })
    setCreateErrors({})
    setCreateOpen(true)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!createForm.username.trim()) errors.username = '用户名为必填项'
    else if (!createForm.username.trim().includes('@')) errors.username = '用户名必须为邮箱格式'
    if (!createForm.password) errors.password = '密码为必填项'
    else if (createForm.password.length < 12) errors.password = '密码长度至少 12 位'
    if (!createForm.name.trim()) errors.name = '姓名为必填项'
    if (!createForm.orgId) errors.orgId = '所属组织为必填项'
    setCreateErrors(errors)
    if (Object.keys(errors).length > 0) return
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: createForm.username.trim(),
          password: createForm.password,
          name: createForm.name.trim(),
          roles: createForm.roles,
          orgId: createForm.orgId,
        }),
      })
      setCreateOpen(false)
      setNotice('用户已创建。')
      await load()
    } catch (cause) {
      setError(errorText(cause, '用户创建失败'))
      setCreateOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (target: ManagedUser) => {
    setEditing(target)
    setEditForm({ name: target.name, roles: [...target.roles], orgId: target.orgId ?? '', status: target.status })
    setEditErrors({})
  }

  const submitEdit = async () => {
    if (!editing) return
    const errors: Record<string, string> = {}
    if (!editForm.name.trim()) errors.name = '姓名为必填项'
    setEditErrors(errors)
    if (Object.keys(errors).length > 0) return
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/users/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name.trim(),
          roles: editForm.roles,
          orgId: editForm.orgId || null,
          status: editForm.status,
        }),
      })
      setEditing(null)
      setNotice('用户信息已更新。')
      await load()
    } catch (cause) {
      setError(errorText(cause, '用户更新失败'))
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  const orgName = (orgId: string | null) =>
    orgId ? String(orgs.items.find((item) => item.id === orgId)?.name ?? orgId) : '未绑定组织'

  return (
    <div className="section-gap">
      <PageHeader
        title="用户与角色"
        description="管理本地用户、角色绑定与组织归属；quote:audit / adjustment:audit 等审核权限可经角色配置授予（审核角色）。"
        actions={<button type="button" className="btn" onClick={openCreate}>新增用户</button>}
      />
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>姓名</th>
                <th>角色</th>
                <th>所属组织</th>
                <th>状态</th>
                <th style={{ width: 90 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((item) => (
                <tr key={item.id}>
                  <td title={item.username}>{item.username}</td>
                  <td>{item.name}</td>
                  <td>
                    <span className="cell-ellipsis" style={{ maxWidth: 200 }} title={item.roles.map((role) => labelOf(ROLE_LABELS, role)).join('、')}>
                      {item.roles.map((role) => labelOf(ROLE_LABELS, role)).join('、') || '—'}
                    </span>
                  </td>
                  <td>{orgName(item.orgId)}</td>
                  <td><StatusBadge label={labelOf(USER_STATUS_LABELS, item.status)} tone={statusTone(item.status)} /></td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} disabled={item.id === current?.id && editForm.status === 'disabled'}>编辑</button>
                  </td>
                </tr>
              ))}
              {rows === null && (
                <tr><td colSpan={6}><div className="skeleton" style={{ width: '60%' }} /></td></tr>
              )}
              {rows !== null && rows.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>暂无用户</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>

      <Modal
        open={createOpen}
        title="新增用户"
        onClose={() => setCreateOpen(false)}
        width={520}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)} disabled={busy}>取消</button>
            <button type="button" className="btn" onClick={() => void submitCreate({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>)} disabled={busy}>{busy ? '创建中…' : '创建'}</button>
          </>
        }
      >
        <form className="stack" onSubmit={(event) => void submitCreate(event)}>
          <label className="field">
            <span className="field-label">用户名（邮箱）<span className="required">*</span></span>
            <input className="input" maxLength={320} value={createForm.username} placeholder="例如 ops2@kwms.local" onChange={(event) => setCreateForm((cur) => ({ ...cur, username: event.currentTarget.value }))} />
            {createErrors.username && <span className="field-error">{createErrors.username}</span>}
          </label>
          <label className="field">
            <span className="field-label">初始密码<span className="required">*</span></span>
            <input className="input" type="password" minLength={12} maxLength={256} value={createForm.password} onChange={(event) => setCreateForm((cur) => ({ ...cur, password: event.currentTarget.value }))} />
            {createErrors.password && <span className="field-error">{createErrors.password}</span>}
            <span className="field-hint">长度至少 12 位。</span>
          </label>
          <label className="field">
            <span className="field-label">姓名<span className="required">*</span></span>
            <input className="input" maxLength={200} value={createForm.name} onChange={(event) => setCreateForm((cur) => ({ ...cur, name: event.currentTarget.value }))} />
            {createErrors.name && <span className="field-error">{createErrors.name}</span>}
          </label>
          <div className="field">
            <span className="field-label">角色（可多选）</span>
            <div className="roles-box">
              {roleOptions.map((role) => (
                <CheckField
                  key={role.value}
                  label={role.label}
                  checked={createForm.roles.includes(role.value)}
                  onChange={(checked) => setCreateForm((cur) => ({
                    ...cur,
                    roles: checked ? [...cur.roles, role.value] : cur.roles.filter((key) => key !== role.value),
                  }))}
                />
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">所属组织<span className="required">*</span></span>
            <select className="select" value={createForm.orgId} onChange={(event) => setCreateForm((cur) => ({ ...cur, orgId: event.currentTarget.value }))}>
              <option value="">请选择</option>
              {orgs.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {createErrors.orgId && <span className="field-error">{createErrors.orgId}</span>}
          </label>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        title={`编辑用户 ${editing?.username ?? ''}`}
        onClose={() => setEditing(null)}
        width={520}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={busy}>取消</button>
            <button type="button" className="btn" onClick={() => void submitEdit()} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
          </>
        }
      >
        {editing && (
          <div className="stack">
            {can('role:config') ? (
              <div className="field">
                <span className="field-label">角色（角色权限配置入口）</span>
                <div className="roles-box">
                  {roleOptions.map((role) => (
                    <CheckField
                      key={role.value}
                      label={role.label}
                      checked={editForm.roles.includes(role.value)}
                      onChange={(checked) => setEditForm((cur) => ({
                        ...cur,
                        roles: checked ? [...cur.roles, role.value] : cur.roles.filter((key) => key !== role.value),
                      }))}
                    />
                  ))}
                </div>
                <span className="field-hint">修改角色绑定需要「角色与数据权限配置」权限（系统管理员具备）。</span>
              </div>
            ) : (
              <div className="kv"><span className="kv-label">角色（只读，需权限）</span><span className="kv-value">{editing.roles.map((role) => labelOf(ROLE_LABELS, role)).join('、') || '—'}</span></div>
            )}
            <label className="field">
              <span className="field-label">姓名<span className="required">*</span></span>
              <input className="input" maxLength={200} value={editForm.name} onChange={(event) => setEditForm((cur) => ({ ...cur, name: event.currentTarget.value }))} />
              {editErrors.name && <span className="field-error">{editErrors.name}</span>}
            </label>
            <label className="field">
              <span className="field-label">所属组织</span>
              <select className="select" value={editForm.orgId} onChange={(event) => setEditForm((cur) => ({ ...cur, orgId: event.currentTarget.value }))}>
                <option value="">未绑定组织</option>
                {orgs.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">状态</span>
              <select className="select" value={editForm.status} onChange={(event) => setEditForm((cur) => ({ ...cur, status: event.currentTarget.value }))}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
