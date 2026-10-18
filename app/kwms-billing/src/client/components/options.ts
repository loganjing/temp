import { useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { Option } from './form'

// 下拉选项数据加载：失败时降级为空列表（筛选场景不阻塞页面）。

export function useOptionList<T>(path: string, labelOf: (item: T) => string): { options: Option[]; items: T[]; reload: () => void } {
  const [items, setItems] = useState<T[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiRequest<{ items: T[] }>(path)
      .then((result) => { if (!cancelled) setItems(result.items ?? []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [path, tick])

  return {
    items,
    options: items.map((item) => ({ value: String((item as Record<string, unknown>).id), label: labelOf(item) })),
    reload: () => setTick((value) => value + 1),
  }
}

export const nameOf = (item: Record<string, unknown>) => String(item.name ?? '')
export const codeNameOf = (item: Record<string, unknown>) => `${item.code} · ${item.name}`
