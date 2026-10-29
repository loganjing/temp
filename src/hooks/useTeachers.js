import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'teacher-management:teachers';

/**
 * 安全 trim：对 undefined/null/非字符串值返回空字符串，否则返回 trim 后的字符串。
 * 防止 addTeacher/updateTeacher 在收到不完整数据时抛 TypeError。
 */
function safeTrim(value) {
  return String(value ?? '').trim();
}

/**
 * 教师数据管理 Hook
 * 负责从 localStorage 读取、写入教师记录，
 * 并提供新增、更新、删除操作。
 *
 * 数据归属：同一浏览器 localStorage，刷新或重开后数据保留。
 */
export function useTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [persistError, setPersistError] = useState(null);

  // 初始化：从 localStorage 加载
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTeachers(parsed);
        }
      }
    } catch (e) {
      // localStorage 不可用或数据损坏时，使用空列表
      setTeachers([]);
    }
    setInitialized(true);
  }, []);

  /**
   * 持久化到 localStorage
   */
  const persist = useCallback((data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  // 当 teachers 变化时持久化（跳过初始加载阶段，避免覆盖已有数据）
  useEffect(() => {
    if (initialized) {
      if (!persist(teachers)) {
        setPersistError('数据保存失败：浏览器本地存储不可用或已满，刷新后数据可能丢失。');
        console.warn('Failed to persist teacher data to localStorage');
      } else {
        setPersistError(null);
      }
    }
  }, [teachers, initialized, persist]);

  /**
   * 新增教师记录
   * 使用 safeTrim 防止字段为 undefined/null 时抛 TypeError。
   */
  const addTeacher = useCallback((data) => {
    const newTeacher = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: safeTrim(data?.name),
      course: safeTrim(data?.course),
      grade: safeTrim(data?.grade),
      phone: safeTrim(data?.phone),
      email: safeTrim(data?.email),
    };
    setTeachers((prev) => [...prev, newTeacher]);
    return newTeacher;
  }, []);

  /**
   * 更新教师记录
   * 使用 safeTrim 防止字段为 undefined/null 时抛 TypeError。
   * 返回更新后的教师对象（与 addTeacher 返回值保持一致）。
   */
  const updateTeacher = useCallback((id, data) => {
    let updated = null;
    setTeachers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        updated = {
          ...t,
          name: safeTrim(data?.name),
          course: safeTrim(data?.course),
          grade: safeTrim(data?.grade),
          phone: safeTrim(data?.phone),
          email: safeTrim(data?.email),
        };
        return updated;
      }),
    );
    return updated;
  }, []);

  /**
   * 删除教师记录
   */
  const deleteTeacher = useCallback((id) => {
    setTeachers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { teachers, addTeacher, updateTeacher, deleteTeacher, persistError };
}
