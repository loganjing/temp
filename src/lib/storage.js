/**
 * 教师数据 localStorage 读写模块
 * 提供 getTeachers, saveTeacher, updateTeacher, deleteTeacher 方法
 */

const STORAGE_KEY = 'teachers'

/**
 * 读取全部教师记录
 * @returns {Array<{id:string,name:string,course:string,grade:string,phone:string,email:string}>}
 */
export function getTeachers() {
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

/**
 * 保存（新增）一条教师记录
 * @param {{name:string,course:string,grade:string,phone:string,email:string}} teacher
 * @returns {object} 保存后的教师记录（含生成的 id）
 */
export function saveTeacher(teacher) {
  const teachers = getTeachers()
  const newTeacher = {
    id: generateId(),
    ...teacher
  }
  teachers.push(newTeacher)
  persist(teachers)
  return newTeacher
}

/**
 * 更新一条已有教师记录
 * @param {string} id
 * @param {{name:string,course:string,grade:string,phone:string,email:string}} updates
 * @returns {object|null} 更新后的教师记录，未找到时返回 null
 */
export function updateTeacher(id, updates) {
  const teachers = getTeachers()
  const index = teachers.findIndex(t => t.id === id)
  if (index === -1) return null
  teachers[index] = { ...teachers[index], ...updates, id }
  persist(teachers)
  return teachers[index]
}

/**
 * 删除一条教师记录
 * @param {string} id
 * @returns {boolean} 是否删除成功
 */
export function deleteTeacher(id) {
  const teachers = getTeachers()
  const filtered = teachers.filter(t => t.id !== id)
  if (filtered.length === teachers.length) return false
  persist(filtered)
  return true
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * 持久化到 localStorage
 */
function persist(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}
