import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { TicketDetail } from '../components/TicketDetail'

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div className="page">
      <Button type="link" icon={<ArrowLeftOutlined />} className="back-link" onClick={() => navigate(-1)}>
        返回
      </Button>
      {id ? <TicketDetail ticketId={id} /> : <div className="page-empty">缺少工单编号，无法打开详情。</div>}
    </div>
  )
}