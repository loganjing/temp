import type { Teacher, TeacherInput } from './types';

const STORAGE_KEY = 'teacher-management/teachers';

function readAll(): Teacher[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Teacher[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Teacher[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listTeachers(): Teacher[] {
  return readAll();
}

export function createTeacher(input: TeacherInput): Teacher {
  const teacher: Teacher = { id: generateId(), ...input };
  const list = readAll();
  list.push(teacher);
  writeAll(list);
  return teacher;
}

export function updateTeacher(id: string, input: TeacherInput): Teacher | null {
  const list = readAll();
  const index = list.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const updated: Teacher = { id, ...input };
  list[index] = updated;
  writeAll(list);
  return updated;
}

export function deleteTeacher(id: string): boolean {
  const list = readAll();
  const filtered = list.filter((t) => t.id !== id);
  if (filtered.length === list.length) return false;
  writeAll(filtered);
  return true;
}
