import { describe, expect, it, beforeEach } from 'vitest'
import {
  TEACHER_STORAGE_KEY,
  addTeacher,
  deleteTeacher,
  findTeacher,
  normalizeTeacher,
  readTeachers,
  updateTeacher,
} from '../src/lib/teacherStore.js'

function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

describe('teacherStore', () => {
  let storage

  beforeEach(() => {
    storage = createMemoryStorage()
  })

  it('无数据时返回空清单', () => {
    expect(readTeachers(storage)).toEqual([])
  })

  it('新增教师后可读回五项字段并保留课程与年级的全部条目', () => {
    const created = addTeacher(
      {
        name: '王老师',
        courses: ['语文', '历史'],
        grades: ['三年级', '四年级'],
        mobile: '13800138000',
        email: 'wang@school.com',
      },
      storage,
    )

    expect(created.id).toBeTruthy()
    const teachers = readTeachers(storage)
    expect(teachers).toHaveLength(1)
    expect(teachers[0]).toMatchObject({
      name: '王老师',
      courses: ['语文', '历史'],
      grades: ['三年级', '四年级'],
      mobile: '13800138000',
      email: 'wang@school.com',
    })
  })

  it('写入时去除空白并丢弃空的多值条目', () => {
    addTeacher({ name: '  李老师  ', courses: [' 数学 ', '', '  '], grades: [''], mobile: '', email: '' }, storage)
    const [teacher] = readTeachers(storage)
    expect(teacher.name).toBe('李老师')
    expect(teacher.courses).toEqual(['数学'])
    expect(teacher.grades).toEqual([])
  })

  it('编辑按 id 原地更新且不产生重复记录', () => {
    const created = addTeacher({ name: '张老师', courses: ['英语'], grades: ['一年级'] }, storage)
    addTeacher({ name: '赵老师', courses: ['物理'], grades: ['二年级'] }, storage)

    const updated = updateTeacher(
      created.id,
      { name: '张老师', courses: ['英语', '美术'], grades: ['一年级', '三年级'], mobile: '13900139000' },
      storage,
    )

    expect(updated.id).toBe(created.id)
    const teachers = readTeachers(storage)
    expect(teachers).toHaveLength(2)
    expect(findTeacher(created.id, storage)).toMatchObject({
      name: '张老师',
      courses: ['英语', '美术'],
      grades: ['一年级', '三年级'],
      mobile: '13900139000',
    })
    expect(findTeacher(created.id, storage).email).toBe('')
  })

  it('更新不存在的记录返回 null 且不改动清单', () => {
    addTeacher({ name: '孙老师' }, storage)
    expect(updateTeacher('missing-id', { name: '新名称' }, storage)).toBeNull()
    expect(readTeachers(storage)).toHaveLength(1)
  })

  it('删除只移除目标记录，其他记录保持不变', () => {
    const first = addTeacher({ name: '甲老师', mobile: '13700137000' }, storage)
    const second = addTeacher({ name: '乙老师', courses: ['化学'] }, storage)

    expect(deleteTeacher(first.id, storage)).toBe(true)
    const teachers = readTeachers(storage)
    expect(teachers).toHaveLength(1)
    expect(teachers[0]).toMatchObject({ id: second.id, name: '乙老师', courses: ['化学'] })
  })

  it('删除不存在的记录返回 false', () => {
    expect(deleteTeacher('missing-id', storage)).toBe(false)
  })

  it('存储内容损坏时返回空清单而不抛错', () => {
    storage.setItem(TEACHER_STORAGE_KEY, '{not-json')
    expect(readTeachers(storage)).toEqual([])
  })

  it('复用既有 id，便于再次规范化记录', () => {
    expect(normalizeTeacher({ id: 'abc', name: ' 周老师 ', courses: ['体育', null], grades: undefined })).toEqual({
      id: 'abc',
      name: '周老师',
      courses: ['体育'],
      grades: [],
      mobile: '',
      email: '',
    })
  })
})