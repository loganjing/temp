const STORAGE_KEY = 'teacher-management:teachers'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadTeachers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTeachers(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

export function createTeacher(data) {
  const teachers = loadTeachers()
  const newTeacher = { id: generateId(), ...data }
  teachers.push(newTeacher)
  saveTeachers(teachers)
  return newTeacher
}

export function updateTeacher(id, data) {
  const teachers = loadTeachers()
  const index = teachers.findIndex((t) => t.id === id)
  if (index === -1) return null
  teachers[index] = { ...teachers[index], ...data, id }
  saveTeachers(teachers)
  return teachers[index]
}

export function deleteTeacher(id) {
  const teachers = loadTeachers()
  const filtered = teachers.filter((t) => t.id !== id)
  saveTeachers(filtered)
  return filtered
}

export function getTeacherById(id) {
  const teachers = loadTeachers()
  return teachers.find((t) => t.id === id) || null
}
