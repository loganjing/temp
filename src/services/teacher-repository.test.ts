import { beforeEach, describe, expect, it } from 'vitest';
import { Teacher } from '../domain/teacher';
import {
  KeyValueStorage,
  TEACHER_STORAGE_KEY,
  addTeacher,
  loadTeachers,
  removeTeacher,
  saveTeachers,
  updateTeacher,
} from './teacher-repository';

class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();

  constructor(seed?: string) {
    if (seed !== undefined) {
      this.map.set(TEACHER_STORAGE_KEY, seed);
    }
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const draft = {
  name: '张老师',
  course: '数学',
  grade: '三年级',
  phone: '13800000000',
  email: 'zhang@example.com',
};

describe('教师仓储', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('空存储读取为空列表', () => {
    expect(loadTeachers(storage)).toEqual([]);
  });

  it('保存后可从同一存储读回，字段值完全一致', () => {
    const teachers = addTeacher([], draft);
    saveTeachers(teachers, storage);

    const loaded = loadTeachers(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject(draft);
    expect(loaded[0].id).toBeTruthy();
  });

  it('存储内容损坏时降级为空列表而不抛错', () => {
    expect(loadTeachers(new MemoryStorage('{ not json'))).toEqual([]);
    expect(loadTeachers(new MemoryStorage('{"foo":1}'))).toEqual([]);
    expect(loadTeachers(new MemoryStorage('[{"name":123}]'))).toEqual([]);
  });

  it('追加多条记录后读回顺序与数量一致', () => {
    let teachers: Teacher[] = [];
    teachers = addTeacher(teachers, draft);
    teachers = addTeacher(teachers, { ...draft, name: '李老师', phone: '13900000000', email: 'li@example.com' });
    saveTeachers(teachers, storage);

    const loaded = loadTeachers(storage);
    expect(loaded.map((teacher) => teacher.name)).toEqual(['张老师', '李老师']);
  });

  it('新增时统一去除首尾空白', () => {
    const teachers = addTeacher([], { ...draft, name: ' 张老师 ' });
    expect(teachers[0].name).toBe('张老师');
  });

  it('修改只影响目标记录，其他记录与 id 保持不变', () => {
    const teachers = addTeacher(addTeacher([], draft), { ...draft, name: '李老师' });
    const targetId = teachers[0].id;

    const updated = updateTeacher(teachers, targetId, {
      ...draft,
      phone: '13700000000',
      email: 'zhang.new@example.com',
    });

    expect(updated[0].id).toBe(targetId);
    expect(updated[0].name).toBe('张老师');
    expect(updated[0].course).toBe('数学');
    expect(updated[0].grade).toBe('三年级');
    expect(updated[0].phone).toBe('13700000000');
    expect(updated[0].email).toBe('zhang.new@example.com');
    expect(updated[1]).toEqual(teachers[1]);
  });

  it('删除移除目标记录且不影响其他记录', () => {
    const teachers = addTeacher(addTeacher([], draft), { ...draft, name: '李老师' });
    const remaining = removeTeacher(teachers, teachers[0].id);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('李老师');

    saveTeachers(remaining, storage);
    expect(loadTeachers(storage).map((teacher) => teacher.name)).toEqual(['李老师']);
  });

  it('删除不存在的 id 时列表保持不变', () => {
    const teachers = addTeacher([], draft);
    expect(removeTeacher(teachers, 'not-exist')).toEqual(teachers);
  });

  it('无可用存储时读取与写入都不抛错', () => {
    expect(loadTeachers(null)).toEqual([]);
    expect(() => saveTeachers(addTeacher([], draft), null)).not.toThrow();
  });
});