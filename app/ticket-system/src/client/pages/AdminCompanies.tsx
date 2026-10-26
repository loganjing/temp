import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { companyApi, ApiRequestError } from '../platform/api'
import type { Company } from '../../shared/types'

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try { const result = await companyApi.list(); setCompanies(result.items) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(''); setMessage('')
    if (!name.trim()) return
    try { await companyApi.create(name.trim()); setName(''); setMessage('公司已创建'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  return (
    <section className="card">
      <h2>公司管理</h2>
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label>公司名称<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} /></label>
        <button>创建公司</button>
      </form>
      {message && <p role="status" className="success">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="table-scroll" style={{ marginTop: '1rem' }}>
        <table>
          <thead><tr><th>公司名称</th><th>创建时间</th></tr></thead>
          <tbody>{companies.map((c) => (
            <tr key={c.id}><td><strong>{c.name}</strong></td><td className="subtext">{new Date(c.created_at).toLocaleString('zh-CN')}</td></tr>
          ))}</tbody>
        </table>
        {companies.length === 0 && <p className="empty">暂无公司</p>}
      </div>
    </section>
  )
}
