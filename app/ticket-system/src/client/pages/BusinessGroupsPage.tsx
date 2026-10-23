// 业务组管理页 — 创建业务组、管理成员、创建问题分类
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { businessGroupsApi, categoriesApi } from '../api'
import type { BusinessGroup, TicketCategory } from '../types'
import { ErrorBanner, EmptyState, Loading, useToast } from '../components'

export default function BusinessGroupsPage() {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, showToast, toastView] = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [g, c] = await Promise.all([businessGroupsApi.list(), categoriesApi.list()])
      setGroups(g)
      setCategories(c)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载业务组数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '')
    try {
      await businessGroupsApi.create(name)
      form.reset()
      showToast('业务组已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建业务组失败')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '')
    try {
      await categoriesApi.create(name)
      form.reset()
      showToast('问题分类已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建分类失败')
    } finally {
      setBusy(false)
    }
  }

  const handleAddMember = async (event: FormEvent<HTMLFormElement>, groupId: string) => {
    event.preventDefault()
    const form = event.currentTarget
    const userId = String(new FormData(form).get('userId') ?? '')
    try {
      await businessGroupsApi.addMember(groupId, userId)
      form.reset()
      showToast('成员已添加')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '添加成员失败')
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      await businessGroupsApi.removeMember(groupId, userId)
      showToast('成员已移除')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '移除成员失败')
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>业务组管理</h1>
        <p>管理公司业务组、成员与问题分类</p>
      </div>
      {toastView}
      <ErrorBanner error={error} onClose={() => setError('')} />

      <div className="two-col-grid">
        {/* 创建业务组 */}
        <section className="card">
          <h2>创建业务组</h2>
          <form className="stack" onSubmit={handleCreateGroup}>
            <label>
              业务组名称
              <input name="name" required maxLength={200} placeholder="如：网络组" />
            </label>
            <button disabled={busy}>创建业务组</button>
          </form>
        </section>

        {/* 创建问题分类 */}
        <section className="card">
          <h2>创建问题分类</h2>
          <form className="stack" onSubmit={handleCreateCategory}>
            <label>
              分类名称
              <input name="name" required maxLength={200} placeholder="如：网络故障" />
            </label>
            <button disabled={busy}>创建分类</button>
          </form>
        </section>
      </div>

      {/* 问题分类列表 */}
      <section className="card">
        <h2>问题分类 ({categories.length})</h2>
        {loading ? (
          <Loading />
        ) : categories.length === 0 ? (
          <EmptyState message="暂无问题分类" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>分类名称</th>
                  <th>分类 ID</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>
                      <span className="subtext">{c.id}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 业务组列表（含成员） */}
      <section className="card">
        <h2>业务组 ({groups.length})</h2>
        {loading ? (
          <Loading />
        ) : groups.length === 0 ? (
          <EmptyState message="暂无业务组" />
        ) : (
          <div className="group-list">
            {groups.map((g) => (
              <div key={g.id} className="group-card">
                <div className="section-heading">
                  <div>
                    <strong>{g.name}</strong>
                    <span className="subtext">{g.members.length} 名成员</span>
                  </div>
                  <span className="subtext">{g.id}</span>
                </div>
                <div className="member-list">
                  {g.members.length === 0 ? (
                    <span className="empty-inline">暂无成员</span>
                  ) : (
                    g.members.map((m) => (
                      <div key={m.id} className="member-item">
                        <span>{m.userName}</span>
                        <span className="subtext">{m.userId}</span>
                        <button
                          className="secondary small-btn"
                          onClick={() => void handleRemoveMember(g.id, m.userId)}
                        >
                          移除
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <form
                  className="member-add-form"
                  onSubmit={(e) => void handleAddMember(e, g.id)}
                >
                  <input
                    name="userId"
                    placeholder="用户 ID"
                    required
                  />
                  <button className="secondary" type="submit">
                    添加成员
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
