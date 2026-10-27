/** 教师记录类型定义 */
export interface Teacher {
  id: string
  name: string
  course: string
  grade: string
  phone: string
  email: string
}

/** 表单字段类型（不含 id） */
export type TeacherFormData = Omit<Teacher, 'id'>
