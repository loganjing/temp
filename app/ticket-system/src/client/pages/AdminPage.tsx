import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getCompanies, createCompany, getDepartments, createDepartment,
  getCategories, createCategory,
  getGroups, createGroup, getMembers, addMember, removeMember,
  getAssignmentRules, createAssignmentRule,
  getUsers, setUserCompany,
} from '../platform/ticket-api'
import type { Company, Department, Category, BusinessGroup, GroupMember, AssignmentRule, AdminUser } from '../types'
import UsersPage from '../admin/UsersPage'
import { Skeleton, EmptyState, ErrorState } from '../components/Feedback'
import { useToast } from '../components/Toast'

type Tab = 'companies' | 'categories' | 'groups' | 'rules' | 'users'

export default function AdminPage() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('companies')

  // Companies & departments
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')

  // Categories
  const [categories, setCategories] = useState<Category[]>([])

  // Groups
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [members, setMembers] = useState<GroupMember[]>([])

  // Rules
  const [rules, setRules] = useState<AssignmentRule[]>([])

  // Users for member selection
  const [allUsers, setAllUsers] = useState<AdminUser[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadCompanies = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCompanies()
      setCompanies(result.companies)
      if (result.companies.length > 0 && !selectedCompany) {
        setSelectedCompany(result.companies[0].id)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') }
    finally { setLoading(false) }
  }, [selectedCompany])

  useEffect(() => { void loadCompanies() }, [loadCompanies])

  const loadCompanyData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    setError('')
    try {
      const [deptRes, catRes, groupRes, ruleRes] = await Promise.all([
        getDepartments(selectedCompany),
        getCategories(selectedCompany),
        getGroups(selectedCompany),
        getAssignmentRules(selectedCompany),
      ])
      setDepartments(deptRes.departments)
      setCategories(catRes.categories)
      setGroups(groupRes.groups)
      setRules(ruleRes.rules)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') }
    finally { setLoading(false) }
  }, [selectedCompany])

  useEffect(() => { void loadCompanyData() }, [loadCompanyData])

  const loadMembers = useCallback(async () => {
    if (!selectedGroup) return
    try {
      const result = await getMembers(selectedGroup)
      setMembers(result.members)
    } catch { /* ignore */ }
  }, [selectedGroup])

  useEffect(() => { void loadMembers() }, [loadMembers])

  const loadUsers = useCallback(async () => {
    try { const result = await getUsers({ limit: 100 }); setAllUsers(result.users) } catch { /* ignore */ }
  }, [])

  useEffect(() => { if (tab === 'groups') void loadUsers() }, [tab, loadUsers])

  // ── Create handlers ──
  const handleCreateCompany = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await createCompany({ name: body.name as string })
      form.reset()
      toast('公司已创建')
      await loadCompanies()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  const handleCreateDept = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await createDepartment(selectedCompany, { name: body.name as string })
      form.reset()
      toast('部门已创建')
      await loadCompanyData()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  const handleCreateCategory = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await createCategory(selectedCompany, { name: body.name as string })
      form.reset()
      toast('分类已创建')
      await loadCompanyData()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  const handleCreateGroup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await createGroup(selectedCompany, { name: body.name as string })
      form.reset()
      toast('业务组已创建')
      await loadCompanyData()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  const handleAddMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await addMember(selectedGroup, { user_id: body.user_id as string })
      form.reset()
      toast('成员已添加')
      await loadMembers()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '添加失败') }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMember(selectedGroup, userId)
      toast('成员已移除')
      await loadMembers()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '移除失败') }
  }

  const handleCreateRule = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await createAssignmentRule(selectedCompany, {
        category_id: body.category_id as string,
        target_group_id: body.target_group_id as string,
      })
      form.reset()
      toast('分配规则已创建')
      await loadCompanyData()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  const handleSetUserCompany = async (userId: string, companyId: string | null) => {
    try {
      await setUserCompany(userId, { company_id: companyId })
      toast('用户公司已更新')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '更新失败') }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'companies', label: '公司/部门' },
    { key: 'categories', label: '分类' },
    { key: 'groups', label: '业务组' },
    { key: 'rules', label: '分配规则' },
    { key: 'users', label: '用户' },
  ]

  return (
    <div className="stack">
      <div className="section-heading">
        <h2>管理配置</h2>
        {companies.length > 0 && tab !== 'users' && (
          <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {tab === 'companies' && (
        <div className="stack">
          <section className="card">
            <h3 style={{ marginTop: 0 }}>创建公司</h3>
            <form className="form-grid" onSubmit={(e) => void handleCreateCompany(e)}>
              <label>公司名称<input name="name" required maxLength={200} /></label>
              <button>创建</button>
            </form>
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>公司列表</h3>
            {companies.length === 0 ? <EmptyState title="暂无公司" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>名称</th><th>创建时间</th></tr></thead>
                <tbody>{companies.map((c) => <tr key={c.id}><td>{c.name}</td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>部门管理</h3>
            <form className="form-grid" onSubmit={(e) => void handleCreateDept(e)}>
              <label>部门名称<input name="name" required maxLength={200} /></label>
              <button>创建部门</button>
            </form>
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>部门列表 ({departments.length})</h3>
            {loading ? <Skeleton lines={3} /> : departments.length === 0 ? <EmptyState title="暂无部门" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>名称</th><th>创建时间</th></tr></thead>
                <tbody>{departments.map((d) => <tr key={d.id}><td>{d.name}</td><td>{new Date(d.created_at).toLocaleDateString()}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      )}

      {tab === 'categories' && (
        <div className="stack">
          <section className="card">
            <h3 style={{ marginTop: 0 }}>创建分类</h3>
            <form className="form-grid" onSubmit={(e) => void handleCreateCategory(e)}>
              <label>分类名称<input name="name" required maxLength={200} /></label>
              <button>创建</button>
            </form>
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>分类列表 ({categories.length})</h3>
            {loading ? <Skeleton lines={3} /> : categories.length === 0 ? <EmptyState title="暂无分类" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>名称</th><th>创建时间</th></tr></thead>
                <tbody>{categories.map((c) => <tr key={c.id}><td>{c.name}</td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      )}

      {tab === 'groups' && (
        <div className="stack">
          <section className="card">
            <h3 style={{ marginTop: 0 }}>创建业务组</h3>
            <form className="form-grid" onSubmit={(e) => void handleCreateGroup(e)}>
              <label>组名<input name="name" required maxLength={200} /></label>
              <button>创建</button>
            </form>
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>业务组列表 ({groups.length})</h3>
            {loading ? <Skeleton lines={3} /> : groups.length === 0 ? <EmptyState title="暂无业务组" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>组名</th><th>创建时间</th><th>操作</th></tr></thead>
                <tbody>{groups.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td>{new Date(g.created_at).toLocaleDateString()}</td>
                    <td><button className={`secondary${selectedGroup === g.id ? '' : ' ghost'}`} onClick={() => setSelectedGroup(g.id)}>管理成员</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          {selectedGroup && (
            <section className="card">
              <h3 style={{ marginTop: 0 }}>成员管理</h3>
              <form className="form-grid" onSubmit={(e) => void handleAddMember(e)}>
                <label>添加用户
                  <select name="user_id" required>
                    <option value="">选择用户…</option>
                    {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                </label>
                <button>添加成员</button>
              </form>
              <div style={{ marginTop: '1rem' }}>
                {members.length === 0 ? <EmptyState title="暂无成员" /> : (
                  <div className="table-scroll"><table>
                    <thead><tr><th>用户</th><th>邮箱</th><th>操作</th></tr></thead>
                    <tbody>{members.map((m) => (
                      <tr key={m.user_id}>
                        <td>{m.name}</td>
                        <td className="subtext">{m.email}</td>
                        <td><button className="danger ghost" onClick={() => void handleRemoveMember(m.user_id)}>移除</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="stack">
          <section className="card">
            <h3 style={{ marginTop: 0 }}>创建分配规则</h3>
            <form className="form-grid" onSubmit={(e) => void handleCreateRule(e)}>
              <label>分类
                <select name="category_id" required>
                  <option value="">选择分类…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>目标业务组
                <select name="target_group_id" required>
                  <option value="">选择业务组…</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <button>创建规则</button>
            </form>
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>分配规则列表 ({rules.length})</h3>
            {loading ? <Skeleton lines={3} /> : rules.length === 0 ? <EmptyState title="暂无规则" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>分类</th><th>目标业务组</th><th>创建时间</th></tr></thead>
                <tbody>{rules.map((r) => (
                  <tr key={r.id}><td>{r.category_name}</td><td>{r.target_group_name}</td><td>{new Date(r.created_at).toLocaleDateString()}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </div>
      )}

      {tab === 'users' && <UsersPage onSetCompany={handleSetUserCompany} companies={companies} />}
    </div>
  )
}
