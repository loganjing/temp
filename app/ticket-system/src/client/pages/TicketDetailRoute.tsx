import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ticketApi, type TicketDetail, type CurrentUser } from '../platform/api-client'
import TicketDetailPage from './TicketDetailPage'
import { Spinner, ErrorBanner, EmptyState } from '../components/ui'

export default function TicketDetailRoute({ currentUser }: { currentUser: CurrentUser }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [exists, setExists] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    if (!id) { setExists(false); return }
    setError('')
    try {
      await ticketApi.get(id)
      setExists(true)
    } catch (cause) {
      setExists(false)
      setError(cause instanceof Error ? cause.message : '加载工单失败')
    }
  }, [id])

  useEffect(() => { void check() }, [check])

  if (!id) return <EmptyState message="未指定工单" />
  if (exists === null) return <Spinner />
  if (!exists) return (
    <section className="card">
      <ErrorBanner message={error || '工单不存在或无权访问'} />
      <button className="secondary" onClick={() => navigate('/workbench')}>返回工作台</button>
    </section>
  )
  return <TicketDetailPage ticketId={id} currentUser={currentUser} onUpdated={() => void check()} />
}
