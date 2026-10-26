import { describe, it, expect, beforeEach, vi } from 'vitest'

// We test App component logic indirectly through the storage/fields modules
// since they form the core CRUD call chain. Component render tests would
// require jsdom setup; the unit tests cover the business logic layer.

describe('CRUD integration via storage modules', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('full create-read-update-delete cycle', async () => {
    const { createTeacher, loadTeachers, updateTeacher, deleteTeacher, getTeacherById } =
      await import('../src/lib/storage.js')

    // Create
    const t1 = createTeacher({
      name: '测试老师',
      course: '英语',
      grade: '初一',
      phone: '13800000000',
      email: 'test@example.com',
    })
    expect(loadTeachers()).toHaveLength(1)

    // Read back
    const fetched = getTeacherById(t1.id)
    expect(fetched.name).toBe('测试老师')
    expect(fetched.course).toBe('英语')
    expect(fetched.grade).toBe('初一')
    expect(fetched.phone).toBe('13800000000')
    expect(fetched.email).toBe('test@example.com')

    // Update
    updateTeacher(t1.id, { name: '改名老师', grade: '初二' })
    const updated = getTeacherById(t1.id)
    expect(updated.name).toBe('改名老师')
    expect(updated.grade).toBe('初二')
    expect(updated.course).toBe('英语') // unchanged

    // Delete
    deleteTeacher(t1.id)
    expect(loadTeachers()).toHaveLength(0)
    expect(getTeacherById(t1.id)).toBeNull()
  })
})
