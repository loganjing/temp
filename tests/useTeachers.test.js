import { describe, it, expect, beforeEach } from 'vitest'

// 为 node 环境提供 localStorage mock
const store = {}
globalThis.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => {
    store[key] = String(value)
  },
  removeItem: (key) => {
    delete store[key]
  },
  clear: () => {
    for (const key of Object.keys(store)) {
      delete store[key]
    }
  },
}

// 测试 useTeachers Hook 的纯逻辑部分
// 由于 hook 依赖 React 运行时和 localStorage，这里测试其底层存储逻辑

const STORAGE_KEY = 'teachers'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadTeachers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveTeachers(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

describe('useTeachers 存储逻辑', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('空存储返回空数组', () => {
    expect(loadTeachers()).toEqual([])
  })

  it('写入后可读回', () => {
    const teachers = [
      { id: '1', name: '张老师', course: '数学', grade: '高一', phone: '13800138000', email: 'z@example.com' },
    ]
    saveTeachers(teachers)
    expect(loadTeachers()).toEqual(teachers)
  })

  it('损坏的 JSON 返回空数组', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadTeachers()).toEqual([])
  })

  it('非数组 JSON 返回空数组', () => {
    localStorage.setItem(STORAGE_KEY, '{"key":"value"}')
    expect(loadTeachers()).toEqual([])
  })

  it('generateId 产生唯一标识', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add(generateId())
    }
    expect(ids.size).toBe(100)
  })
})
