import { useState, useCallback } from 'react'

const STORAGE_KEY = 'teachers_db'

function loadTeachers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveTeachers(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function useTeachers() {
  const [teachers, setTeachers] = useState(loadTeachers)

  const persist = useCallback((next) => {
    setTeachers(next)
    saveTeachers(next)
  }, [])

  const addTeacher = useCallback((data) => {
    const teacher = { id: generateId(), ...data }
    persist((prev) => [...prev, teacher])
    return teacher
  }, [persist])

  const updateTeacher = useCallback((id, data) => {
    persist((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...data } : t))
    )
  }, [persist])

  const deleteTeacher = useCallback((id) => {
    persist((prev) => prev.filter((t) => t.id !== id))
  }, [persist])

  return { teachers, addTeacher, updateTeacher, deleteTeacher }
}
