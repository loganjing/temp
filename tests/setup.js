/**
 * Vitest 测试环境初始化
 * 在 Node.js 环境中提供 localStorage 的最小模拟实现
 */

class LocalStorageMock {
  constructor() {
    this.store = {}
  }

  clear() {
    this.store = {}
  }

  getItem(key) {
    return this.store[key] ?? null
  }

  setItem(key, value) {
    this.store[key] = String(value)
  }

  removeItem(key) {
    delete this.store[key]
  }

  key(index) {
    const keys = Object.keys(this.store)
    return keys[index] ?? null
  }

  get length() {
    return Object.keys(this.store).length
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true,
  })
}
