import type { ReactNode } from 'react'

export function AppProvider({ children }: { children: ReactNode }) {
  return children
}

const text = {
  intro: '工作区已就绪 / Workspace ready',
  health: '服务状态 / Server status',
  checking: '检查中 / Checking',
  ok: '正常 / Online',
  down: '未启动 / Offline',
}

export function usePlatformText() {
  return (key: keyof typeof text) => text[key]
}
