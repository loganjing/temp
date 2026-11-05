import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Rate,
  Row,
  Select,
  Space,
  Steps,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExportOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { businessGroupApi, ticketApi } from '../api/ticket-client'
import type {
  AuditEvent,
  BusinessGroup,
  SubmitterInfo,
  Ticket,
  TicketReply,
  TicketStatus,
} from '../api/types'
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, TERMINAL_STATUSES, formatDateTime } from '../constants'
import { ErrorView, LoadingView } from '../components/StateViews'

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [logs, setLogs] = useState<AuditEvent[]>([])
  const [submitter, setSubmitter] = useState<SubmitterInfo | null>(null)
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [submitterDrawer, setSubmitterDrawer] = useState(false)
  const [evalOpen, setEvalOpen] = useState(false)
  const [transferForm] = Form.useForm()
  const [assignForm] = Form.useForm()
  const [evalForm] = Form.useForm()

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [detail, logResult] = await Promise.all([ticketApi.get(id), ticketApi.logs(id)])
      setTicket(detail.ticket)
      setReplies(detail.replies)
      setLogs(logResult.logs)
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : '加载工单失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!id) return
    void ticketApi.submitterInfo(id).then(setSubmitter).catch(() => setSubmitter(null))
  }, [id])

  const refreshGroups = async () => {
    try { const r = await businessGroupApi.list(); setGroups(r.groups) } catch { /* ignore */ }
  }

  if (loading) return <LoadingView tip="加载工单详情…" />
  if (error) return <ErrorView message={error} onRetry={load} status={error.includes('无权限') ? '403' : 'error'} />
  if (!ticket) return <Empty description="工单不存在" />

  const isTerminal = TERMINAL_STATUSES.includes(ticket.status)
  const currentStepIndex = (['created', 'pending_assignment', 'pending_processing', 'completed'] as TicketStatus[]).indexOf(ticket.status)
  const canEvaluate = ticket.status === 'completed'

  const handleReply = async () => {
    if (!replyText.trim()) return
    try {
      const r = await ticketApi.reply(ticket.id, replyText.trim())
      setReplies((prev) => [...prev, r.reply])
      setReplyText('')
      message.success('回复已提交')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '回复失败')
    }
  }

  const handleTransfer = async (values: { toGroupId: string; toAssigneeId?: string; reason?: string }) => {
    try {
      const r = await ticketApi.transfer(ticket.id, { toGroupId: values.toGroupId, toAssigneeId: values.toAssigneeId, reason: values.reason })
      setTicket(r.ticket)
      setTransferOpen(false)
      transferForm.resetFields()
      message.success('转派成功')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '转派失败')
    }
  }

  const handleAssign = async (values: { businessGroupId: string; assigneeId?: string }) => {
    try {
      const r = await ticketApi.assign(ticket.id, values.businessGroupId, values.assigneeId)
      setTicket(r.ticket)
      setAssignOpen(false)
      assignForm.resetFields()
      message.success('分配成功')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '分配失败')
    }
  }

  const handleComplete = async () => {
    try {
      const r = await ticketApi.complete(ticket.id)
      setTicket(r.ticket)
      message.success('工单已完成')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '完成失败')
    }
  }

  const handleCancel = async () => {
    try {
      const r = await ticketApi.cancel(ticket.id)
      setTicket(r.ticket)
      message.success('工单已取消')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '取消失败')
    }
  }

  const handleEvaluate = async (values: { rating: number; comment?: string }) => {
    try {
      await ticketApi.evaluate(ticket.id, values.rating, values.comment)
      setEvalOpen(false)
      evalForm.resetFields()
      message.success('评价已提交')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '评价失败')
    }
  }

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }))
  const memberOptions = groups.flatMap((g) => g.members.map((m) => ({ value: m.userId, label: `${m.userName}（${g.name}）` })))

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        size="small"
        title={
          <Space wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>{ticket.subject}</Typography.Title>
            <Tag color={STATUS_COLOR[ticket.status]}>{STATUS_LABEL[ticket.status]}</Tag>
            <Tag color={PRIORITY_COLOR[ticket.slaPriority]}>{PRIORITY_LABEL[ticket.slaPriority]}</Tag>
            <Tag>{ticket.category}</Tag>
          </Space>
        }
        extra={<Space>
          <Button icon={<ReloadOutlined />} onClick={load} size="small" />
          <Button onClick={() => navigate('/')}>返回工作台</Button>
        </Space>}
      >
        <Steps
          size="small"
          current={ticket.status === 'cancelled' ? 3 : currentStepIndex}
          status={ticket.status === 'cancelled' ? 'error' : undefined}
          items={[
            { title: '创建' },
            { title: '待分配' },
            { title: '待处理' },
            { title: ticket.status === 'cancelled' ? '已取消' : '完成' },
          ]}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card size="small" title="工单信息" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="分类">{ticket.category}</Descriptions.Item>
              <Descriptions.Item label="优先级">{PRIORITY_LABEL[ticket.slaPriority]}</Descriptions.Item>
              <Descriptions.Item label="提交人">{ticket.submitterName}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(ticket.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="处理人">{ticket.handlerId ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="处理时间">{formatDateTime(ticket.handledAt)}</Descriptions.Item>
              <Descriptions.Item label="完成时间" span={2}>{formatDateTime(ticket.completedAt)}</Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{ticket.description}</Typography.Paragraph>
          </Card>

          <Card size="small" title="回复时间线" style={{ marginBottom: 16 }}
            extra={!isTerminal && (
              <Space>
                <Input.TextArea rows={1} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="输入回复内容" style={{ width: 320 }} />
                <Button type="primary" icon={<SendOutlined />} onClick={handleReply}>回复</Button>
              </Space>
            )}
          >
            {replies.length === 0 ? (
              <Empty description="暂无回复" />
            ) : (
              <Timeline
                items={replies.map((r) => ({
                  children: (
                    <div>
                      <Typography.Text strong>{r.replierName}</Typography.Text>
                      <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{formatDateTime(r.repliedAt)}</Typography.Text>
                      <Typography.Paragraph style={{ margin: '4px 0 0' }}>{r.content}</Typography.Paragraph>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>

          <Card size="small" title="操作日志">
            {logs.length === 0 ? (
              <Empty description="暂无操作日志" />
            ) : (
              <Timeline
                items={logs.map((l) => ({
                  color: l.eventType.includes('completed') ? 'green' : l.eventType.includes('cancelled') ? 'red' : 'blue',
                  children: (
                    <div>
                      <Typography.Text strong>{l.eventType}</Typography.Text>
                      <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {l.actorName ?? '—'} · {formatDateTime(l.occurredAt)}
                      </Typography.Text>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card size="small" title="操作" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {!isTerminal && (
                <>
                  {ticket.status === 'pending_assignment' && (
                    <Button block onClick={() => { void refreshGroups(); setAssignOpen(true) }}>手动分配</Button>
                  )}
                  {ticket.status === 'pending_processing' && (
                    <Button block onClick={() => { void refreshGroups(); setTransferOpen(true) }}>转派工单</Button>
                  )}
                  {ticket.status === 'pending_processing' && (
                    <Button block type="primary" icon={<CheckCircleOutlined />} onClick={handleComplete}>标记完成</Button>
                  )}
                  <Button block danger icon={<CloseCircleOutlined />} onClick={handleCancel}>取消工单</Button>
                </>
              )}
              {canEvaluate && (
                <Button block onClick={() => setEvalOpen(true)}>评价工单</Button>
              )}
              <Button block icon={<ExportOutlined />} onClick={() => setSubmitterDrawer(true)}>查看提交人信息</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Modal title="转派工单" open={transferOpen} onCancel={() => setTransferOpen(false)} footer={null}>
        <Form form={transferForm} layout="vertical" onFinish={(v) => void handleTransfer(v)}>
          <Form.Item name="toGroupId" label="目标业务组" rules={[{ required: true, message: '请选择业务组' }]}>
            <Select options={groupOptions} placeholder="选择业务组" />
          </Form.Item>
          <Form.Item name="toAssigneeId" label="指定处理人（可选）">
            <Select options={memberOptions} allowClear placeholder="可选" />
          </Form.Item>
          <Form.Item name="reason" label="转派原因（可选）">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" block>确认转派</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="手动分配" open={assignOpen} onCancel={() => setAssignOpen(false)} footer={null}>
        <Form form={assignForm} layout="vertical" onFinish={(v) => void handleAssign(v)}>
          <Form.Item name="businessGroupId" label="业务组" rules={[{ required: true, message: '请选择业务组' }]}>
            <Select options={groupOptions} placeholder="选择业务组" />
          </Form.Item>
          <Form.Item name="assigneeId" label="指定处理人（可选）">
            <Select options={memberOptions} allowClear placeholder="可选" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" block>确认分配</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="满意度评价" open={evalOpen} onCancel={() => setEvalOpen(false)} footer={null}>
        <Form form={evalForm} layout="vertical" onFinish={(v) => void handleEvaluate(v)}>
          <Form.Item name="rating" label="评分" rules={[{ required: true, message: '请选择评分' }]}>
            <Rate />
          </Form.Item>
          <Form.Item name="comment" label="评价内容（可选）">
            <Input.TextArea rows={3} maxLength={1000} showCount />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" block>提交评价</Button></Form.Item>
        </Form>
      </Modal>

      <Drawer title="提交人信息" open={submitterDrawer} onClose={() => setSubmitterDrawer(false)} width={520}>
        {submitter ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="姓名">{submitter.submitter.name}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{submitter.submitter.email}</Descriptions.Item>
              <Descriptions.Item label="电话">{submitter.submitter.phone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="公司">{submitter.submitter.companyName}</Descriptions.Item>
              <Descriptions.Item label="部门">{submitter.submitter.departmentName ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>历史工单</Typography.Title>
            {submitter.historyTickets.length === 0 ? (
              <Empty description="暂无历史工单" />
            ) : (
              <List
                size="small"
                bordered
                dataSource={submitter.historyTickets}
                renderItem={(t) => (
                  <List.Item>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Typography.Text ellipsis style={{ maxWidth: 240 }}>{t.subject}</Typography.Text>
                      <Space size={4}>
                        <Tag color={STATUS_COLOR[t.status]}>{STATUS_LABEL[t.status]}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(t.createdAt)}</Typography.Text>
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </>
        ) : (
          <LoadingView tip="加载提交人信息…" />
        )}
      </Drawer>
    </Space>
  )
}
