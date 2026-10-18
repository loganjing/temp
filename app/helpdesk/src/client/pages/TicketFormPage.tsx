import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui'
import { TicketForm } from '../components/TicketForm'
import { usePlatformText } from '../platform/i18n'

/** 草稿创建/编辑路由页：/tickets/new 与 /tickets/:id/edit */
export function TicketFormPage() {
  const t = usePlatformText()
  const { id } = useParams()
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Button icon="arrowLeft" onClick={() => void navigate('/tickets')}>
        {t('common.back')}
      </Button>
      <TicketForm ticketId={id ? Number(id) : undefined} />
    </div>
  )
}
