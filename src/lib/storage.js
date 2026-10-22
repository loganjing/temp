/**
 * localStorage 数据访问层
 * 提供教师记录的持久化读写能力。
 */

const STORAGE_PREFIX = 'teacher-mgmt'

/**
 * 从 localStorage 加载教师列表
 * @param {string} key - 存储键名
 * @returns {Array} 教师数组
 */
export function loadTeachers(key = `${STORAGE_PREFIX}:teachers`) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 保存教师列表到 localStorage
 * @param {string} key - 存储键名
 * @param {Array} teachers - 教师数组
 */
export function saveTeachers(key = `${STORAGE_PREFIX}:teachers`, teachers) {
  localStorage.setItem(key, JSON.stringify(teachers))
}

/**
 * 生成唯一 ID
 * @returns {string} 唯一标识
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}
