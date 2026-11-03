import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'teachers'

/**
 * 生成唯一标识
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * 从 localStorage 读取教师列表
 * @returns {Array}
 */
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

/**
 * 将教师列表写入 localStorage
 * @param {Array} teachers
 */
function saveTeachers(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

/**
 * 教师增删改查 Hook
 * 数据持久化于浏览器 localStorage
 */
export function useTeachers() {
  const [teachers, setTeachers] = useState(loadTeachers)

  useEffect(() => {
    saveTeachers(teachers)
  }, [teachers])

  const addTeacher = useCallback((data) => {
    const teacher = {
      id: generateId(),
      name: data.name.trim(),
      course: (data.course || '').trim(),
      grade: (data.grade || '').trim(),
      phone: (data.phone || '').trim(),
      email: (data.email || '').trim(),
    }
    setTeachers((prev) => [...prev, teacher])
    return teacher
  }, [])

  const updateTeacher = useCallback((id, data) => {
    setTeachers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              name: data.name.trim(),
              course: (data.course || '').trim(),
              grade: (data.grade || '').trim(),
              phone: (data.phone || '').trim(),
              email: (data.email || '').trim(),
            }
          : t,
      ),
    )
  }, [])

  const deleteTeacher = useCallback((id) => {
    setTeachers((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { teachers, addTeacher, updateTeacher, deleteTeacher }
}
