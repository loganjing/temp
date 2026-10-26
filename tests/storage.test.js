import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadTeachers,
  saveTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeacherById,
} from '../src/lib/storage.js'

beforeEach(() => {
  localStorage.clear()
})

describe('storage - createTeacher', () => {
  it('creates a teacher record and persists to localStorage', () => {
    const data = {
      name: '张老师',
      course: '数学',
      grade: '高一',
      phone: '13800000001',
      email: 'zhang@example.com',
    }
    const result = createTeacher(data)
    expect(result.id).toBeTruthy()
    expect(result.name).toBe('张老师')
    expect(result.course).toBe('数学')
    expect(result.grade).toBe('高一')
    expect(result.phone).toBe('13800000001')
    expect(result.email).toBe('zhang@example.com')

    const all = loadTeachers()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('张老师')
  })
})

describe('storage - updateTeacher', () => {
  it('updates an existing teacher record and persists changes', () => {
    const created = createTeacher({
      name: '李老师',
      course: '物理',
      grade: '高二',
      phone: '13800000002',
      email: 'li@example.com',
    })
    const updated = updateTeacher(created.id, {
      name: '李老师改',
      phone: '13900000002',
    })
    expect(updated.name).toBe('李老师改')
    expect(updated.phone).toBe('13900000002')
    expect(updated.course).toBe('物理')
    expect(updated.grade).toBe('高二')
    expect(updated.email).toBe('li@example.com')

    const fetched = getTeacherById(created.id)
    expect(fetched.name).toBe('李老师改')
    expect(fetched.phone).toBe('13900000002')
  })

  it('returns null when updating a non-existent teacher', () => {
    const result = updateTeacher('nonexistent-id', { name: 'X' })
    expect(result).toBeNull()
  })
})

describe('storage - deleteTeacher', () => {
  it('removes a teacher record so it no longer appears in the list', () => {
    const created = createTeacher({
      name: '王老师',
      course: '化学',
      grade: '高三',
      phone: '13800000003',
      email: 'wang@example.com',
    })
    expect(loadTeachers()).toHaveLength(1)
    deleteTeacher(created.id)
    expect(loadTeachers()).toHaveLength(0)
    expect(getTeacherById(created.id)).toBeNull()
  })
})

describe('storage - loadTeachers with empty or corrupted data', () => {
  it('returns empty array when no data exists', () => {
    expect(loadTeachers()).toEqual([])
  })

  it('returns empty array when localStorage has invalid JSON', () => {
    localStorage.setItem('teacher-management:teachers', 'not-json')
    expect(loadTeachers()).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem('teacher-management:teachers', JSON.stringify({ a: 1 }))
    expect(loadTeachers()).toEqual([])
  })
})

describe('storage - saveTeachers', () => {
  it('persists an array of teachers that can be loaded back', () => {
    const teachers = [
      { id: 'a', name: 'A', course: 'C1', grade: 'G1', phone: '1', email: 'a@e.com' },
      { id: 'b', name: 'B', course: 'C2', grade: 'G2', phone: '2', email: 'b@e.com' },
    ]
    saveTeachers(teachers)
    expect(loadTeachers()).toEqual(teachers)
  })
})
