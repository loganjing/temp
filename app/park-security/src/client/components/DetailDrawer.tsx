import { Drawer, Descriptions } from 'antd'
import type { ReactNode } from 'react'

interface DetailDrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Shared master-detail detail panel used across list pages. */
export function DetailDrawer({ open, title, onClose, children }: DetailDrawerProps) {
  return (
    <Drawer open={open} title={title} onClose={onClose} width={480} destroyOnClose>
      {children}
    </Drawer>
  )
}

export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Descriptions.Item label={label}>{children}</Descriptions.Item>
  )
}
