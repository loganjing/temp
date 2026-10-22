import {
  Teacher,
  TeacherDraft,
  TEACHER_FIELDS,
  createTeacherId,
  normalizeTeacherDraft,
} from '../domain/teacher';

/** localStorage 中的应用命名键，单独成键避免与其他数据混用。 */
export const TEACHER_STORAGE_KEY = 'teacher-management:teachers';

/** 只依赖取值/写值两个方法，便于在单元测试中替换为内存实现。 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 浏览器隐私模式等场景下访问 localStorage 可能抛错，此处降级为不持久化。 */
function defaultStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredRecord(value: unknown): Teacher | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const fields: Partial<Record<keyof Teacher, string>> = {};

  for (const field of TEACHER_FIELDS) {
    const raw = record[field];
    if (raw !== undefined && typeof raw !== 'string') {
      return null;
    }
    fields[field] = raw ?? '';
  }

  const id = typeof record.id === 'string' && record.id ? record.id : createTeacherId();

  return {
    id,
    name: fields.name ?? '',
    course: fields.course ?? '',
    grade: fields.grade ?? '',
    phone: fields.phone ?? '',
    email: fields.email ?? '',
  };
}

/**
 * 读取教师列表。存储缺失或内容损坏时返回空列表，不阻断应用启动。
 */
export function loadTeachers(storage: KeyValueStorage | null = defaultStorage()): Teacher[] {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(TEACHER_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(readStoredRecord)
      .filter((teacher): teacher is Teacher => teacher !== null);
  } catch {
    return [];
  }
}

/** 写回教师列表；无可用存储时静默跳过。 */
export function saveTeachers(
  teachers: Teacher[],
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  if (!storage) {
    return;
  }
  storage.setItem(TEACHER_STORAGE_KEY, JSON.stringify(teachers));
}

/** 新增：追加一条记录并返回新列表。 */
export function addTeacher(teachers: Teacher[], draft: TeacherDraft): Teacher[] {
  const teacher: Teacher = { id: createTeacherId(), ...normalizeTeacherDraft(draft) };
  return [...teachers, teacher];
}

/** 修改：更新指定记录的五个字段，其他记录保持不变。 */
export function updateTeacher(
  teachers: Teacher[],
  teacherId: string,
  draft: TeacherDraft,
): Teacher[] {
  return teachers.map((teacher) =>
    teacher.id === teacherId ? { ...teacher, ...normalizeTeacherDraft(draft) } : teacher,
  );
}

/** 删除：移除指定记录。 */
export function removeTeacher(teachers: Teacher[], teacherId: string): Teacher[] {
  return teachers.filter((teacher) => teacher.id !== teacherId);
}