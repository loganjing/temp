import { Alert, Button, Empty, Skeleton } from 'antd'

export function TableSkeleton() {
  return <Skeleton active paragraph={{ rows: 5 }} />
}

export function ErrorView({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      message="加载失败"
      description={error.message}
      action={onRetry ? <Button size="small" onClick={onRetry}>重试</Button> : undefined}
    />
  )
}

export function EmptyView({ description, action }: { description: string; action?: React.ReactNode }) {
  return <Empty description={description}>{action}</Empty>
}
