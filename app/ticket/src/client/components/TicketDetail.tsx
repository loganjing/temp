import { Alert, App, Button, Card, Col, Descriptions, Divider, Empty, Form, Input, List, Modal, Rate, Result, Row, Select, Skeleton, Space, Tag, Timeline, Typography } from 'antd'
import type { FormInstance } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest, errorFields, errorMessage, errorStatus } from '../platform/api-client'
import { formatDateTime, hasRole, NOTIFICATION_STATUS_COLOR, NOTIFICATION_STATUS_LABEL, ticketStatusColor, ticketStatusLabel } from '../platform/labels'
import { useSession } from '../platform/session'
import type { BusinessGroup, NotificationRecord, ReferenceData, TicketDetail as TicketDetailData, TicketLog, TicketSummary } from '../platform/types'
import { PriorityTag, StatusTag } from './TicketTags'

type ActionModal = 'assign' | 'transfer' | 'complete' | 'cancel' | 'rate' | null

interface GroupOption {
  id: string
  name: string
  members: Array<{ id: string; name: string; email: string; department: string }>
}

interface Props {
  ticketId: string
  onChanged?: () => void
  onBack?: () => void
}

function applyFieldErrors(form: FormInstance, cause: unknown) {
  const fields = errorFields(cause)
  if (!fields) return
  form.setFields(Object.entries(fields).map(([name, error]) => ({ name, errors: [error] })))
}

function logDetailText(detail: Record<string, unknown> | null): string {
  if (!detail) return ''
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
}

export function TicketDetail({ ticketId, onChanged, onBack }: Props) {
  const { message } = App.useApp()
  const { user } = useSession()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<TicketDetailData | null>(null)
  const [logs, setLogs] = useState<TicketLog[]>([])
  const [loading, setLoading] = useState(true)
  const [logsFailed, setLogsFailed] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [action, setAction] = useState<ActionModal>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [replyDraft, setReplyDraft] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await apiRequest<TicketDetailData>(`/api/tickets/${encodeURIComponent(ticketId)}`)
      setDetail(result)
      setError(null)
      try {
        const logResult = await apiRequest<{ items: TicketLog[] }>(`/api/tickets/${encodeURIComponent(ticketId)}/logs`)
        setLogs(logResult.items)
        setLogsFailed(false)
      } catch {
        setLogs([])
        setLogsFailed(true)
      }
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    setDetail(null)
    setLogs([])
    setReplyDraft('')
    void load()
  }, [load])

  const loadGroupOptions = useCallback(async () => {
    setGroupsLoading(true)
    try {
      if (hasRole(user, 'company_admin')) {
        const result = await apiRequest<{ items: BusinessGroup[] }>('/api/business-groups')
        setGroupOptions(result.items.filter((group) => group.enabled).map((group) => ({ id: group.id, name: group.name, members: group.members })))
      } else {
        const reference = await apiRequest<ReferenceData>('/api/reference')
        setGroupOptions(reference.groups.map((group) => ({ id: group.id, name: group.name, members: [] })))
      }
    } catch (cause) {
      message.error(errorMessage(cause, '加载业务组失败'))
      setGroupOptions([])
    } finally {
      setGroupsLoading(false)
    }
  }, [message, user])

  useEffect(() => {
    if (action === 'assign' || action === 'transfer') void loadGroupOptions()
  }, [action, loadGroupOptions])

  const postAction = useCallback(async <T,>(path: string, body: unknown, successText: (result: T) => string): Promise<{ ok: boolean; cause?: unknown }> => {
    setActionLoading(true)
    try {
      const result = await apiRequest<T>(`/api/tickets/${encodeURIComponent(ticketId)}${path}`, { method: 'POST', body: JSON.stringify(body) })
      message.success(successText(result))
      await load(true)
      onChanged?.()
      return { ok: true }
    } catch (cause) {
      message.error(errorMessage(cause))
      if (errorStatus(cause) === 409) await load(true)
      return { ok: false, cause }
    } finally {
      setActionLoading(false)
    }
  }, [ticketId, message, load, onChanged])

  const submitReply = async () => {
    const content = replyDraft.trim()
    if (!content) {
      message.warning('请填写回复内容')
      return
    }
    if (content.length > 2000) {
      message.warning('回复内容不能超过 2000 个字符')
      return
    }
    setReplyBusy(true)
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/replies`, { method: 'POST', body: JSON.stringify({ content }) })
      setReplyDraft('')
      message.success('回复已提交')
      await load(true)
      onChanged?.()
    } catch (cause) {
      message.error(errorMessage(cause, '回复失败'))
    } finally {
      setReplyBusy(false)
    }
  }

  const retryNotification = async (notificationId: string) => {
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/notifications/${encodeURIComponent(notificationId)}/retry`, { method: 'POST' })
      message.success('已重新发送完成通知')
      await load(true)
      onChanged?.()
    } catch (cause) {
      message.error(errorMessage(cause, '重试通知失败'))
    }
  }

  if (loading && !detail) return <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>
  if (!detail) {
    const status = errorStatus(error)
    if (status === 403) {
      return (
        <Result
          status="403"
          title="无权限查看该工单"
          subTitle="该工单不属于你所在公司或当前账号的可见范围。"
          extra={onBack ? <Button onClick={onBack}>返回</Button> : <Button onClick={() => navigate(-1)}>返回</Button>}
        />
      )
    }
    if (status === 404) {
      return (
        <Result
          status="404"
          title="工单不存在"
          subTitle="该工单可能已被删除或链接有误。"
          extra={onBack ? <Button onClick={onBack}>返回</Button> : <Button onClick={() => navigate(-1)}>返回</Button>}
        />
      )
    }
    return <Result status="warning" title="工单加载失败" subTitle={errorMessage(error, '请稍后重试')} extra={<Button onClick={() => void load()}>重试</Button>} />
  }

  const can = (name: TicketDetailData['allowedActions'][number]) => detail.allowedActions.includes(name)
  const terminal = detail.status === 'completed' || detail.status === 'cancelled'
  const canRetryNotification = can('retryNotification')

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <div className="detail-title-row">
          <div className="detail-title-main">
            <Space wrap size="small">
              <Typography.Text strong copyable={{ text: detail.code }}>{detail.code}</Typography.Text>
              <StatusTag status={detail.status} />
              <PriorityTag priority={detail.priority} />
            </Space>
            <Typography.Title level={4} className="detail-subject">{detail.subject}</Typography.Title>
            <Space wrap split={<Divider type="vertical" />} className="detail-meta">
              <span>分类：{detail.categoryName}</span>
              <span>所属公司：{detail.companyName}</span>
              <span>部门：{detail.department}</span>
              <span>业务组：{detail.group?.name ?? '未分配'}</span>
              <span>处理人：{detail.assignee?.name ?? '未指定'}</span>
              <span>创建时间：{formatDateTime(detail.createdAt)}</span>
              <span>最近更新：{formatDateTime(detail.updatedAt)}</span>
            </Space>
          </div>
          <Space wrap className="detail-actions">
            {can('assign') && <Button type="primary" onClick={() => setAction('assign')}>指派</Button>}
            {can('transfer') && <Button onClick={() => setAction('transfer')}>转派</Button>}
            {can('complete') && <Button type="primary" onClick={() => setAction('complete')}>完成工单</Button>}
            {can('cancel') && <Button danger onClick={() => setAction('cancel')}>取消工单</Button>}
            {can('rate') && <Button type="primary" onClick={() => setAction('rate')}>评价</Button>}
          </Space>
        </div>
        {terminal && (
          <Alert
            className="detail-terminal"
            type="info"
            showIcon
            message={detail.status === 'completed' ? '工单已完成，不可再回复、转派、取消或变更状态。' : '工单已取消，不可再回复、转派、取消或变更状态。'}
          />
        )}
      </Card>

      <Row gutter={16}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="问题描述">
              <div className="pre-wrap">{detail.description}</div>
            </Card>

            <Card title={`回复记录（${detail.replies.length}）`}>
              {detail.replies.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无回复" />
              ) : (
                <List
                  dataSource={detail.replies}
                  renderItem={(reply) => (
                    <List.Item>
                      <div className="reply-item">
                        <Space size="small" wrap>
                          <Typography.Text strong>{reply.author.name}</Typography.Text>
                          {reply.author.id === detail.submitter.id && <Tag color="blue">提交人</Tag>}
                          <Typography.Text type="secondary">{formatDateTime(reply.createdAt)}</Typography.Text>
                        </Space>
                        <div className="pre-wrap reply-content">{reply.content}</div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
              {can('reply') ? (
                <div className="reply-editor">
                  <Input.TextArea
                    rows={3}
                    maxLength={2000}
                    showCount
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    placeholder="输入回复内容，回复后双方均可看到"
                  />
                  <Button type="primary" loading={replyBusy} onClick={() => void submitReply()}>提交回复</Button>
                </div>
              ) : (
                <Typography.Text type="secondary">{terminal ? '工单已结束，不能继续回复。' : '当前账号无权回复该工单。'}</Typography.Text>
              )}
            </Card>

            <Card title="满意度评价">
              {detail.rating ? (
                <Space direction="vertical" size={8}>
                  <Space size="middle">
                    <Rate disabled value={detail.rating.score} />
                    <Typography.Text strong>{detail.rating.score} 分</Typography.Text>
                    <Typography.Text type="secondary">{formatDateTime(detail.rating.createdAt)}</Typography.Text>
                  </Space>
                  <div className="pre-wrap">{detail.rating.comment || '未填写评语'}</div>
                </Space>
              ) : can('rate') ? (
                <Space direction="vertical" size={8}>
                  <Typography.Text type="secondary">工单已完成，请对本次服务做出评价。</Typography.Text>
                  <Button type="primary" onClick={() => setAction('rate')}>立即评价</Button>
                </Space>
              ) : (
                <Typography.Text type="secondary">工单完成后由提交人评价，每条工单仅评价一次。</Typography.Text>
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="提交人信息" size="small">
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="姓名">{detail.submitter.name}</Descriptions.Item>
                <Descriptions.Item label="公司">{detail.submitter.companyName}</Descriptions.Item>
                <Descriptions.Item label="部门">{detail.submitter.department}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{detail.submitter.email}</Descriptions.Item>
              </Descriptions>
              <Divider style={{ margin: '12px 0' }} />
              <Typography.Text strong>历史工单（最近 10 条）</Typography.Text>
              {detail.history.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史工单" />
              ) : (
                <List
                  size="small"
                  dataSource={detail.history}
                  renderItem={(item) => (
                    <List.Item className="history-item">
                      <div className="history-line">
                        <Space size="small" wrap>
                          <Link to={`/tickets/${encodeURIComponent(item.id)}`}>{item.code}</Link>
                          <Tag color={ticketStatusColor(item.status)} bordered={false}>{ticketStatusLabel(item.status)}</Tag>
                        </Space>
                        <div className="history-subject" title={item.subject}>{item.subject}</div>
                        <div className="subtext">{item.categoryName} · {formatDateTime(item.createdAt)}</div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </Card>

            {(detail.completedAt || detail.cancelledAt) && (
              <Card title="处理结果" size="small">
                <Descriptions column={1} size="small" colon={false}>
                  {detail.completedAt && <Descriptions.Item label="完成人">{detail.completedBy?.name ?? '—'}</Descriptions.Item>}
                  {detail.completedAt && <Descriptions.Item label="完成时间">{formatDateTime(detail.completedAt)}</Descriptions.Item>}
                  {detail.cancelledAt && <Descriptions.Item label="取消人">{detail.cancelledBy?.name ?? '—'}</Descriptions.Item>}
                  {detail.cancelledAt && <Descriptions.Item label="取消时间">{formatDateTime(detail.cancelledAt)}</Descriptions.Item>}
                  {detail.firstReplyAt && <Descriptions.Item label="首次回复">{formatDateTime(detail.firstReplyAt)}</Descriptions.Item>}
                </Descriptions>
              </Card>
            )}

            <Card title="完成通知记录" size="small">
              {detail.notifications.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知记录" />
              ) : (
                <List
                  size="small"
                  dataSource={detail.notifications}
                  renderItem={(record: NotificationRecord) => (
                    <List.Item className="notification-item">
                      <div className="notification-line">
                        <Space size="small" wrap>
                          <Tag color={NOTIFICATION_STATUS_COLOR[record.status]}>{NOTIFICATION_STATUS_LABEL[record.status]}</Tag>
                          <span>{record.recipientEmail}</span>
                        </Space>
                        <div className="subtext">
                          第 {record.attempt} 次 · {formatDateTime(record.createdAt)}
                          {record.sentAt ? ` · 发送于 ${formatDateTime(record.sentAt)}` : ''}
                        </div>
                        {record.errorMessage && <div className="error-text">{record.errorMessage}</div>}
                        {record.status !== 'sent' && canRetryNotification && (
                          <Button size="small" onClick={() => void retryNotification(record.id)}>重试发送</Button>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </Card>

            <Card title="操作日志（只读）" size="small">
              {logsFailed ? (
                <Space direction="vertical">
                  <Typography.Text type="secondary">操作日志加载失败。</Typography.Text>
                  <Button size="small" onClick={() => void load(true)}>重试</Button>
                </Space>
              ) : logs.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作日志" />
              ) : (
                <Timeline
                  className="log-timeline"
                  items={logs.map((log) => ({
                    children: (
                      <div>
                        <Space size="small" wrap>
                          <Typography.Text strong>{log.actionLabel}</Typography.Text>
                          <Typography.Text type="secondary">{log.actor.name} · {formatDateTime(log.createdAt)}</Typography.Text>
                        </Space>
                        <div>{log.summary}</div>
                        {log.detail && <Typography.Text type="secondary" className="log-detail">{logDetailText(log.detail)}</Typography.Text>}
                      </div>
                    ),
                  }))}
                />
              )}
            </Card>
          </Space>
        </Col>
      </Row>

      <AssignModal
        open={action === 'assign'}
        title="指派工单"
        groups={groupOptions}
        loading={groupsLoading}
        submitting={actionLoading}
        onCancel={() => setAction(null)}
        onSubmit={async (values) => {
          const result = await postAction<{ ticket: TicketSummary }>('/assign', values, () => '工单已指派，状态更新为待处理')
          if (result.ok) setAction(null)
          return result
        }}
        onFieldErrors={applyFieldErrors}
      />

      <AssignModal
        open={action === 'transfer'}
        title="转派工单"
        groups={groupOptions}
        loading={groupsLoading}
        submitting={actionLoading}
        withNote
        onCancel={() => setAction(null)}
        onSubmit={async (values) => {
          const result = await postAction<{ ticket: TicketSummary }>('/transfer', values, () => '工单已转派，状态保持待处理')
          if (result.ok) setAction(null)
          return result
        }}
        onFieldErrors={applyFieldErrors}
      />

      <CompleteModal
        open={action === 'complete'}
        submitting={actionLoading}
        onCancel={() => setAction(null)}
        onFieldErrors={applyFieldErrors}
        onSubmit={async (note) => {
          const result = await postAction<{ ticket: TicketSummary; notification: NotificationRecord | null }>('/complete', { note: note || undefined }, (response) =>
            `工单已完成，完成通知：${response.notification ? NOTIFICATION_STATUS_LABEL[response.notification.status] : '未发送'}`,
          )
          if (result.ok) setAction(null)
          return result
        }}
      />

      <CancelModal
        open={action === 'cancel'}
        submitting={actionLoading}
        onCancel={() => setAction(null)}
        onFieldErrors={applyFieldErrors}
        onSubmit={async (reason) => {
          const result = await postAction<{ ticket: TicketSummary }>('/cancel', { reason: reason || undefined }, () => '工单已取消')
          if (result.ok) setAction(null)
          return result
        }}
      />

      <RateModal
        open={action === 'rate'}
        submitting={actionLoading}
        onCancel={() => setAction(null)}
        onFieldErrors={applyFieldErrors}
        onSubmit={async (values) => {
          const result = await postAction('/rating', values, () => '评价已提交，感谢你的反馈')
          if (result.ok) setAction(null)
          return result
        }}
      />
    </Space>
  )
}

interface AssignValues {
  groupId: string
  assigneeId?: string
  note?: string
}

function AssignModal({ open, title, groups, loading, submitting, withNote, onCancel, onSubmit, onFieldErrors }: {
  open: boolean
  title: string
  groups: GroupOption[]
  loading: boolean
  submitting: boolean
  withNote?: boolean
  onCancel: () => void
  onSubmit: (values: AssignValues) => Promise<{ ok: boolean; cause?: unknown }>
  onFieldErrors: (form: FormInstance, cause: unknown) => void
}) {
  const [form] = Form.useForm<AssignValues>()
  const groupId = Form.useWatch('groupId', form)
  const members = groups.find((group) => group.id === groupId)?.members ?? []

  const submit = async (values: AssignValues) => {
    const result = await onSubmit(values)
    if (!result.ok && result.cause !== undefined) onFieldErrors(form, result.cause)
  }

  return (
    <Modal
      title={title}
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={() => form.submit()}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} preserve={false}>
        <Form.Item label="目标业务组" name="groupId" rules={[{ required: true, message: '请选择目标业务组' }]}>
          <Select
            loading={loading}
            placeholder="选择本公司业务组"
            showSearch
            optionFilterProp="label"
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
            onChange={() => form.setFieldValue('assigneeId', undefined)}
          />
        </Form.Item>
        <Form.Item label="指定处理人（可选）" name="assigneeId">
          <Select
            allowClear
            placeholder={members.length === 0 ? '未获取到该业务组成员，可仅指派到业务组' : '不指定则按业务组处理'}
            disabled={members.length === 0}
            options={members.map((member) => ({ value: member.id, label: `${member.name}（${member.email}）` }))}
          />
        </Form.Item>
        {withNote && (
          <Form.Item label="转派说明（可选）" name="note" rules={[{ max: 500, message: '转派说明不能超过 500 个字符' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="补充转派原因，便于后续追溯" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

function CompleteModal({ open, submitting, onCancel, onSubmit, onFieldErrors }: {
  open: boolean
  submitting: boolean
  onCancel: () => void
  onSubmit: (note: string) => Promise<{ ok: boolean; cause?: unknown }>
  onFieldErrors: (form: FormInstance, cause: unknown) => void
}) {
  const [form] = Form.useForm<{ note?: string }>()

  const submit = async (values: { note?: string }) => {
    const result = await onSubmit(values.note ?? '')
    if (!result.ok && result.cause !== undefined) onFieldErrors(form, result.cause)
  }

  return (
    <Modal
      title="完成工单"
      open={open}
      okText="确认完成"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={() => form.submit()}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      destroyOnClose
    >
      <Alert type="info" showIcon message="完成后工单进入终态，并向提交人邮箱发送完成通知。" style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" preserve={false} onFinish={(values) => void submit(values)}>
        <Form.Item label="处理说明（可选）" name="note" rules={[{ max: 500, message: '处理说明不能超过 500 个字符' }]}>
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="填写处理结论或后续建议" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function CancelModal({ open, submitting, onCancel, onSubmit, onFieldErrors }: {
  open: boolean
  submitting: boolean
  onCancel: () => void
  onSubmit: (reason: string) => Promise<{ ok: boolean; cause?: unknown }>
  onFieldErrors: (form: FormInstance, cause: unknown) => void
}) {
  const [form] = Form.useForm<{ reason?: string }>()

  const submit = async (values: { reason?: string }) => {
    const result = await onSubmit(values.reason ?? '')
    if (!result.ok && result.cause !== undefined) onFieldErrors(form, result.cause)
  }

  return (
    <Modal
      title="取消工单"
      open={open}
      okText="确认取消"
      okButtonProps={{ danger: true }}
      cancelText="返回"
      confirmLoading={submitting}
      onOk={() => form.submit()}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      destroyOnClose
    >
      <Alert type="warning" showIcon message="取消后工单进入终态，不能继续回复或变更状态。" style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" preserve={false} onFinish={(values) => void submit(values)}>
        <Form.Item label="取消原因（可选）" name="reason" rules={[{ max: 500, message: '取消原因不能超过 500 个字符' }]}>
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="说明取消原因" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function RateModal({ open, submitting, onCancel, onSubmit, onFieldErrors }: {
  open: boolean
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: { score: number; comment?: string }) => Promise<{ ok: boolean; cause?: unknown }>
  onFieldErrors: (form: FormInstance, cause: unknown) => void
}) {
  const [form] = Form.useForm<{ score: number; comment?: string }>()

  const submit = async (values: { score: number; comment?: string }) => {
    const result = await onSubmit(values)
    if (!result.ok && result.cause !== undefined) onFieldErrors(form, result.cause)
  }

  return (
    <Modal
      title="满意度评价"
      open={open}
      okText="提交评价"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={() => form.submit()}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      destroyOnClose
    >
      <Alert type="info" showIcon message="每条工单只能评价一次，提交后不可修改。" style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" preserve={false} initialValues={{ score: 5 }} onFinish={(values) => void submit(values)}>
        <Form.Item label="评分" name="score" rules={[{ required: true, message: '请选择评分' }]}>
          <Rate count={5} />
        </Form.Item>
        <Form.Item label="评语（可选）" name="comment" rules={[{ max: 500, message: '评语不能超过 500 个字符' }]}>
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="说说本次服务的体验" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
