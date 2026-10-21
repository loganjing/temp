import { useEffect, useState, type FormEvent } from 'react'
import {
  addGroupMember,
  createAssignmentRule,
  createCategory,
  createGroup,
  deleteAssignmentRule,
  listAssignmentRules,
  listCategories,
  listGroups,
  listTickets,
  removeGroupMember,
} from '../api'
import { Badge, EmptyState, ErrorState, Panel, RoleBadge, Skeleton, apiErrorMessage, useToast } from '../components/ui'
import { useSession } from '../session'
import type { AssignmentRule, BusinessGroup, Category, UserProfileSummary } from '../types'

export default function AdminPage() {
  const { user } = useSession()

  if (user.role !== 'company_admin') {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="panel max-w-md p-8 text-center">
          <p className="text-base font-semibold text-slate-800">403 · 无访问权限</p>
          <p className="mt-2 text-sm text-slate-500">
            管理页仅对本公司管理者开放。当前账号角色为
            <span className="mx-1.5 inline-flex translate-y-0.5">
              <RoleBadge role={user.role} />
            </span>
            ，如需管理业务组、分类与分配规则，请使用公司管理者账号登录。
          </p>
        </div>
      </div>
    )
  }

  return <AdminWorkspace />
}

function AdminWorkspace() {
  const toast = useToast()
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((key) => key + 1)

  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [knownUsers, setKnownUsers] = useState<UserProfileSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([listGroups(true), listCategories(), listAssignmentRules(), listTickets({})])
      .then(([groupsResult, categoriesResult, rulesResult, ticketsResult]) => {
        if (cancelled) return
        setGroups(groupsResult.items)
        setCategories(categoriesResult.items)
        setRules(rulesResult.items)
        const userMap = new Map<number, UserProfileSummary>()
        for (const group of groupsResult.items) {
          for (const member of group.members ?? []) userMap.set(member.id, member)
        }
        for (const ticket of ticketsResult.items) userMap.set(ticket.submitter.id, ticket.submitter)
        setKnownUsers([...userMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)))
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(apiErrorMessage(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true)
    setActionError('')
    try {
      await action()
      toast.show(successMessage)
      reload()
    } catch (cause) {
      setActionError(apiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel space-y-4 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ErrorState message={error} onRetry={reload} />
      </div>
    )
  }

  const usedCategoryIds = new Set(rules.map((rule) => rule.categoryId))

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      {actionError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <Panel title="业务组与成员" actions={<span className="text-xs text-slate-400">{groups.length} 个业务组</span>}>
        <CreateGroupForm
          busy={busy}
          onSubmit={(name) => runAction(() => createGroup(name), `业务组「${name}」已创建`)}
        />
        {groups.length === 0 ? (
          <EmptyState title="还没有业务组" hint="创建业务组后可为工单分配处理人团队。" />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                knownUsers={knownUsers}
                busy={busy}
                onAddMember={(userProfileId) =>
                  runAction(
                    () => addGroupMember(group.id, userProfileId),
                    `已添加成员到「${group.name}」`,
                  )
                }
                onRemoveMember={(userProfileId, displayName) =>
                  runAction(
                    () => removeGroupMember(group.id, userProfileId),
                    `已将 ${displayName} 移出「${group.name}」`,
                  )
                }
              />
            ))}
          </div>
        )}
        <KnownUsersReference users={knownUsers} />
      </Panel>

      <Panel title="问题分类" actions={<span className="text-xs text-slate-400">{categories.length} 个分类</span>}>
        <CreateCategoryForm
          busy={busy}
          onSubmit={(name) => runAction(() => createCategory(name), `分类「${name}」已创建`)}
        />
        {categories.length === 0 ? (
          <EmptyState title="还没有分类" hint="创建分类后可在工单创建与自动分配规则中使用。" />
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Badge tone="blue">{category.name}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="分类分配规则" actions={<span className="text-xs text-slate-400">{rules.length} 条规则</span>}>
        <CreateRuleForm
          categories={categories}
          groups={groups}
          usedCategoryIds={usedCategoryIds}
          busy={busy}
          onSubmit={(categoryId, groupId) =>
            runAction(
              () => createAssignmentRule(categoryId, groupId),
              '分配规则已创建，该分类的新工单将自动进入对应业务组',
            )
          }
        />
        {rules.length === 0 ? (
          <EmptyState
            title="还没有分配规则"
            hint="配置“分类 → 业务组”规则后，该公司新工单按分类自动进入对应业务组。"
          />
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">问题分类</th>
                  <th className="px-3 py-2 font-medium">自动分配至业务组</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 text-slate-700">{rule.categoryName}</td>
                    <td className="px-3 py-2.5 text-slate-700">{rule.groupName}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="btn btn-secondary h-8 px-3 text-xs text-red-600 hover:bg-red-50"
                        disabled={busy}
                        onClick={() => void runAction(() => deleteAssignmentRule(rule.id), '分配规则已删除')}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function CreateGroupForm({ busy, onSubmit }: { busy: boolean; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!name.trim()) return
        const trimmed = name.trim()
        setName('')
        void onSubmit(trimmed)
      }}
    >
      <label className="block w-72">
        <span className="label-text">新建业务组（1–50 字，本公司唯一）</span>
        <input
          className="input"
          required
          minLength={1}
          maxLength={50}
          placeholder="例如 一线支持组"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
        创建业务组
      </button>
    </form>
  )
}

function GroupCard({
  group,
  knownUsers,
  busy,
  onAddMember,
  onRemoveMember,
}: {
  group: BusinessGroup
  knownUsers: UserProfileSummary[]
  busy: boolean
  onAddMember: (userProfileId: number) => Promise<void>
  onRemoveMember: (userProfileId: number, displayName: string) => Promise<void>
}) {
  const [userProfileId, setUserProfileId] = useState('')
  const members = group.members ?? []
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{group.name}</p>
        <span className="text-xs text-slate-400">{group.memberCount} 名成员</span>
      </div>
      {members.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">暂无成员，添加成员后其可在工作台处理本组工单。</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {members.map((member) => (
            <li
              key={member.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1.5 text-xs text-slate-600"
            >
              <span title={`${member.displayName} · ${member.department}`}>{member.displayName}</span>
              <button
                type="button"
                aria-label={`移除成员 ${member.displayName}`}
                title={`移除 ${member.displayName}`}
                className="grid h-4 w-4 place-items-center rounded-full text-slate-400 transition-colors hover:bg-red-100 hover:text-red-600"
                disabled={busy}
                onClick={() => void onRemoveMember(member.id, member.displayName)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          if (!userProfileId.trim()) return
          const id = Number(userProfileId)
          setUserProfileId('')
          void onAddMember(id)
        }}
      >
        <input
          className="input w-36"
          inputMode="numeric"
          placeholder="用户档案 ID"
          aria-label={`添加成员到 ${group.name}，输入用户档案 ID`}
          list={`known-users-${group.id}`}
          value={userProfileId}
          onChange={(event) => setUserProfileId(event.currentTarget.value)}
        />
        <datalist id={`known-users-${group.id}`}>
          {knownUsers.map((member) => (
            <option key={member.id} value={String(member.id)}>
              {member.displayName} · {member.department}
            </option>
          ))}
        </datalist>
        <button type="submit" className="btn btn-secondary h-8 px-3 text-xs" disabled={busy || !userProfileId.trim()}>
          添加成员
        </button>
      </form>
    </div>
  )
}

function KnownUsersReference({ users }: { users: UserProfileSummary[] }) {
  if (users.length === 0) return null
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-500">
        本公司用户档案参考（{users.length} 人，来自现有组成员与工单提交人）
      </summary>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">档案 ID</th>
              <th className="px-3 py-2 font-medium">姓名</th>
              <th className="px-3 py-2 font-medium">部门</th>
              <th className="px-3 py-2 font-medium">邮箱</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{user.id}</td>
                <td className="px-3 py-2 text-slate-700">{user.displayName}</td>
                <td className="px-3 py-2 text-slate-600">{user.department}</td>
                <td className="px-3 py-2 text-slate-600">{user.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function CreateCategoryForm({ busy, onSubmit }: { busy: boolean; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!name.trim()) return
        const trimmed = name.trim()
        setName('')
        void onSubmit(trimmed)
      }}
    >
      <label className="block w-72">
        <span className="label-text">新建分类（1–50 字，本公司唯一）</span>
        <input
          className="input"
          required
          minLength={1}
          maxLength={50}
          placeholder="例如 账号权限"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
        创建分类
      </button>
    </form>
  )
}

function CreateRuleForm({
  categories,
  groups,
  usedCategoryIds,
  busy,
  onSubmit,
}: {
  categories: Category[]
  groups: BusinessGroup[]
  usedCategoryIds: Set<number>
  busy: boolean
  onSubmit: (categoryId: number, groupId: number) => Promise<void>
}) {
  const [categoryId, setCategoryId] = useState('')
  const [groupId, setGroupId] = useState('')
  const available = categories.filter((category) => !usedCategoryIds.has(category.id))
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!categoryId || !groupId) return
        const cid = Number(categoryId)
        const gid = Number(groupId)
        setCategoryId('')
        setGroupId('')
        void onSubmit(cid, gid)
      }}
    >
      <label className="block w-56">
        <span className="label-text">问题分类</span>
        <select
          className="input"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.currentTarget.value)}
        >
          <option value="">选择分类</option>
          {available.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <span className="pb-2.5 text-sm text-slate-400">→</span>
      <label className="block w-56">
        <span className="label-text">目标业务组</span>
        <select className="input" required value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)}>
          <option value="">选择业务组</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !categoryId || !groupId}>
        创建规则
      </button>
      {categories.length > 0 && available.length === 0 && (
        <p className="w-full pt-1 text-xs text-slate-400">全部分类均已配置规则；可先新建分类再配置。</p>
      )}
    </form>
  )
}
