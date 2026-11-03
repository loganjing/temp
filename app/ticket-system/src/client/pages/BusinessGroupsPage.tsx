import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { businessGroupApi } from '../api'
import type { BusinessGroup } from '../types'
import { useToast } from '../hooks/useToast'
import { EmptyState, ErrorState, PageCard, Skeleton } from '../components/common'

export default function BusinessGroupsPage() {
  const { notify } = useToast()
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await businessGroupApi.list()
      setGroups(result.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const createGroup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await businessGroupApi.create({ name: name.trim() })
      notify('业务组已创建', 'success')
      setName('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const addMember = async (groupId: string, userIdStr: string) => {
    const userId = userIdStr
    if (!userId) return
    try {
      await businessGroupApi.addMember(groupId, userId)
      notify('成员已添加', 'success')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '添加成员失败')
    }
  }

  const removeMember = async (groupId: string, userId: string) => {
    try {
      await businessGroupApi.removeMember(groupId, userId)
      notify('成员已移除', 'success')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '移除成员失败')
    }
  }

  return (
    <div className="admin-grid">
      <PageCard title="创建业务组">
        <form className="form-grid" onSubmit={createGroup}>
          <label>业务组名称<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
          <button disabled={busy}>{busy ? '创建中…' : '创建'}</button>
        </form>
      </PageCard>

      <PageCard title={`业务组列表 (${groups.length})`}>
        {error && <ErrorState message={error} />}
        {loading ? (
          <Skeleton lines={4} />
        ) : groups.length === 0 ? (
          <EmptyState message="暂无业务组" />
        ) : (
          <div className="admin-grid">
            {groups.map((g) => (
              <div key={g.id} className="card nested-card">
                <div className="section-heading">
                  <h3>{g.name}</h3>
                  <span className="subtext">ID: {g.id}</span>
                </div>
                <div className="member-section">
                  <p className="subtext">成员 ({g.members?.length ?? 0})</p>
                  {g.members && g.members.length > 0 ? (
                    <ul className="member-list">
                      {g.members.map((m) => (
                        <li key={m.userId}>
                          <span>{m.displayName}</span>
                          <button className="secondary small" onClick={() => void removeMember(g.id, m.userId)}>移除</button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="subtext">无成员</p>
                  )}
                  <form className="member-add-form" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; void addMember(g.id, (f.elements.namedItem('userId') as HTMLInputElement).value); f.reset() }}>
                    <input name="userId" type="text" placeholder="用户 ID" required />
                    <button className="secondary">添加成员</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>
    </div>
  )
}
