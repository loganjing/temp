import type { ReactNode } from 'react'

export function MasterDetail({ master, detail }: { master: ReactNode; detail: ReactNode }) {
  return (
    <div className="md-layout">
      <div className="md-master">{master}</div>
      <div className="md-detail">{detail}</div>
    </div>
  )
}

export function MasterItem({
  active,
  title,
  meta,
  onClick,
}: {
  active: boolean
  title: ReactNode
  meta?: ReactNode
  onClick: () => void
}) {
  return (
    <div className={`md-item${active ? ' active' : ''}`} onClick={onClick}>
      <div className="md-item-title">{title}</div>
      {meta && <div className="md-item-meta">{meta}</div>}
    </div>
  )
}
