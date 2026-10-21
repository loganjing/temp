// 分配配置（admin）：公司 → 业务组 → 成员 → 分类自动分配规则。
// 全部接口按契约第 3-5 节；组 ID 在列表中展示，供处理人转派时引用。
import { useEffect, useState, type FormEvent } from 'react'
import {
  addGroupMember,
  createCompany,
  createGroup,
  createRoutingRule,
  deleteGroup,
  deleteRoutingRule,
  listCompanies,
  listGroupMembers,
  listGroups,
  listRoutingRules,
  listUsersForCompany,
  removeGroupMember,
  renameGroup,
  updateRoutingRule,
} from '../api/org'
import { listCategories } from '../api/org'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PageHeader,
  Spinner,
  SuccessNote,
  TableSkeleton,
} from '../components/ui'
import {
  IconBuilding2,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconSlidersHorizontal,
  IconTrash2,
  IconUsers,
  IconX,
} from '../components/icons'
import { errorMessage, useAsync } from '../hooks/useAsync'

export function AssignConfigPage() {
  const companies = useAsync(() => listCompanies(), [])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)

  useEffect(() => {
    if (selectedCompanyId === null && companies.data && companies.data.items.length > 0) {
      setSelectedCompanyId(companies.data.items[0].id)
    }
  }, [companies.data, selectedCompanyId])

  return (
    <div>
      <PageHeader
        title="分配配置"
        description="公司 → 业务组 → 成员 → 分类自动分配规则；新工单按分类规则自动进入对应业务组"
      />
      <CompanyCard
        companies={companies.data?.items ?? null}
        loading={companies.loading && !companies.data}
        error={companies.error}
        selectedId={selectedCompanyId}
        onSelect={setSelectedCompanyId}
        onCreated={() => companies.reload()}
      />
      {selectedCompanyId !== null && (
        <div className="mt-6">
          <GroupsCard companyId={selectedCompanyId} />
        </div>
      )}
    </div>
  )
}

function CompanyCard({
  companies,
  loading,
  error,
  selectedId,
  onSelect,
  onCreated,
}: {
  companies: { id: number; name: string }[] | null
  loading: boolean
  error: string | null
  selectedId: number | null
  onSelect: (id: number) => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      const company = await createCompany(name.trim())
      setName('')
      setNotice(`公司「${company.name}」已创建`)
      onCreated()
    } catch (cause) {
      setFormError(errorMessage(cause, '创建公司失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="公司"
      description="选择要配置的公司，或新增公司"
      actions={<IconBuilding2 className="size-4 text-slate-400" />}
    >
      <ErrorBanner message={error} />
      {loading ? (
        <TableSkeleton rows={1} cols={3} />
      ) : !companies || companies.length === 0 ? (
        <EmptyState
          title="还没有公司"
          description="先创建公司，再为其配置业务组、成员与分类自动分配规则。"
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {companies.map((company) => {
            const active = company.id === selectedId
            return (
              <button
                key={company.id}
                type="button"
                onClick={() => onSelect(company.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                {company.name}
              </button>
            )
          })}
        </div>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <Field label="新增公司" className="w-64" hint="1-100 字，名称唯一">
          <input
            className={inputClass}
            required
            minLength={1}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="公司名称"
          />
        </Field>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : <IconPlus />}
          创建公司
        </Button>
      </form>
      <div className="mt-3 space-y-2">
        <SuccessNote message={notice || null} />
        <ErrorBanner message={formError || null} />
      </div>
    </Card>
  )
}

function GroupsCard({ companyId }: { companyId: number }) {
  const groups = useAsync(() => listGroups(companyId), [companyId])
  const rules = useAsync(() => listRoutingRules(companyId), [companyId])
  const categories = useAsync(() => listCategories(), [])
  const users = useAsync(() => listUsersForCompany(companyId), [companyId])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const members = useAsync(
    () => (selectedGroupId === null ? Promise.resolve({ items: [] }) : listGroupMembers(selectedGroupId)),
    [selectedGroupId],
  )

  useEffect(() => {
    setSelectedGroupId(null)
  }, [companyId])

  const [groupFormName, setGroupFormName] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [groupNotice, setGroupNotice] = useState('')

  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameName, setRenameName] = useState('')

  const [memberUserId, setMemberUserId] = useState('')
  const [memberBusy, setMemberBusy] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [memberNotice, setMemberNotice] = useState('')

  const [ruleCategoryId, setRuleCategoryId] = useState('')
  const [ruleGroupId, setRuleGroupId] = useState('')
  const [ruleBusy, setRuleBusy] = useState(false)
  const [ruleError, setRuleError] = useState('')
  const [ruleNotice, setRuleNotice] = useState('')

  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [editRuleGroupId, setEditRuleGroupId] = useState('')

  const reloadGroups = () => groups.reload()
  const memberIds = new Set(members.data?.items.map((member) => member.userId) ?? [])
  const addableUsers = users.data?.items.filter((user) => !memberIds.has(user.userId)) ?? []

  const submitGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGroupBusy(true)
    setGroupError('')
    setGroupNotice('')
    try {
      const group = await createGroup(companyId, groupFormName.trim())
      setGroupFormName('')
      setGroupNotice(`业务组「${group.name}」已创建（ID ${group.id}）`)
      reloadGroups()
    } catch (cause) {
      setGroupError(errorMessage(cause, '创建业务组失败'))
    } finally {
      setGroupBusy(false)
    }
  }

  const submitRename = async (groupId: number) => {
    setGroupBusy(true)
    setGroupError('')
    setGroupNotice('')
    try {
      const group = await renameGroup(groupId, renameName.trim())
      setRenaming(null)
      setGroupNotice(`业务组已重命名为「${group.name}」`)
      reloadGroups()
    } catch (cause) {
      setGroupError(errorMessage(cause, '重命名失败'))
    } finally {
      setGroupBusy(false)
    }
  }

  const submitDeleteGroup = async (groupId: number, name: string) => {
    if (!window.confirm(`确认删除业务组「${name}」？`)) return
    setGroupBusy(true)
    setGroupError('')
    setGroupNotice('')
    try {
      await deleteGroup(groupId)
      if (selectedGroupId === groupId) setSelectedGroupId(null)
      setGroupNotice(`业务组「${name}」已删除`)
      reloadGroups()
    } catch (cause) {
      setGroupError(errorMessage(cause, '删除业务组失败'))
    } finally {
      setGroupBusy(false)
    }
  }

  const submitAddMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedGroupId === null) return
    const userId = Number(memberUserId)
    if (!Number.isInteger(userId) || userId <= 0) {
      setMemberError('请选择要添加的用户')
      return
    }
    setMemberBusy(true)
    setMemberError('')
    setMemberNotice('')
    try {
      await addGroupMember(selectedGroupId, userId)
      setMemberUserId('')
      setMemberNotice('成员已添加')
      members.reload()
      reloadGroups()
    } catch (cause) {
      setMemberError(errorMessage(cause, '添加成员失败'))
    } finally {
      setMemberBusy(false)
    }
  }

  const submitRemoveMember = async (userId: number, name: string) => {
    if (selectedGroupId === null) return
    if (!window.confirm(`确认将「${name}」移出该业务组？`)) return
    setMemberBusy(true)
    setMemberError('')
    setMemberNotice('')
    try {
      await removeGroupMember(selectedGroupId, userId)
      setMemberNotice('成员已移除')
      members.reload()
      reloadGroups()
    } catch (cause) {
      setMemberError(errorMessage(cause, '移除成员失败'))
    } finally {
      setMemberBusy(false)
    }
  }

  const submitRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const categoryId = Number(ruleCategoryId)
    const groupId = Number(ruleGroupId)
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setRuleError('请选择问题分类')
      return
    }
    if (!Number.isInteger(groupId) || groupId <= 0) {
      setRuleError('请选择目标业务组')
      return
    }
    setRuleBusy(true)
    setRuleError('')
    setRuleNotice('')
    try {
      await createRoutingRule(companyId, categoryId, groupId)
      setRuleCategoryId('')
      setRuleGroupId('')
      setRuleNotice('分配规则已创建；该公司该分类的新工单将自动进入对应业务组')
      rules.reload()
    } catch (cause) {
      setRuleError(errorMessage(cause, '创建规则失败'))
    } finally {
      setRuleBusy(false)
    }
  }

  const submitUpdateRule = async (ruleId: number) => {
    const groupId = Number(editRuleGroupId)
    if (!Number.isInteger(groupId) || groupId <= 0) {
      setRuleError('请选择新的目标业务组')
      return
    }
    setRuleBusy(true)
    setRuleError('')
    setRuleNotice('')
    try {
      await updateRoutingRule(ruleId, groupId)
      setEditingRuleId(null)
      setRuleNotice('规则目标组已更新')
      rules.reload()
    } catch (cause) {
      setRuleError(errorMessage(cause, '更新规则失败'))
    } finally {
      setRuleBusy(false)
    }
  }

  const submitDeleteRule = async (ruleId: number, label: string) => {
    if (!window.confirm(`确认删除规则「${label}」？`)) return
    setRuleBusy(true)
    setRuleError('')
    setRuleNotice('')
    try {
      await deleteRoutingRule(ruleId)
      setRuleNotice('规则已删除')
      rules.reload()
    } catch (cause) {
      setRuleError(errorMessage(cause, '删除规则失败'))
    } finally {
      setRuleBusy(false)
    }
  }

  const groupItems = groups.data?.items ?? []
  const categoryItems = categories.data?.items ?? []

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
      <Card
        title="业务组"
        description="公司内可配置多个业务组；处理人在工作台承接本组工单"
        actions={<IconUsers className="size-4 text-slate-400" />}
      >
        <ErrorBanner message={groups.error} />
        {groups.loading && !groups.data ? (
          <TableSkeleton rows={2} cols={3} />
        ) : groupItems.length === 0 ? (
          <EmptyState
            title="还没有业务组"
            description="创建业务组并添加成员后，分配到该组的工单会出现在成员的工作台。"
          />
        ) : (
          <ul className="space-y-2">
            {groupItems.map((group) => (
              <li key={group.id} className="rounded-md border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  {renaming === group.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void submitRename(group.id)
                      }}
                    >
                      <input
                        className={inputClass}
                        autoFocus
                        maxLength={100}
                        required
                        value={renameName}
                        onChange={(event) => setRenameName(event.currentTarget.value)}
                      />
                      <Button type="submit" variant="secondary" disabled={groupBusy}>
                        保存
                      </Button>
                      <Button variant="ghost" onClick={() => setRenaming(null)} aria-label="取消重命名">
                        <IconX />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        className={`flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-sm font-medium transition-colors ${
                          selectedGroupId === group.id
                            ? 'text-blue-700'
                            : 'text-slate-800 hover:text-blue-700'
                        }`}
                        onClick={() =>
                          setSelectedGroupId(selectedGroupId === group.id ? null : group.id)
                        }
                      >
                        <IconChevronRight
                          className={`size-3.5 shrink-0 text-slate-400 transition-transform ${
                            selectedGroupId === group.id ? 'rotate-90' : ''
                          }`}
                        />
                        <span className="truncate" title={group.name}>
                          {group.name}
                        </span>
                      </button>
                      <Badge tone="bg-slate-100 text-slate-600 ring-slate-300">ID {group.id}</Badge>
                      <span className="text-xs text-slate-500">{group.memberCount} 名成员</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRenaming(group.id)
                        setRenameName(group.name)
                      }}
                      aria-label={`重命名 ${group.name}`}
                      title="重命名"
                    >
                      <IconPencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => void submitDeleteGroup(group.id, group.name)}
                      aria-label={`删除 ${group.name}`}
                      title="删除业务组"
                    >
                      <IconTrash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submitGroup} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <Field label="新增业务组" className="w-64" hint="1-100 字；同公司内名称唯一">
            <input
              className={inputClass}
              required
              minLength={1}
              maxLength={100}
              value={groupFormName}
              onChange={(event) => setGroupFormName(event.currentTarget.value)}
              placeholder="业务组名称"
            />
          </Field>
          <Button type="submit" disabled={groupBusy || !groupFormName.trim()}>
            {groupBusy && groups.data ? <Spinner /> : <IconPlus />}
            创建业务组
          </Button>
        </form>
        <div className="mt-3 space-y-2">
          <SuccessNote message={groupNotice || null} />
          <ErrorBanner message={groupError || null} />
        </div>
      </Card>

      {selectedGroupId !== null && (
        <Card
          title="成员管理"
          description="业务组成员在工作台承接该组的待处理工单"
          actions={<IconUsers className="size-4 text-slate-400" />}
        >
          <ErrorBanner message={members.error} />
          {members.loading && !members.data ? (
            <TableSkeleton rows={2} cols={3} />
          ) : !members.data || members.data.items.length === 0 ? (
            <EmptyState
              title="该业务组暂无成员"
              description="添加成员后，其工作台将显示分配到该组的工单。"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {members.data.items.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{member.displayName}</p>
                    <p className="truncate text-xs text-slate-500" title={member.email}>
                      {member.email}
                      {member.department ? ` · ${member.department}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    disabled={memberBusy}
                    onClick={() => void submitRemoveMember(member.userId, member.displayName)}
                  >
                    <IconTrash2 className="size-4" />
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={submitAddMember}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
          >
            <Field label="添加成员" className="w-64" hint="可从该公司用户中选择">
              <select
                className={inputClass}
                value={memberUserId}
                onChange={(event) => setMemberUserId(event.currentTarget.value)}
              >
                <option value="">选择用户</option>
                {addableUsers.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.displayName}（{user.username}）
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={memberBusy}>
              {memberBusy ? <Spinner /> : <IconPlus />}
              添加成员
            </Button>
          </form>
          <div className="mt-3 space-y-2">
            <SuccessNote message={memberNotice || null} />
            <ErrorBanner message={memberError || null} />
          </div>
        </Card>
      )}
      </div>

      <Card
        title="分类自动分配规则"
        description="「问题分类 → 业务组」；该公司新工单按分类自动进入对应业务组，无匹配时保持待分配"
        actions={<IconSlidersHorizontal className="size-4 text-slate-400" />}
      >
        <ErrorBanner message={rules.error} />
        {rules.loading && !rules.data ? (
          <TableSkeleton rows={2} cols={2} />
        ) : !rules.data || rules.data.items.length === 0 ? (
          <EmptyState
            title="尚未配置分配规则"
            description="配置规则后，该公司匹配分类的新工单将自动分配到对应业务组并进入待处理状态。"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rules.data.items.map((rule) => (
              <li key={rule.id} className="py-3">
                {editingRuleId === rule.id ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submitUpdateRule(rule.id)
                    }}
                  >
                    <span className="text-sm text-slate-700">{rule.categoryName}</span>
                    <span className="text-xs text-slate-400">→</span>
                    <select
                      className={`${inputClass} w-48`}
                      value={editRuleGroupId}
                      onChange={(event) => setEditRuleGroupId(event.currentTarget.value)}
                    >
                      <option value="">选择目标业务组</option>
                      {groupItems
                        .filter((group) => group.id !== rule.groupId)
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                    </select>
                    <Button type="submit" variant="secondary" disabled={ruleBusy}>
                      保存
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingRuleId(null)} aria-label="取消">
                      <IconX />
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{rule.categoryName}</span>
                      <span className="mx-1.5 text-xs text-slate-400">→</span>
                      <span className="font-medium">{rule.groupName}</span>
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingRuleId(rule.id)
                          setEditRuleGroupId('')
                        }}
                        aria-label="修改目标组"
                        title="修改目标业务组"
                      >
                        <IconPencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() =>
                          void submitDeleteRule(rule.id, `${rule.categoryName} → ${rule.groupName}`)
                        }
                        aria-label="删除规则"
                        title="删除规则"
                      >
                        <IconTrash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submitRule} className="mt-4 grid items-end gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="问题分类" required>
            <select
              className={inputClass}
              value={ruleCategoryId}
              onChange={(event) => setRuleCategoryId(event.currentTarget.value)}
            >
              <option value="">选择分类</option>
              {categoryItems
                .filter(
                  (category) =>
                    !rules.data?.items.some((rule) => rule.categoryId === category.id),
                )
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="目标业务组" required>
            <select
              className={inputClass}
              value={ruleGroupId}
              onChange={(event) => setRuleGroupId(event.currentTarget.value)}
            >
              <option value="">选择业务组</option>
              {groupItems.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" disabled={ruleBusy}>
            {ruleBusy ? <Spinner /> : <IconPlus />}
            创建规则
          </Button>
        </form>
        <div className="mt-3 space-y-2">
          <SuccessNote message={ruleNotice || null} />
          <ErrorBanner message={ruleError || null} />
        </div>
      </Card>
    </div>
  )
}
