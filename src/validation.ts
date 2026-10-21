import type { TeacherDraft } from './types';

export type TeacherFieldErrors = Partial<Record<keyof TeacherDraft, string>>;

export interface TeacherValidationResult {
  /** 去除首尾空白后的草稿，写入时以该值为准 */
  draft: TeacherDraft;
  /** 校验错误；为空对象表示校验通过 */
  errors: TeacherFieldErrors;
}

/** 基本手机号格式：可选国际区号前缀 “+” 加 6-20 位数字 */
const PHONE_PATTERN = /^\+?\d{6,20}$/;

/** 基本邮箱格式：本地部分 + “@” + 域名（含至少一个 “.”） */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 去除各字段首尾空白（需求基线：课程、年级不做强制约束，仅去空白保存） */
export function normalizeTeacherDraft(input: TeacherDraft): TeacherDraft {
  return {
    name: input.name.trim(),
    course: input.course.trim(),
    grade: input.grade.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
  };
}

/**
 * 表单提交前校验：
 * - 教师名称必填（空白视为空）；
 * - 手机、邮箱为提示性格式校验（填写了才校验，为空不报错）；
 * - 校验失败时表单内提示，不执行写入。
 */
export function validateTeacherDraft(input: TeacherDraft): TeacherValidationResult {
  const draft = normalizeTeacherDraft(input);
  const errors: TeacherFieldErrors = {};

  if (draft.name === '') {
    errors.name = '请填写教师名称';
  }
  if (draft.phone !== '' && !PHONE_PATTERN.test(draft.phone)) {
    errors.phone = '手机号格式不正确，应为数字（可含 “+” 前缀），长度 6-20 位';
  }
  if (draft.email !== '' && !EMAIL_PATTERN.test(draft.email)) {
    errors.email = '邮箱格式不正确，应形如 name@example.com';
  }

  return { draft, errors };
}
