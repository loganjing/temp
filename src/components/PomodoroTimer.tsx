import { Button, Card, Progress, Space, Tag, Typography } from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { PomodoroPhase } from '../types'
import { formatClock } from '../utils/time'

interface Props {
  phase: PomodoroPhase
  remainingSeconds: number
  running: boolean
  focusSeconds: number
  restSeconds: number
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
}

const phaseLabel: Record<PomodoroPhase, string> = {
  idle: '待开始',
  focusing: '专注中',
  resting: '休息中',
}

const phaseColor: Record<PomodoroPhase, string> = {
  idle: 'default',
  focusing: 'red',
  resting: 'green',
}

export function PomodoroTimer({
  phase,
  remainingSeconds,
  running,
  focusSeconds,
  restSeconds,
  onStart,
  onPause,
  onResume,
  onReset,
}: Props) {
  const total =
    phase === 'resting' ? Math.max(restSeconds, 1) : Math.max(focusSeconds, 1)
  const percent = Math.min(100, Math.round(((total - remainingSeconds) / total) * 100))

  return (
    <Card size="small" style={{ marginBottom: 16, textAlign: 'center' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Tag color={phaseColor[phase]} style={{ fontSize: 14, padding: '2px 12px' }}>
          {phaseLabel[phase]}
        </Tag>
        <Typography.Title
          level={1}
          style={{ margin: 0, fontFamily: 'Menlo, Consolas, monospace', fontSize: 72 }}
        >
          {formatClock(remainingSeconds)}
        </Typography.Title>
        <Progress
          percent={percent}
          showInfo={false}
          strokeColor={phase === 'resting' ? '#52c41a' : '#ff4d4f'}
          status={phase === 'resting' ? 'success' : 'active'}
        />
        <Space size="middle" style={{ justifyContent: 'center' }}>
          {phase === 'idle' && (
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={onStart}
            >
              开始专注
            </Button>
          )}
          {phase === 'focusing' && running && (
            <Button size="large" icon={<PauseCircleOutlined />} onClick={onPause}>
              暂停
            </Button>
          )}
          {phase === 'focusing' && !running && (
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={onResume}
            >
              恢复
            </Button>
          )}
          {phase === 'resting' && (
            <Button size="large" icon={<ReloadOutlined />} onClick={onReset}>
              跳过休息
            </Button>
          )}
          {phase !== 'idle' && (
            <Button size="large" icon={<ReloadOutlined />} onClick={onReset}>
              重置
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  )
}
