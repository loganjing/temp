import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { Alert, PageHeader } from '../../components/ui'
import { useOptionList } from '../../components/options'
import type { CatalogRef } from '../../types'

// 基础档案维护：费用类型与货品类别（masterdata:maintain；扩展性需求，后台维护无需改代码）。
export default function MasterdataPage() {
  return (
    <div className="section-gap">
      <PageHeader title="基础档案" description="维护费用类型与货品类别基础档案；费用类型用于报价明细行与计费，货品类别用于差异化单价。" />
      <CatalogSection
        title="费用类型"
        description="仓储费、装卸费、操作费、耗材费、保险费等；编码唯一。"
        listPath="/api/masterdata/fee-types"
        createPath="/api/masterdata/fee-types"
        emptyHint="暂无费用类型；新增后可在报价单费用明细行选择。"
      />
      <CatalogSection
        title="货品类别"
        description="不同货品类别可配置差异化单价；不选类别代表全货品共用一套单价。"
        listPath="/api/masterdata/goods-categories"
        createPath="/api/masterdata/goods-categories"
        emptyHint="暂无货品类别；新增后可在报价单明细行选择。"
      />
    </div>
  )
}

function CatalogSection({ title, description, listPath, createPath, emptyHint }: {
  title: string
  description: string
  listPath: string
  createPath: string
  emptyHint: string
}) {
  const { items, reload } = useOptionList<CatalogRef>(listPath, (item) => item.name)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ id: string; code: string; name: string } | null>(null)
  const [editError, setEditError] = useState('')

  const reloadAll = useCallback(() => {
    reload()
    setNotice('')
    setError('')
  }, [reload])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    if (!trimmedCode) { setError('编码为必填项'); return }
    if (!trimmedName) { setError('名称为必填项'); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(createPath, { method: 'POST', body: JSON.stringify({ code: trimmedCode, name: trimmedName }) })
      setCode('')
      setName('')
      setNotice(`${title}已新增：${trimmedName}。`)
      reloadAll()
    } catch (cause) {
      setError(errorText(cause, `${title}新增失败`))
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    if (!editing.code.trim()) { setEditError('编码为必填项'); return }
    if (!editing.name.trim()) { setEditError('名称为必填项'); return }
    setBusy(true)
    setEditError('')
    try {
      await apiRequest(`${createPath}/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ code: editing.code.trim(), name: editing.name.trim() }),
      })
      setEditing(null)
      setNotice(`${title}已更新。`)
      reloadAll()
    } catch (cause) {
      setEditError(errorText(cause, `${title}更新失败`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-header"><h2 className="card-title">{title}</h2></div>
      <div className="card-body">
        <p className="field-hint" style={{ margin: '0 0 12px' }}>{description}</p>
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        <form className="form-grid" onSubmit={(event) => void create(event)} style={{ maxWidth: 560 }}>
          <label className="field">
            <span className="field-label">编码<span className="required">*</span></span>
            <input className="input" maxLength={64} value={code} placeholder="例如 CC01" onChange={(event) => setCode(event.currentTarget.value)} />
          </label>
          <label className="field">
            <span className="field-label">名称<span className="required">*</span></span>
            <input className="input" maxLength={200} value={name} placeholder="例如 仓储费" onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <div className="toolbar">
            <button type="submit" className="btn" disabled={busy}>{busy ? '处理中…' : '新增'}</button>
          </div>
        </form>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>编码</th>
                <th>名称</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {editing?.id === item.id ? (
                    <>
                      <td><input className="input" value={editing.code} maxLength={64} onChange={(event) => setEditing((current) => current ? { ...current, code: event.currentTarget.value } : current)} /></td>
                      <td><input className="input" value={editing.name} maxLength={200} onChange={(event) => setEditing((current) => current ? { ...current, name: event.currentTarget.value } : current)} /></td>
                      <td>
                        <div className="toolbar">
                          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void saveEdit()}>保存</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditing(null); setEditError('') }}>取消</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.code}</td>
                      <td>{item.name}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setEditing({ id: item.id, code: item.code, name: item.name }); setEditError('') }}
                        >编辑</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>{editing ? '' : emptyHint}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {editing && editError && <div className="alert alert-error" style={{ marginTop: 10 }}>{editError}</div>}
      </div>
    </section>
  )
}
