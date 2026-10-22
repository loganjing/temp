import { describe, it, expect, beforeEach } from 'vitest'
import { loadTeachers, saveTeachers, generateId } from '../src/lib/storage.js'

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadTeachers', () => {
    it('无数据时返回空数组', () => {
      const result = loadTeachers('test-key')
      expect(result).toEqual([])
    })

    it('正确加载已存储的教师数组', () => {
      const teachers = [
        { id: '1', teacherName: '张老师', course: '数学', grade: '三年级', phone: '13800138000', email: 'zhang@example.com' },
        { id: '2', teacherName: '李老师', course: '语文', grade: '二年级', phone: '13900139000', email: 'li@example.com' },
      ]
      localStorage.setItem('test-key', JSON.stringify(teachers))
      const result = loadTeachers('test-key')
      expect(result).toEqual(teachers)
      expect(result).toHaveLength(2)
    })

    it('存储数据非数组时返回空数组', () => {
      localStorage.setItem('test-key', JSON.stringify({ not: 'array' }))
      const result = loadTeachers('test-key')
      expect(result).toEqual([])
    })

    it('存储数据格式损坏时返回空数组', () => {
      localStorage.setItem('test-key', 'not-json')
      const result = loadTeachers('test-key')
      expect(result).toEqual([])
    })
  })

  describe('saveTeachers', () => {
    it('保存后可重新加载', () => {
      const teachers = [
        { id: '1', teacherName: '张老师', course: '数学', grade: '三年级', phone: '13800138000', email: 'zhang@example.com' },
      ]
      saveTeachers('test-key', teachers)
      const loaded = loadTeachers('test-key')
      expect(loaded).toEqual(teachers)
    })

    it('保存空数组后清空数据', () => {
      const teachers = [{ id: '1', teacherName: '张老师' }]
      saveTeachers('test-key', teachers)
      saveTeachers('test-key', [])
      const loaded = loadTeachers('test-key')
      expect(loaded).toEqual([])
    })
  })

  describe('generateId', () => {
    it('生成非空字符串', () => {
      const id = generateId()
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(5)
    })

    it('多次生成返回不同值', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(generateId())
      }
      expect(ids.size).toBe(100)
    })
  })
})
