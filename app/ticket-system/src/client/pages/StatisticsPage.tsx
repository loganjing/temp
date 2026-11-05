import { useEffect, useState } from 'react'
import { Button, Card, Col, Empty, Row, Segmented, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { statisticsApi } from '../api/ticket-client'
import type { Statistics } from '../api/types'
import { ErrorView } from '../components/StateViews'

export default function StatisticsPage() {
  const [data, setData] = useState<Statistics | null>(null)
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await statisticsApi.get(dimension)
      setData(r)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [dimension]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />
  if (error) return <ErrorView message={error} onRetry={load} />
  if (!data) return <Empty description="暂无统计数据" />

  const m = data.metrics

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="工单总量" value={m.totalTickets} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="平均响应时间" value={m.avgResponseTimeMinutes} suffix="分钟" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="满意度评分" value={m.satisfactionScore} suffix="/ 5" precision={2} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="热点分类数" value={m.hotspotCategories.length} /></Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="工单分布统计"
        extra={
          <Segmented
            options={[{ label: '按公司', value: 'company' }, { label: '按部门', value: 'department' }]}
            value={dimension}
            onChange={(v) => setDimension(v as 'company' | 'department')}
          />
        }
      >
        {data.distribution.length === 0 ? (
          <Empty description="暂无分布数据" />
        ) : (
          <Table
            rowKey="label"
            size="small"
            dataSource={data.distribution}
            pagination={false}
            columns={[
              { title: dimension === 'company' ? '公司' : '部门', dataIndex: 'label' },
              { title: '总量', dataIndex: 'total', align: 'right' as const },
              {
                title: '待处理', dataIndex: 'pending', align: 'right' as const,
                render: (v: number) => v > 0 ? <Tag color="processing">{v}</Tag> : v,
              },
              {
                title: '已完成', dataIndex: 'completed', align: 'right' as const,
                render: (v: number) => v > 0 ? <Tag color="success">{v}</Tag> : v,
              },
              {
                title: '已取消', dataIndex: 'cancelled', align: 'right' as const,
                render: (v: number) => v > 0 ? <Tag>{v}</Tag> : v,
              },
            ]}
          />
        )}
      </Card>

      <Card size="small" title={<Space><Button icon={<ReloadOutlined />} onClick={load} size="small" />热点问题 TOP5</Space>}>
        {m.hotspotCategories.length === 0 ? (
          <Empty description="暂无热点分类" />
        ) : (
          <Table
            rowKey="category"
            size="small"
            dataSource={m.hotspotCategories}
            pagination={false}
            columns={[
              { title: '排名', key: 'rank', render: (_, __, i) => i + 1, width: 80 },
              { title: '分类', dataIndex: 'category', render: (v: string) => <Tag>{v}</Tag> },
              { title: '工单量', dataIndex: 'count', align: 'right' as const },
            ]}
          />
        )}
      </Card>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        统计数据基于当前公司范围内实际工单数据计算。
      </Typography.Text>
    </div>
  )
}

