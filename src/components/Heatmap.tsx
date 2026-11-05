import { useMemo } from 'react'
import { Card, Tooltip, Typography } from 'antd'
import type { FocusRecord } from '../types'
import { HALF_HOUR_SLOTS, slotIndexFromDate, slotLabel } from '../utils/time'

interface Props {
  records: FocusRecord[]
}

/** 根据该时段专注次数返回强度（0-4 级）与背景色 */
function intensityFor(count: number): { level: number; color: string } {
  if (count <= 0) return { level: 0, color: '#f0f0f0' }
  if (count === 1) return { level: 1, color: '#ffccc7' }
  if (count === 2) return { level: 2, color: '#ffa39e' }
  if (count === 3) return { level: 3, color: '#ff7875' }
  return { level: 4, color: '#d4380d' }
}

export function Heatmap({ records }: Props) {
  const slotCounts = useMemo(() => {
    const counts = new Array<number>(HALF_HOUR_SLOTS).fill(0)
    for (const r of records) {
      const idx = slotIndexFromDate(new Date(r.completedAt))
      if (idx >= 0 && idx < HALF_HOUR_SLOTS) counts[idx] += 1
    }
    return counts
  }, [records])

  const maxCount = useMemo(
    () => slotCounts.reduce((max, c) => Math.max(max, c), 0),
    [slotCounts],
  )

  return (
    <Card
      size="small"
      title={<Typography.Text strong>当日专注热力图</Typography.Text>}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: 4,
        }}
      >
        {slotCounts.map((count, idx) => {
          const { color, level } = intensityFor(count)
          return (
            <Tooltip
              key={idx}
              title={`${slotLabel(idx)} - ${slotLabel(idx + 1 < HALF_HOUR_SLOTS ? idx + 1 : idx)} · ${count} 次`}
            >
              <div
                style={{
                  aspectRatio: '1 / 1',
                  backgroundColor: color,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: level >= 3 ? '#fff' : '#000',
                  cursor: 'default',
                }}
              >
                {count > 0 ? count : ''}
              </div>
            </Tooltip>
          )
        })}
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#888' }}>
        <span>少</span>
        {[0, 1, 2, 3, 4].map((lvl) => {
          const { color } = intensityFor(lvl)
          return (
            <div
              key={lvl}
              style={{
                width: 14,
                height: 14,
                backgroundColor: color,
                borderRadius: 2,
              }}
            />
          )
        })}
        <span>多</span>
        {maxCount === 0 && (
          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
            暂无专注记录
          </Typography.Text>
        )}
      </div>
    </Card>
  )
}
