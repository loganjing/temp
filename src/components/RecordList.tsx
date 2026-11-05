import { Card, Empty, List, Tag, Typography } from 'antd'
import type { FocusRecord } from '../types'
import { formatTimeOfDay } from '../utils/time'

interface Props {
  records: FocusRecord[]
}

export function RecordList({ records }: Props) {
  return (
    <Card
      size="small"
      title={<Typography.Text strong>当日记录</Typography.Text>}
      style={{ marginBottom: 16 }}
    >
      {records.length === 0 ? (
        <Empty description="暂无专注记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={records}
          renderItem={(record, index) => (
            <List.Item>
              <List.Item.Meta
                avatar={<Tag color="red">#{index + 1}</Tag>}
                title={`完成于 ${formatTimeOfDay(record.completedAt)}`}
                description={`专注时长 ${record.durationMinutes} 分钟`}
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}
