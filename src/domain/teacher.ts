/**
 * 教师领域模型。
 *
 * 字段口径来自已批准需求 docs/wi-t1000004/requirements.md：
 * 教师名称、教授课程、年级、手机、邮箱。
 * 教授课程与年级的取值范围需求未规定，按单值自由文本处理。
 */

export interface Teacher {
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

/** 表单提交内容：不含系统生成的 id。 */
export type TeacherDraft = Omit<Teacher, 'id'>;

export type TeacherField = keyof TeacherDraft;

export type TeacherErrors = Partial<Record<TeacherField, string>>;

/** 展示与校验顺序，供表格列与表单项共用。 */
export const TEACHER_FIELD_LABELS: Record<TeacherField, string> = {
  name: '教师名称',
  course: '教授课程',
  grade: '年级',
  phone: '手机',
  email: '邮箱',
};

export const TEACHER_FIELDS: TeacherField[] = ['name', 'course', 'grade', 'phone', 'email'];

/** 中国大陆手机号基本格式：1 开头，第二位 3-9，共 11 位数字。 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/** 邮箱基本格式：本地部分 @ 域名部分，域名部分含点分后缀。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMPTY_DRAFT: TeacherDraft = {
  name: '',
  course: '',
  grade: '',
  phone: '',
  email: '',
};

/**
 * 校验教师录入内容。
 *
 * 规则来源：需求基线第 7 条（教师名称必填；手机、邮箱按基本格式校验，
 * 不满足时阻止保存并提示对应字段）。
 */
export function validateTeacher(draft: TeacherDraft): TeacherErrors {
  const errors: TeacherErrors = {};

  const name = draft.name.trim();
  if (!name) {
    errors.name = '教师名称不能为空';
  }

  const phone = draft.phone.trim();
  if (!phone) {
    errors.phone = '手机不能为空';
  } else if (!PHONE_PATTERN.test(phone)) {
    errors.phone = '手机格式不正确，请输入 11 位手机号，例如 13800000000';
  }

  const email = draft.email.trim();
  if (!email) {
    errors.email = '邮箱不能为空';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = '邮箱格式不正确，请输入形如 zhang@example.com 的邮箱';
  }

  return errors;
}

export function hasErrors(errors: TeacherErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** 统一去除首尾空白，保证列表读回的值与表单展示一致。 */
export function normalizeTeacherDraft(draft: TeacherDraft): TeacherDraft {
  return {
    name: draft.name.trim(),
    course: draft.course.trim(),
    grade: draft.grade.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
  };
}

export function teacherToDraft(teacher: Teacher): TeacherDraft {
  return {
    name: teacher.name,
    course: teacher.course,
    grade: teacher.grade,
    phone: teacher.phone,
    email: teacher.email,
  };
}

export function createTeacherId(): string {
  const globalCrypto = typeof globalThis === 'undefined' ? undefined : globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return `teacher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}