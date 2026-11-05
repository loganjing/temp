import { Button, Result, Spin } from 'antd'
import type { ReactNode } from 'react'

export function LoadingView({ tip = '加载中…' }: { tip?: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Spin tip={tip} size="large" />
    </div>
  )
}

export function ErrorView({
  message,
  onRetry,
  status = 'error',
}: {
  message: string
  onRetry?: () => void
  status?: 'error' | '403' | '404' | 'warning'
}) {
  return (
    <Result
      status={status}
      title={status === '403' ? '无权限' : status === '404' ? '未找到' : '出错了'}
      subTitle={message}
      extra={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
    />
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>{children}</div>
}
