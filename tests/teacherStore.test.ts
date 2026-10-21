import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTeacher,
  deleteTeacher,
  findTeacher,
  listTeachers,
  updateTeacher,
} from '../src/store/teacherStore';
import type { TeacherDraft } from '../src/types';

const STORAGE_KEY = 'teacher-management.teachers.v1';

function draft(overrides: Partial<TeacherDraft> = {}): TeacherDraft {
  return {
    name: '张伟',
    course: '数学',
    grade: '三年级',
    phone: '13800000000',
    email: 'zhang@example.com',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('listTeachers', () => {
  it('存储为空时返回空列表', () => {
    expect(listTeachers()).toEqual([]);
  });

  it('读取已保存的教师记录并按原字段返回', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 't-1',
          name: '张伟',
          course: '数学',
          grade: '三年级',
          phone: '13800000000',
          email: 'zhang@example.com',
        },
      ]),
    );
    const teachers = listTeachers();
    expect(teachers).toHaveLength(1);
    expect(teachers[0]).toEqual({
      id: 't-1',
      name: '张伟',
      course: '数学',
      grade: '三年级',
      phone: '13800000000',
      email: 'zhang@example.com',
    });
  });

  it('存储内容不是合法 JSON 时按空列表处理，不抛出异常', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{');
    expect(() => listTeachers()).not.toThrow();
    expect(listTeachers()).toEqual([]);
  });

  it('存储内容不是数组时按空列表处理', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '张伟' }));
    expect(listTeachers()).toEqual([]);
  });

  it('数组中字段缺失或类型不符的记录被忽略，其余记录正常返回', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 't-1',
          name: '张伟',
          course: '数学',
          grade: '三年级',
          phone: '13800000000',
          email: 'zhang@example.com',
        },
        { id: 't-2', name: 123, course: '数学', grade: '三年级', phone: '138', email: 'a@b.c' },
        'junk',
        null,
      ]),
    );
    const teachers = listTeachers();
    expect(teachers).toHaveLength(1);
    expect(teachers[0].id).toBe('t-1');
  });
});

describe('createTeacher', () => {
  it('新增记录并生成 id，写入后可再次读回', () => {
    const created = createTeacher(draft());
    expect(created.id).not.toBe('');
    const all = listTeachers();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(created);
    expect(findTeacher(created.id)).toEqual(created);
  });

  it('连续新增多条记录，读取时全部可见且顺序稳定、id 唯一', () => {
    createTeacher(draft());
    createTeacher(draft({ name: '李娜' }));
    const all = listTeachers();
    expect(all.map((teacher) => teacher.name)).toEqual(['张伟', '李娜']);
    expect(new Set(all.map((teacher) => teacher.id)).size).toBe(2);
  });
});

describe('updateTeacher', () => {
  it('修改已存在教师的手机字段，读回为新值且其余字段不变', () => {
    const created = createTeacher(draft());
    const updated = updateTeacher(created.id, draft({ phone: '13900000000' }));
    expect(updated).not.toBeNull();
    const reloaded = findTeacher(created.id);
    expect(reloaded?.phone).toBe('13900000000');
    expect(reloaded?.name).toBe('张伟');
    expect(reloaded?.course).toBe('数学');
    expect(reloaded?.grade).toBe('三年级');
    expect(reloaded?.email).toBe('zhang@example.com');
    expect(listTeachers()).toHaveLength(1);
  });

  it('教师不存在时返回 null 且不改变存储', () => {
    createTeacher(draft());
    const before = listTeachers();
    expect(updateTeacher('missing-id', draft())).toBeNull();
    expect(listTeachers()).toEqual(before);
  });
});

describe('deleteTeacher', () => {
  it('删除教师后列表与单条查询均不再出现该记录', () => {
    const created = createTeacher(draft());
    expect(deleteTeacher(created.id)).toBe(true);
    expect(listTeachers()).toEqual([]);
    expect(findTeacher(created.id)).toBeNull();
  });

  it('删除不存在的教师返回 false 且不改变存储', () => {
    createTeacher(draft());
    const before = listTeachers();
    expect(deleteTeacher('missing-id')).toBe(false);
    expect(listTeachers()).toEqual(before);
  });

  it('删除一条记录不影响其他记录', () => {
    const first = createTeacher(draft());
    const second = createTeacher(draft({ name: '李娜' }));
    expect(deleteTeacher(first.id)).toBe(true);
    const all = listTeachers();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(second.id);
  });
});
