import type { Teacher, TeacherFormData } from './types'

const STORAGE_KEY = 'teachers'

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

/** 从 localStorage 读取全部教师记录 */
export function loadTeachers(): Teacher[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as Teacher[]
  } catch {
    return []
  }
}

/** 将教师记录数组写入 localStorage */
function saveTeachers(teachers: Teacher[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

/** 新增教师：生成唯一 id 并追加到存储 */
export function addTeacher(data: TeacherFormData): Teacher {
  const teachers = loadTeachers()
  const newTeacher: Teacher = { id: generateId(), ...data }
  teachers.push(newTeacher)
  saveTeachers(teachers)
  return newTeacher
}

/** 编辑教师：根据 id 定位记录并更新字段 */
export function updateTeacher(id: string, data: TeacherFormData): Teacher | null {
  const teachers = loadTeachers()
  const index = teachers.findIndex((t) => t.id === id)
  if (index === -1) return null
  const updated: Teacher = { id, ...data }
  teachers[index] = updated
  saveTeachers(teachers)
  return updated
}

/** 删除教师：根据 id 从数组中移除 */
export function deleteTeacher(id: string): boolean {
  const teachers = loadTeachers()
  const filtered = teachers.filter((t) => t.id !== id)
  if (filtered.length === teachers.length) return false
  saveTeachers(filtered)
  return true
}
