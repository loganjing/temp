const STORAGE_KEY = 'jlg-teachers'

function isValidTeacher(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.name === 'string' &&
    typeof item.course === 'string' &&
    typeof item.grade === 'string' &&
    typeof item.phone === 'string' &&
    typeof item.email === 'string'
  )
}

export function loadTeachers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidTeacher)
  } catch (e) {
    console.error('Failed to load teachers from localStorage:', e)
    return []
  }
}

export function saveTeachers(teachers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
    return true
  } catch (e) {
    console.error('Failed to save teachers to localStorage:', e)
    return false
  }
}
