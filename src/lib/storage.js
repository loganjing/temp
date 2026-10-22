const STORAGE_KEY = 'teacher-mgmt:teachers'

export function loadTeachers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function saveTeachers(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

export function addTeacher(teacher) {
  const teachers = loadTeachers()
  const newTeacher = { ...teacher, id: crypto.randomUUID() }
  teachers.push(newTeacher)
  saveTeachers(teachers)
  return newTeacher
}

export function updateTeacher(id, updates) {
  const teachers = loadTeachers()
  const idx = teachers.findIndex(t => t.id === id)
  if (idx === -1) return null
  teachers[idx] = { ...teachers[idx], ...updates, id }
  saveTeachers(teachers)
  return teachers[idx]
}

export function deleteTeacher(id) {
  const teachers = loadTeachers()
  const filtered = teachers.filter(t => t.id !== id)
  saveTeachers(filtered)
  return filtered.length < teachers.length
}
