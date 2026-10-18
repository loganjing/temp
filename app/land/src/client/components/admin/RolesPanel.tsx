import { useState, type FormEvent } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { Card, EmptyState, ErrorBox, Loading, useResource } from '../ui'

type RoleRow = { id: string; code: string; name: string; permissionCodes: string[] }

/** 服务端已注册的封闭权限码表（authorization.ts businessPermissions 的镜像，供勾选）。 */
const PERMISSION_CODES = [
  'parcels:read', 'parcels:write', 'parcel-profile:write', 'market:write', 'quick-assessments:write',
  'plans:read', 'plans:write', 'plans:copy', 'plans:formalize', 'plans:costs:write',
  'submissions:create', 'submissions:approve', 'dashboards:read', 'handoff:read',
  'users:manage', 'roles:manage', 'parameters:manage', 'audit:read',
] as const

const PERMISSION_LABELS: Record<string, string> = {
  'parcels:read': '查看地块',
  'parcels:write': '新建/编辑地块、附件、地图',
  'parcel-profile:write': '维护地块档案',
  'market:write': '维护市场资料',
  'quick-assessments:write': '快评录入与试算',
  'plans:read': '查看方案与分析',
  'plans:write': '编辑本人方案',
  'plans:copy': '复制派生方案',
  'plans:formalize': '正式化本人方案',
  'plans:costs:write': '维护成本与公共池',
  'submissions:create': '提交审批',
  'submissions:approve': '通过/退回审批',
  'dashboards:read': '查看管理层看板',
  'handoff:read': '查看交接包',
  'users:manage': '用户管理',
  'roles:manage': '角色权限管理',
  'parameters:manage': '发布参数版本',
  'audit:read': '查看审计事件',
}

/** 角色权限面板：查看角色与其权限码，创建新角色（权限码须在已注册集合内）。 */
export default function RolesPanel() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const roles = useResource<{ items: RoleRow[] }>(() => apiRequest('/api/roles'), [])

  const createRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const code = String(data.get('code') ?? '').trim()
    const name = String(data.get('name') ?? '').trim()
    if (code === '' || name === '') return
    const permissionCodes = PERMISSION_CODES.filter((code) => data.get(`perm-${code}`) === 'on')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest('/api/roles', { method: 'POST', body: JSON.stringify({ code, name, permissionCodes }) })
      form.reset()
      setNotice(`角色 ${code} 已创建。`)
      roles.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <Card title="创建角色">
        <form className="stack" onSubmit={(event) => void createRole(event)}>
          <div className="form-grid">
            <label>角色代码 *<input name="code" required maxLength={60} placeholder="如 analyst" /></label>
            <label>角色名称 *<input name="name" required maxLength={100} /></label>
          </div>
          <div className="roles">
            {PERMISSION_CODES.map((code) => (
              <label key={code} className="role-check" title={code}>
                <input type="checkbox" name={`perm-${code}`} />
                {PERMISSION_LABELS[code]}
              </label>
            ))}
          </div>
          <button disabled={busy}>{busy ? '创建中…' : '创建角色'}</button>
        </form>
      </Card>

      <Card title={`角色列表（${roles.data?.items.length ?? 0}）`}>
        {roles.busy && !roles.data && <Loading />}
        <ErrorBox cause={roles.error} />
        {roles.data && roles.data.items.length === 0 && <EmptyState text="暂无角色。" />}
        {roles.data && roles.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>角色</th><th>代码</th><th>权限</th></tr></thead>
              <tbody>
                {roles.data.items.map((role) => (
                  <tr key={role.id}>
                    <td><strong>{role.name}</strong></td>
                    <td className="mono">{role.code}</td>
                    <td>
                      {role.permissionCodes.length === 0 ? '—' : (
                        <div className="chips">
                          {role.permissionCodes.map((code) => (
                            <span key={code} className="badge badge-neutral" title={code}>{PERMISSION_LABELS[code] ?? code}</span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
