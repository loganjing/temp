import type { Teacher, TeacherDraft } from '../types';

/** 教师数据的唯一持久化键，界面组件不直接操作该键 */
const STORAGE_KEY = 'teacher-management.teachers.v1';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `teacher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解析单条教师记录；字段缺失或类型不符时返回 null，由调用方忽略该条 */
function readTeacher(raw: unknown): Teacher | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const teacher: Teacher = { id: '', name: '', course: '', grade: '', phone: '', email: '' };
  for (const field of Object.keys(teacher) as Array<keyof Teacher>) {
    const value = raw[field];
    if (typeof value !== 'string') {
      return null;
    }
    teacher[field] = value;
  }
  return teacher;
}

/**
 * 读取全部教师记录。
 * 存储内容损坏（非法 JSON）或为空时按空列表处理，不抛出异常。
 */
export function listTeachers(): Teacher[] {
  let parsed: unknown;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text === null) {
      return [];
    }
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((raw) => readTeacher(raw))
    .filter((teacher): teacher is Teacher => teacher !== null);
}

function persist(teachers: Teacher[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers));
}

/** 新增教师：写入后可通过 listTeachers 读回 */
export function createTeacher(draft: TeacherDraft): Teacher {
  const teacher: Teacher = { id: generateId(), ...draft };
  const teachers = listTeachers();
  teachers.push(teacher);
  persist(teachers);
  return teacher;
}

/** 按 id 修改教师字段；教师不存在时返回 null 且不改变存储 */
export function updateTeacher(id: string, draft: TeacherDraft): Teacher | null {
  const teachers = listTeachers();
  const index = teachers.findIndex((teacher) => teacher.id === id);
  if (index === -1) {
    return null;
  }
  const updated: Teacher = { id, ...draft };
  teachers[index] = updated;
  persist(teachers);
  return updated;
}

/** 按 id 删除教师；教师不存在时返回 false 且不改变存储 */
export function deleteTeacher(id: string): boolean {
  const teachers = listTeachers();
  const next = teachers.filter((teacher) => teacher.id !== id);
  if (next.length === teachers.length) {
    return false;
  }
  persist(next);
  return true;
}

/** 按 id 查询单个教师 */
export function findTeacher(id: string): Teacher | null {
  return listTeachers().find((teacher) => teacher.id === id) ?? null;
}
