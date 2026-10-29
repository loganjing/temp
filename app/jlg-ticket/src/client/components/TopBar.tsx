import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCurrentUser } from '../context/CurrentUser'

const TITLE_MAP: Record<string, string> = {
  '/': '工单列表',
  '/tickets/new': '创建工单',
  '/groups': '业务组管理',
  '/rules': '分类规则配置',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const title = TITLE_MAP[pathname] ?? '工单系统'
  const { user, loading, error, setCurrentUserId, clear } = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [inputId, setInputId] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSet = async () => {
    const id = inputId.trim()
    if (!id) return
    setLocalError(null)
    try {
      await setCurrentUserId(id)
      setEditing(false)
      setInputId('')
    } catch {
      setLocalError('无法解析该用户 ID，请确认 ID 正确')
    }
  }

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-sm font-semibold text-slate-800">{title}</h1>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1 ring-1 ring-inset ring-slate-200">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700">
                {user.name.slice(0, 1)}
              </div>
              <div className="text-xs leading-tight">
                <div className="font-medium text-slate-700">{user.name}</div>
                <div className="text-slate-400">
                  {user.companyName ?? '—'}
                  {user.department ? ` · ${user.department}` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={clear}
              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
              title="切换身份"
            >
              切换
            </button>
          </div>
        ) : editing ? (
          <div className="flex items-center gap-1.5">
            <input
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSet()}
              placeholder="输入用户 ID"
              className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              autoFocus
            />
            <button
              onClick={handleSet}
              disabled={loading}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? '解析中' : '确认'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setInputId('')
                setLocalError(null)
              }}
              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
            >
              取消
            </button>
            {localError && <span className="text-xs text-red-500">{localError}</span>}
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            设置当前身份
          </button>
        )}
        {error && !editing && <span className="text-xs text-red-400">身份解析失败</span>}
      </div>
    </header>
  )
}
