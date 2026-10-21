// 配置页：业务组与成员、分类→业务组分配规则、用户组织档案（公司配置管理员维护本公司）。
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { apiCreateGroup, apiCreateRule, apiListCategories, apiListGroups, apiListRules, apiListUsers, apiSetGroupMembers, apiSetUserOrg } from './api'
import type { Category, Group, Rule, UserDirectoryEntry } from './contracts'
import { apiErrorMessage, Badge, EmptyState, ErrorBanner, ListSkeleton, SuccessBanner } from './shared'
import { useAuth } from './auth'

type ConfigTab = 'groups' | 'rules' | 'org'

export function ConfigPage() {
  const { me } = useAuth()
  const [tab, setTab] = useState<ConfigTab>('groups')
  const org = me?.org

  if (org == null || !org.isCompanyAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title="需要公司配置管理员身份"
          description="业务组、成员、分类分配规则与用户组织档案仅限本公司配置管理员维护；权限由服务端最终判定。"
        />
      </div>
    )
  }

  const tabs: { id: ConfigTab; label: string }[] = [
    { id: 'groups', label: '业务组与成员' },
    { id: 'rules', label: '分类分配规则' },
    { id: 'org', label: '用户组织档案' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">配置 · {org.companyName}</h1>
        <p className="text-xs text-slate-500">维护本公司业务组、成员、分类自动分配规则与用户组织档案。</p>
      </header>
      <nav className="flex gap-1 rounded-lg border border-slate-300 bg-white p-1" role="tablist" aria-label="配置分类">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`config-tab ${tab === item.id ? 'config-tab-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'groups' && <GroupsTab companyId={org.companyId} />}
      {tab === 'rules' && <RulesTab companyId={org.companyId} />}
      {tab === 'org' && <UserOrgTab companyId={org.companyId} />}
    </div>
  )
}

function GroupsTab({ companyId }: { companyId: number }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<UserDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [memberSelection, setMemberSelection] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [groupList, userList] = await Promise.all([apiListGroups(companyId), apiListUsers(companyId)])
      setGroups(groupList)
      setUsers(userList)
    } catch (cause) {
      setError(apiErrorMessage(cause, '业务组数据加载失败'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    void (async () => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        await apiCreateGroup(companyId, trimmed)
        setName('')
        setMessage('业务组已创建，请在下方设置成员。')
        await load()
      } catch (cause) {
        setError(apiErrorMessage(cause, '业务组创建失败'))
      } finally {
        setBusy(false)
      }
    })()
  }

  const startEdit = (group: Group) => {
    setEditingId(group.id)
    setMemberSelection(group.members.map((member) => member.userId))
  }

  const saveMembers = (group: Group) => {
    void (async () => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        await apiSetGroupMembers(group.id, memberSelection)
        setEditingId(null)
        setMessage(`已更新业务组“${group.name}”的成员。`)
        await load()
      } catch (cause) {
        setError(apiErrorMessage(cause, '成员更新失败'))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="section-title">新建业务组</h2>
        <form className="flex items-end gap-3" onSubmit={create}>
          <label className="label min-w-56">
            业务组名称（1-100 字）
            <input className="input" value={name} onChange={(event) => setName(event.currentTarget.value)} required minLength={1} maxLength={100} placeholder="如：一线支持组" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '创建中…' : '创建业务组'}
          </button>
        </form>
        {error && <div className="mt-3">{<ErrorBanner message={error} />}</div>}
        {message && <div className="mt-3">{<SuccessBanner message={message} />}</div>}
      </section>

      <section className="card">
        <h2 className="section-title">业务组（{groups.length}）</h2>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : groups.length === 0 ? (
          <EmptyState title="暂无业务组" description="创建业务组后，可为分类配置自动分配规则，工单将分配给对应组成员处理。" />
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <article key={group.id} className="rounded-lg border border-slate-200 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                  <button type="button" className="btn btn-secondary h-8" onClick={() => (editingId === group.id ? setEditingId(null) : startEdit(group))}>
                    {editingId === group.id ? '收起成员编辑' : `成员（${group.members.length}）`}
                  </button>
                </div>
                {group.members.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">暂无成员。</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.members.map((member) => (
                      <Badge key={member.userId} tone="blue">
                        {member.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {editingId === group.id && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="mb-2 text-xs text-slate-500">
                      勾选成员后保存将全量替换该组成员（用户可跨公司加入业务组）。
                    </p>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                      {users.map((user) => (
                        <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-slate-300"
                            checked={memberSelection.includes(user.id)}
                            onChange={(event) =>
                              setMemberSelection((selection) =>
                                event.currentTarget.checked
                                  ? [...selection, user.id]
                                  : selection.filter((userId) => userId !== user.id),
                              )
                            }
                          />
                          <span className="min-w-0 truncate" title={`${user.name} · ${user.email}`}>
                            {user.name}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-slate-400">
                            {user.org ? `${user.org.companyName} · ${user.org.department}` : '未设置组织档案'}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => saveMembers(group)}>
                        {busy ? '保存中…' : '保存成员'}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function RulesTab({ companyId }: { companyId: number }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ruleList, categoryList, groupList] = await Promise.all([
        apiListRules(companyId),
        apiListCategories(),
        apiListGroups(companyId),
      ])
      setRules(ruleList)
      setCategories(categoryList)
      setGroups(groupList)
    } catch (cause) {
      setError(apiErrorMessage(cause, '分配规则数据加载失败'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoryId || !groupId) return
    void (async () => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        await apiCreateRule(companyId, Number(categoryId), Number(groupId))
        setCategoryId('')
        setGroupId('')
        setMessage('分配规则已创建，该分类的新工单将自动分配到对应业务组。')
        await load()
      } catch (cause) {
        setError(apiErrorMessage(cause, '分配规则创建失败'))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="section-title">新建分类自动分配规则</h2>
        <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
          <label className="label min-w-44">
            问题分类
            <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)} required>
              <option value="" disabled>
                请选择分类
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-2.5 text-slate-400">→</span>
          <label className="label min-w-44">
            业务组
            <select className="input" value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)} required>
              <option value="" disabled>
                请选择业务组
              </option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !categoryId || !groupId}>
            {busy ? '创建中…' : '创建规则'}
          </button>
        </form>
        {error && <div className="mt-3">{<ErrorBanner message={error} />}</div>}
        {message && <div className="mt-3">{<SuccessBanner message={message} />}</div>}
      </section>

      <section className="card">
        <h2 className="section-title">分配规则（{rules.length}）</h2>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : rules.length === 0 ? (
          <EmptyState title="暂无分配规则" description="配置“分类 → 业务组”后，新工单将按分类自动进入待处理。" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>问题分类</th>
                  <th>分配到业务组</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.category.name}</td>
                    <td>{rule.group.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function UserOrgTab({ companyId }: { companyId: number }) {
  const [users, setUsers] = useState<UserDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [department, setDepartment] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await apiListUsers(companyId))
    } catch (cause) {
      setError(apiErrorMessage(cause, '用户目录加载失败'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const startEdit = (user: UserDirectoryEntry) => {
    setEditingId(user.id)
    setDepartment(user.org?.department ?? '')
    setIsAdmin(user.org?.isCompanyAdmin ?? false)
  }

  const save = (user: UserDirectoryEntry) => {
    const trimmed = department.trim()
    if (!trimmed) return
    void (async () => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        await apiSetUserOrg(user.id, { companyId, department: trimmed, isCompanyAdmin: isAdmin })
        setEditingId(null)
        setMessage(`已更新 ${user.name} 的组织档案。`)
        await load()
      } catch (cause) {
        setError(apiErrorMessage(cause, '组织档案更新失败'))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {message && <SuccessBanner message={message} />}
      <section className="card">
        <h2 className="section-title">用户目录（{users.length}）</h2>
        <p className="mb-3 text-xs text-slate-500">
          为账户设置公司、部门与公司管理员标记；设置组织档案后，用户即可作为提交人创建工单。
        </p>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : users.length === 0 ? (
          <EmptyState title="暂无账户" description="可在“用户管理”页创建账户后，回到此处设置组织档案。" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>当前组织档案</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong title={user.name}>{user.name}</strong>
                      <span className="subtext" title={user.email}>
                        {user.email}
                      </span>
                    </td>
                    <td className="text-sm text-slate-600">
                      {user.org ? (
                        <span>
                          {user.org.companyName} · {user.org.department}
                          {user.org.isCompanyAdmin ? <Badge tone="amber">公司管理员</Badge> : null}
                        </span>
                      ) : (
                        <span className="text-slate-400">未设置</span>
                      )}
                    </td>
                    <td>
                      {editingId === user.id ? (
                        <div className="stack">
                          <label className="label">
                            部门（1-100 字）
                            <input className="input" value={department} onChange={(event) => setDepartment(event.currentTarget.value)} maxLength={100} />
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-slate-300"
                              checked={isAdmin}
                              onChange={(event) => setIsAdmin(event.currentTarget.checked)}
                            />
                            设为公司配置管理员
                          </label>
                          <div className="flex gap-2">
                            <button type="button" className="btn btn-primary" disabled={busy || !department.trim()} onClick={() => save(user)}>
                              {busy ? '保存中…' : '保存档案'}
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-secondary h-8" onClick={() => startEdit(user)}>
                          {user.org ? '编辑档案' : '设置档案'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
