// 会话令牌的浏览器持久化：localStorage 不可用时退化为仅内存会话。
const TOKEN_STORAGE_KEY = 'ticket-system.session-token'

export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // 忽略持久化失败：当前会话仍可用，刷新后需重新登录
  }
}

export function clearStoredToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // 忽略清理失败
  }
}
