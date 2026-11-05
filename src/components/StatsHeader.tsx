import { useMemo } from 'react'
import { Statistic, Card, Row, Col } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import type { FocusRecord } from '../types'
import { formatDuration } from '../utils/time'

interface Props {
  records: FocusRecord[]
}

export function StatsHeader({ records }: Props) {
  const totalMinutes = useMemo(
    () => records.reduce((sum, r) => sum + r.durationMinutes, 0),
    [records],
  )
  const count = records.length

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={24}>
        <Col>
          <Statistic
            title="累计专注时长"
            value={formatDuration(totalMinutes)}
            prefix={<ClockCircleOutlined />}
          />
        </Col>
        <Col>
          <Statistic title="已完成番茄钟" value={count} suffix="个" />
        </Col>
      </Row>
    </Card>
  )
}
