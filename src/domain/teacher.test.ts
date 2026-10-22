import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  Teacher,
  createTeacherId,
  hasErrors,
  normalizeTeacherDraft,
  teacherToDraft,
  validateTeacher,
} from './teacher';

const validDraft = {
  name: '张老师',
  course: '数学',
  grade: '三年级',
  phone: '13800000000',
  email: 'zhang@example.com',
};

describe('validateTeacher', () => {
  it('五个字段合法时无错误', () => {
    expect(validateTeacher(validDraft)).toEqual({});
    expect(hasErrors(validateTeacher(validDraft))).toBe(false);
  });

  it('教师名称为空时提示该字段（含纯空白）', () => {
    expect(validateTeacher({ ...validDraft, name: '' }).name).toBe('教师名称不能为空');
    expect(validateTeacher({ ...validDraft, name: '   ' }).name).toBe('教师名称不能为空');
  });

  it('手机号不符合基本格式时提示该字段', () => {
    for (const phone of ['123', 'abcdefghijk', '23800000000', '1380000000']) {
      const errors = validateTeacher({ ...validDraft, phone });
      expect(errors.phone, `手机号 ${phone} 应被拒绝`).toBeTruthy();
      expect(errors.name).toBeUndefined();
    }
  });

  it('邮箱不符合基本格式时提示该字段', () => {
    for (const email of ['abc', 'abc@', '@example.com', 'abc@example']) {
      const errors = validateTeacher({ ...validDraft, email });
      expect(errors.email, `邮箱 ${email} 应被拒绝`).toBeTruthy();
      expect(errors.name).toBeUndefined();
    }
  });

  it('手机、邮箱为空时阻止保存并提示对应字段', () => {
    const errors = validateTeacher({ ...EMPTY_DRAFT, name: '张老师' });
    expect(errors.phone).toBe('手机不能为空');
    expect(errors.email).toBe('邮箱不能为空');
  });

  it('同时存在多处非法输入时一次性给出全部字段错误', () => {
    const errors = validateTeacher({ name: '', course: '数学', grade: '三年级', phone: '123', email: 'abc' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'phone']);
  });

  it('允许课程、年级为空（需求未规定其必填）', () => {
    const errors = validateTeacher({ ...validDraft, course: '', grade: '' });
    expect(errors).toEqual({});
  });

  it('接受带首尾空白的合法输入', () => {
    const errors = validateTeacher({ ...validDraft, name: ' 张老师 ', phone: ' 13800000000 ', email: ' zhang@example.com ' });
    expect(errors).toEqual({});
  });
});

describe('normalizeTeacherDraft', () => {
  it('去除五个字段的首尾空白', () => {
    expect(
      normalizeTeacherDraft({
        name: ' 张老师 ',
        course: ' 数学 ',
        grade: ' 三年级 ',
        phone: ' 13800000000 ',
        email: ' zhang@example.com ',
      }),
    ).toEqual(validDraft);
  });
});

describe('teacherToDraft', () => {
  it('编辑载入时完整保留五个字段，不带上 id', () => {
    const teacher: Teacher = { id: 't-1', ...validDraft };
    expect(teacherToDraft(teacher)).toEqual(validDraft);
  });
});

describe('createTeacherId', () => {
  it('生成的 id 非空且互不相同', () => {
    const first = createTeacherId();
    const second = createTeacherId();
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });
});