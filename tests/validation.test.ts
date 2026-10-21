import { describe, expect, it } from 'vitest';
import { normalizeTeacherDraft, validateTeacherDraft } from '../src/validation';
import type { TeacherDraft } from '../src/types';

function input(overrides: Partial<TeacherDraft> = {}): TeacherDraft {
  return {
    name: '张伟',
    course: '数学',
    grade: '三年级',
    phone: '13800000000',
    email: 'zhang@example.com',
    ...overrides,
  };
}

describe('normalizeTeacherDraft', () => {
  it('去除各字段首尾空白', () => {
    expect(
      normalizeTeacherDraft({
        name: '  张伟 ',
        course: ' 数学\t',
        grade: '\n三年级',
        phone: ' 13800000000 ',
        email: ' zhang@example.com ',
      }),
    ).toEqual({
      name: '张伟',
      course: '数学',
      grade: '三年级',
      phone: '13800000000',
      email: 'zhang@example.com',
    });
  });
});

describe('validateTeacherDraft', () => {
  it('全部字段合法时校验通过，返回去空白后的草稿', () => {
    const { draft, errors } = validateTeacherDraft(input());
    expect(errors).toEqual({});
    expect(draft).toEqual(input());
  });

  it('教师名称为空白时报必填错误', () => {
    const { errors } = validateTeacherDraft(input({ name: '   ' }));
    expect(errors.name).toBeDefined();
  });

  it('手机填写但格式不正确时提示，其他字段不误报', () => {
    const { errors } = validateTeacherDraft(input({ phone: 'abc123' }));
    expect(errors.phone).toBeDefined();
    expect(errors.name).toBeUndefined();
    expect(errors.email).toBeUndefined();
  });

  it('手机为空时不报格式错误（提示性校验不强制必填）', () => {
    const { errors } = validateTeacherDraft(input({ phone: '' }));
    expect(errors.phone).toBeUndefined();
  });

  it('常见手机号格式通过校验', () => {
    expect(validateTeacherDraft(input({ phone: '13800000000' })).errors.phone).toBeUndefined();
    expect(validateTeacherDraft(input({ phone: '+8613800000000' })).errors.phone).toBeUndefined();
  });

  it('手机含字母或符号时不通过', () => {
    expect(validateTeacherDraft(input({ phone: '138-0000-0000' })).errors.phone).toBeDefined();
    expect(validateTeacherDraft(input({ phone: '1380000000a' })).errors.phone).toBeDefined();
  });

  it('邮箱填写但格式不正确时提示', () => {
    const { errors } = validateTeacherDraft(input({ email: 'not-an-email' }));
    expect(errors.email).toBeDefined();
  });

  it('邮箱为空时不报格式错误', () => {
    const { errors } = validateTeacherDraft(input({ email: '' }));
    expect(errors.email).toBeUndefined();
  });

  it('合法邮箱通过校验', () => {
    expect(
      validateTeacherDraft(input({ email: 'zhang.wei@example.com' })).errors.email,
    ).toBeUndefined();
  });

  it('多个错误同时报告', () => {
    const { errors } = validateTeacherDraft(
      input({ name: ' ', phone: 'bad', email: 'bad@' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'phone']);
  });
});
