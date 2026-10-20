import { useState, type FormEvent } from 'react'
import { apiRequest, toUserMessage } from '../platform/api-client'
import { createCategory, createGroup, deleteCategory, deleteCategoryRule, deleteGroup, listCategories, listCategoryRules, listGroups, saveCategoryRule, updateGroupMembers } from '../api/admin'
import { useAuth } from '../auth/AuthContext'
import { useResource } from '../hooks/useResource'
import { EmptyState, ErrorBanner, LoadingIndicator, PageHeader, SectionCard, buttonDangerClass, buttonPrimaryClass, buttonSecondaryClass, inputClass, useAutoNotice } from '../components/feedback'

type CompanyUser = { id: string; name: string }

export default function GroupsPage() {
  const { user } = useAuth()
  const [notice, setNotice] = useAutoNotice()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroupId, setRuleGroupId] = useState('')
  const [memberEditing, setMemberEditing] = useState<number | null>(null)
  const [memberSelection, setMemberSelection] = useState<string[]>([])
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')

  const groups = useResource(() => listGroups(), '业务组加载失败')
  const categories = useResource(() => listCategories(), '分类清单加载失败')
  const rules = useResource(() => listCategoryRules(), '分配规则加载失败')

  const runAction = async (action: () => Promise<string>) => {
    setBusy(true)
    setError('')
    try {
      setNotice(await action())
    } catch (cause) {
      setError(toUserMessage(cause, '操作失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  const submitGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAction(async () => {
      await createGroup(groupName.trim())
      setGroupName('')
      void groups.reload()
      return '业务组已创建。'
    })
  }

  const submitCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAction(async () => {
      await createCategory(categoryName.trim())
      setCategoryName('')
      void categories.reload()
      return '分类已添加。'
    })
  }

  const submitRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ruleCategory || !ruleGroupId) {
      setError('请选择分类与目标业务组')
      return
    }
    void runAction(async () => {
      await saveCategoryRule(ruleCategory, Number(ruleGroupId))
      setRuleCategory('')
      setRuleGroupId('')
      void rules.reload()
      return '分配规则已保存。'
    })
  }

  const openMemberEditor = async (groupId: number) => {
    const group = groups.data?.items.find((item) => item.id === groupId)
    if (!group) return
    setMemberEditing(groupId)
    setMemberSelection(group.members.map((member) => member.userId))
    setUsersError('')
    setUsersLoading(true)
    try {
      const result = await apiRequest<{ users: CompanyUser[]; total: number }>('/api/admin/users?limit=100&offset=0')
      setCompanyUsers(result.users)
    } catch (cause) {
      setUsersError(toUserMessage(cause, '用户列表加载失败'))
    } finally {
      setUsersLoading(false)
    }
  }

  const saveMembers = () => {
    if (memberEditing === null) return
    void runAction(async () => {
      await updateGroupMembers(memberEditing, memberSelection)
      setMemberEditing(null)
      void groups.reload()
      return '业务组成员已更新。'
    })
  }

  if (!user) return null
  if (user.role !== 'company_admin') {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBanner message="无权访问：业务组配置仅公司配置员可用。" />
      </div>
    )
  }

  const unruledCategories = categories.data?.items.filter((category) => !rules.data?.items.some((rule) => rule.category === category)) ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="业务组配置" description={`管理 ${user.companyName} 的业务组、成员、问题分类与「分类→业务组」自动分配规则。`} />

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} />}

      <SectionCard title={`业务组（${groups.data?.items.length ?? 0}）`}>
        {groups.loading && <LoadingIndicator label="加载业务组…" />}
        {groups.error && <ErrorBanner message={groups.error} />}
        {groups.data && groups.data.items.length === 0 && <EmptyState title="暂无业务组" hint="为公司在下方创建第一个业务组。" />}
        {groups.data && groups.data.items.length > 0 && (
          <ul className="space-y-2.5">
            {groups.data.items.map((group) => (
              <li key={group.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{group.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      成员 {group.memberCount} 人
                      {group.members.length > 0 && `：${group.members.map((member) => member.displayName).join('、')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={buttonSecondaryClass}
                      onClick={() => (memberEditing === group.id ? setMemberEditing(null) : void openMemberEditor(group.id))}
                    >
                      {memberEditing === group.id ? '收起' : '设置成员'}
                    </button>
                    <button
                      type="button"
                      className={buttonDangerClass}
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          await deleteGroup(group.id)
                          void groups.reload()
                          void rules.reload()
                          return `业务组「${group.name}」已删除。`
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>
                {memberEditing === group.id && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-3">
                    {usersLoading && <p className="text-xs text-slate-500">加载公司用户…</p>}
                    {usersError && <ErrorBanner message={usersError} />}
                    {!usersLoading && !usersError && (
                      <>
                        {companyUsers.length === 0 ? (
                          <p className="text-xs text-slate-500">暂无可选用户，请先在用户管理中创建用户。</p>
                        ) : (
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {companyUsers.map((candidate) => (
                              <label key={candidate.id} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                                  checked={memberSelection.includes(candidate.id)}
                                  onChange={() =>
                                    setMemberSelection((previous) =>
                                      previous.includes(candidate.id) ? previous.filter((id) => id !== candidate.id) : [...previous, candidate.id],
                                    )
                                  }
                                />
                                {candidate.name}
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <button type="button" className={buttonPrimaryClass} disabled={busy} onClick={saveMembers}>
                            保存成员
                          </button>
                          <button type="button" className={buttonSecondaryClass} onClick={() => setMemberEditing(null)}>
                            取消
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4" onSubmit={submitGroup}>
          <label className="min-w-56 flex-1 text-sm text-slate-600">
            新建业务组名称
            <input className={`${inputClass} mt-1.5`} value={groupName} required maxLength={100} placeholder="如：技术支持组" onChange={(event) => setGroupName(event.currentTarget.value)} />
          </label>
          <button type="submit" className={buttonPrimaryClass} disabled={busy || !groupName.trim()}>
            创建业务组
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`问题分类（${categories.data?.items.length ?? 0}）`}>
        {categories.loading && <LoadingIndicator label="加载分类…" />}
        {categories.error && <ErrorBanner message={categories.error} />}
        {categories.data && categories.data.items.length === 0 && <EmptyState title="暂无分类" hint="工单创建时需要分类清单，请先添加。" />}
        {categories.data && categories.data.items.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {categories.data.items.map((category) => {
              const inUse = rules.data?.items.some((rule) => rule.category === category) ?? false
              return (
                <li key={category} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-slate-700">
                  {category}
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title={inUse ? '仍被分配规则引用，需先删除规则' : '删除分类'}
                    disabled={busy}
                    onClick={() =>
                      void runAction(async () => {
                        await deleteCategory(category)
                        void categories.reload()
                        return `分类「${category}」已删除。`
                      })
                    }
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4" onSubmit={submitCategory}>
          <label className="min-w-56 flex-1 text-sm text-slate-600">
            新增分类名称
            <input className={`${inputClass} mt-1.5`} value={categoryName} required maxLength={50} placeholder="如：故障报修" onChange={(event) => setCategoryName(event.currentTarget.value)} />
          </label>
          <button type="submit" className={buttonPrimaryClass} disabled={busy || !categoryName.trim()}>
            添加分类
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`自动分配规则（${rules.data?.items.length ?? 0}）`}>
        <p className="mb-3 text-xs text-slate-400">规则命中时，新建工单将按分类自动归属到对应业务组并进入待处理；未命中时保持待分配，可人工转派归属。</p>
        {rules.loading && <LoadingIndicator label="加载规则…" />}
        {rules.error && <ErrorBanner message={rules.error} />}
        {rules.data && rules.data.items.length === 0 && <EmptyState title="暂无分配规则" hint="在下方配置分类到业务组的自动分配规则。" />}
        {rules.data && rules.data.items.length > 0 && (
          <ul className="space-y-2">
            {rules.data.items.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-700">
                  <span className="font-medium text-slate-800">{rule.category}</span>
                  <span className="mx-2 text-slate-300">→</span>
                  {rule.groupName}
                </span>
                <button
                  type="button"
                  className={buttonDangerClass}
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      await deleteCategoryRule(rule.category)
                      void rules.reload()
                      return `规则「${rule.category}」已删除。`
                    })
                  }
                >
                  删除规则
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4" onSubmit={submitRule}>
          <label className="min-w-44 flex-1 text-sm text-slate-600">
            分类（含已配置分类，保存即更新）
            <select
              className={`${inputClass} mt-1.5`}
              value={ruleCategory}
              required
              onChange={(event) => {
                setRuleCategory(event.currentTarget.value)
                const existing = rules.data?.items.find((rule) => rule.category === event.currentTarget.value)
                setRuleGroupId(existing ? String(existing.groupId) : '')
              }}
            >
              <option value="">请选择分类</option>
              {categories.data?.items.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-44 flex-1 text-sm text-slate-600">
            目标业务组
            <select className={`${inputClass} mt-1.5`} value={ruleGroupId} required onChange={(event) => setRuleGroupId(event.currentTarget.value)}>
              <option value="">请选择业务组</option>
              {groups.data?.items.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonPrimaryClass} disabled={busy || !ruleCategory || !ruleGroupId}>
            保存规则
          </button>
        </form>
        {unruledCategories.length > 0 && <p className="mt-2 text-xs text-slate-400">尚未配置规则的分类：{unruledCategories.join('、')}</p>}
      </SectionCard>
    </div>
  )
}
