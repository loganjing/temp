import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'teacher-management:teachers';

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
        console.warn('Failed to persist teacher data to localStorage');
      }
    }
  }, [teachers, initialized, persist]);

  /**
   * 新增教师记录
   */
  const addTeacher = useCallback((data) => {
    const newTeacher = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: data.name.trim(),
      course: data.course.trim(),
      grade: data.grade.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
    };
    setTeachers((prev) => [...prev, newTeacher]);
    return newTeacher;
  }, []);

  /**
   * 更新教师记录
   */
  const updateTeacher = useCallback((id, data) => {
    setTeachers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              name: data.name.trim(),
              course: data.course.trim(),
              grade: data.grade.trim(),
              phone: data.phone.trim(),
              email: data.email.trim(),
            }
          : t,
      ),
    );
  }, []);

  /**
   * 删除教师记录
   */
  const deleteTeacher = useCallback((id) => {
    setTeachers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { teachers, addTeacher, updateTeacher, deleteTeacher };
}
