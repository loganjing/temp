import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/ui'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <EmptyState title="页面不存在" description="请从左侧导航进入相应功能" />
      {user && (
        <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
          返回首页
        </button>
      )}
    </div>
  )
}
