import { useState } from 'react'
import { api } from '../platform/api'
import type { User } from '../platform/contracts'
import { useApp } from '../app-context'

export default function UsersPage() {
  const { companyId, currentUsers, reload } = useApp()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<User | null>(null)

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!companyId || !name.trim() || !email.trim()) return
    setError(null)
    setCreated(null)
    api.createUser({
      name: name.trim(),
      email: email.trim(),
      companyId,
      department: department.trim() || null,
    })
      .then((user) => {
        setCreated(user)
        setName('')
        setEmail('')
        setDepartment('')
        reload()
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '新建用户失败'))
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold">用户目录</h1>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {created && <p className="mt-2 text-sm text-emerald-700">已创建用户：{created.name}（{created.email}）</p>}

      <form className="mt-4 flex flex-wrap gap-2" onSubmit={handleCreate}>
        <input
          className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="姓名"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="email"
          className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="邮箱"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="部门（可选）"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={!name.trim() || !email.trim()}
        >
          新建用户
        </button>
      </form>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <th className="py-2 pr-4 font-medium">姓名</th>
            <th className="py-2 pr-4 font-medium">邮箱</th>
            <th className="py-2 font-medium">部门</th>
          </tr>
        </thead>
        <tbody>
          {currentUsers.map((user) => (
            <tr key={user.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{user.name}</td>
              <td className="py-2 pr-4">{user.email}</td>
              <td className="py-2">{user.department ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {currentUsers.length === 0 && <p className="mt-4 text-sm text-slate-400">该公司暂无用户</p>}
    </div>
  )
}
