import { describe, it, expect } from 'vitest'
import { FIELDS, validateTeacher, createEmptyTeacher } from '../src/lib/fields.js'

describe('fields - FIELDS definition', () => {
  it('defines exactly five required fields', () => {
    expect(FIELDS).toHaveLength(5)
    const keys = FIELDS.map((f) => f.key)
    expect(keys).toEqual(['name', 'course', 'grade', 'phone', 'email'])
    FIELDS.forEach((f) => expect(f.required).toBe(true))
  })
})

describe('fields - validateTeacher', () => {
  it('passes when all five fields are non-empty', () => {
    const data = {
      name: '张老师',
      course: '数学',
      grade: '高一',
      phone: '13800000001',
      email: 'zhang@example.com',
    }
    const result = validateTeacher(data)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('fails when any field is empty string', () => {
    const data = {
      name: '',
      course: '数学',
      grade: '高一',
      phone: '138',
      email: 'a@b.com',
    }
    const result = validateTeacher(data)
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeTruthy()
  })

  it('fails when any field is whitespace only', () => {
    const data = {
      name: '  ',
      course: '数学',
      grade: '高一',
      phone: '138',
      email: 'a@b.com',
    }
    const result = validateTeacher(data)
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeTruthy()
  })

  it('fails when all fields are empty', () => {
    const result = validateTeacher(createEmptyTeacher())
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors)).toHaveLength(5)
  })
})

describe('fields - createEmptyTeacher', () => {
  it('creates an object with all five fields set to empty string', () => {
    const empty = createEmptyTeacher()
    expect(Object.keys(empty)).toHaveLength(5)
    expect(empty.name).toBe('')
    expect(empty.course).toBe('')
    expect(empty.grade).toBe('')
    expect(empty.phone).toBe('')
    expect(empty.email).toBe('')
  })
})
