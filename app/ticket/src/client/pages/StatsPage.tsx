import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Empty, Input, Progress, Radio, Row, Space, Statistic, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, errorMessage, toQuery } from '../platform/api-client'
import { dayBoundary, formatMinutes, formatScore } from '../platform/labels'
import type { StatsDimension, StatsDistribution, StatsOverview } from '../platform/types'

function toDateInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000)
  return { from: toDateInput(from), to: toDateInput(to) }
}

export default function StatsPage() {
  const initial = useMemo(defaultRange, [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [dimension, setDimension] = useState<StatsDimension>('company')
  const [overview, setOverview] = useState<StatsOverview | null>(null)
  const [distribution, setDistribution] = useState<StatsDistribution | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = toQuery({ from: dayBoundary(from, 'start'), to: dayBoundary(to, 'end') })
      const [overviewResult, distributionResult] = await Promise.all([
        apiRequest<StatsOverview>(`/api/stats/overview${range}`),
        apiRequest<StatsDistribution>(`/api/stats/distribution${toQuery({
          dimension,
          from: dayBoundary(from, 'start'),
          to: dayBoundary(to, 'end'),
        })}`),
      ])
      setOverview(overviewResult)
      setDistribution(distributionResult)
      setError(null)
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [from, to, dimension])

  useEffect(() => {
    void load()
  }, [load])

  const hotMax = Math.max(1, ...(overview?.hotCategories.map((item) => item.count) ?? [0]))
  const distributionColumns: TableProps<StatsDistribution['groups'][number]>['columns'] = [
    { title: dimension === 'company' ? '公司' : '部门', dataIndex: 'label' },
    { title: '工单量', dataIndex: 'count', width: 120 },
    {
      title: '占比',
      width: 220,
      render: (_: unknown, record) => (
        <Progress
          size="small"
          percent={distribution && distribution.total > 0 ? Math.round((record.count / distribution.total) * 1000) / 10 : 0}
          format={(percent) => `${percent ?? 0}%`}
        />
      ),
    },
  ]

  return (
    <div className="page">
      <Card size="small" className="filter-bar">
        <Space wrap size="middle">
          <span>统计时间</span>
          <Input type="date" style={{ width: 150 }} value={from} aria-label="统计开始日期" onChange={(event) => setFrom(event.target.value)} />
          <span>至</span>
          <Input type="date" style={{ width: 150 }} value={to} aria-label="统计结束日期" onChange={(event) => setTo(event.target.value)} />
          <Radio.Group
            value={dimension}
            onChange={(event) => setDimension(event.target.value as StatsDimension)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'company', label: '按公司' },
              { value: 'department', label: '按部门' },
            ]}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
        </Space>
      </Card>

      {error ? (
        <Card>
          <Alert type="error" showIcon message="加载统计数据失败" description={errorMessage(error)} action={<Button size="small" onClick={() => void load()}>重试</Button>} />
        </Card>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={6}>
              <Card loading={loading}><Statistic title="工单量" value={overview?.volume ?? 0} suffix="条" /></Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card loading={loading}><Statistic title="其中取消" value={overview?.cancelledCount ?? 0} suffix="条" valueStyle={{ color: '#8a94a6' }} /></Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card loading={loading}>
                <Statistic title="平均响应时间" value={overview ? formatMinutes(overview.avgFirstResponseMinutes) : '—'} />
                <Typography.Text type="secondary">首次回复 − 创建（分钟）</Typography.Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card loading={loading}>
                <Statistic title="满意度" value={overview ? formatScore(overview.satisfaction.average) : '—'} />
                <Typography.Text type="secondary">已评价 {overview?.satisfaction.count ?? 0} 条</Typography.Text>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Card title="热点分类（前 5）" loading={loading}>
                {overview && overview.hotCategories.length > 0 ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {overview.hotCategories.map((item) => (
                      <div key={item.categoryId}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <span>{item.name}</span>
                          <Typography.Text strong>{item.count} 条</Typography.Text>
                        </Space>
                        <Progress percent={Math.round((item.count / hotMax) * 100)} showInfo={false} />
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Empty description="统计期内暂无工单" />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={14}>
              <Card title={dimension === 'company' ? '按公司分布' : '按部门分布'} loading={loading} extra={<Typography.Text type="secondary">合计 {distribution?.total ?? 0} 条</Typography.Text>}>
                {distribution && distribution.groups.length > 0 ? (
                  <Table<StatsDistribution['groups'][number]>
                    rowKey="key"
                    size="middle"
                    columns={distributionColumns}
                    dataSource={distribution.groups}
                    pagination={false}
                  />
                ) : (
                  <Empty description="统计期内暂无工单" />
                )}
              </Card>
            </Col>
          </Row>

          <Typography.Text type="secondary">
            指标口径：工单量为统计期内创建的工单数；平均响应时间仅统计已产生首次回复的工单；满意度为已完成且已评价工单的平均分。
          </Typography.Text>
        </>
      )}
    </div>
  )
}