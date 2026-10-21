/** 教师记录：字段语义与需求基线一致 */
export interface Teacher {
  /** 应用生成的唯一标识，用于编辑与删除时定位记录 */
  id: string;
  /** 教师名称 */
  name: string;
  /** 教授课程 */
  course: string;
  /** 年级 */
  grade: string;
  /** 手机 */
  phone: string;
  /** 邮箱 */
  email: string;
}

/** 新增/编辑表单提交的草稿（不含 id） */
export type TeacherDraft = Omit<Teacher, 'id'>;
