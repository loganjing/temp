export const TEACHER_STORAGE_KEY = 'k01-teacher:teachers:v1'

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  throw new Error('当前环境不支持本地存储，无法读取教师数据')
}

function normalizeValues(values) {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
}

export function normalizeTeacher(record = {}) {
  return {
    id: typeof record.id === 'string' ? record.id : '',
    name: typeof record.name === 'string' ? record.name.trim() : '',
    courses: normalizeValues(record.courses),
    grades: normalizeValues(record.grades),
    mobile: typeof record.mobile === 'string' ? record.mobile.trim() : '',
    email: typeof record.email === 'string' ? record.email.trim() : '',
  }
}

export function createTeacherId() {
  const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }
  return `teacher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function readTeachers(storage) {
  const target = resolveStorage(storage)
  const raw = target.getItem(TEACHER_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((record) => normalizeTeacher(record))
      .filter((record) => record.id && record.name)
  } catch {
    return []
  }
}

export function writeTeachers(teachers, storage) {
  const target = resolveStorage(storage)
  const normalized = (Array.isArray(teachers) ? teachers : []).map((record) => normalizeTeacher(record))
  target.setItem(TEACHER_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function addTeacher(input, storage) {
  const teachers = readTeachers(storage)
  const teacher = { ...normalizeTeacher(input), id: createTeacherId() }
  writeTeachers([...teachers, teacher], storage)
  return teacher
}

export function updateTeacher(id, input, storage) {
  const teachers = readTeachers(storage)
  let updated = null
  const next = teachers.map((teacher) => {
    if (teacher.id !== id) return teacher
    updated = { ...normalizeTeacher(input), id: teacher.id }
    return updated
  })
  if (!updated) return null
  writeTeachers(next, storage)
  return updated
}

export function deleteTeacher(id, storage) {
  const teachers = readTeachers(storage)
  const next = teachers.filter((teacher) => teacher.id !== id)
  if (next.length === teachers.length) return false
  writeTeachers(next, storage)
  return true
}

export function findTeacher(id, storage) {
  return readTeachers(storage).find((teacher) => teacher.id === id) ?? null
}