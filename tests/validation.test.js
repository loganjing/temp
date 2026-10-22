import { describe, it, expect, beforeEach } from 'vitest'
import { validateTeacher } from '../src/lib/validation.js'

describe('validateTeacher', () => {
  const validData = {
    teacherName: '张老师',
    course: '数学',
    grade: '三年级',
    phone: '13800138000',
    email: 'zhang@example.com',
  }

  it('通过有效数据校验', () => {
    const result = validateTeacher(validData)
    expect(result.valid).toBe(true)
    expect(Object.keys(result.errors)).toHaveLength(0)
  })

  it('教师名称为空时校验失败', () => {
    const result = validateTeacher({ ...validData, teacherName: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.teacherName).toBe('教师名称不能为空')
  })

  it('教师名称为空白字符时校验失败', () => {
    const result = validateTeacher({ ...validData, teacherName: '   ' })
    expect(result.valid).toBe(false)
    expect(result.errors.teacherName).toBe('教师名称不能为空')
  })

  it('手机号为空时校验失败', () => {
    const result = validateTeacher({ ...validData, phone: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.phone).toBe('手机号不能为空')
  })

  it('手机号包含字母时校验失败', () => {
    const result = validateTeacher({ ...validData, phone: '1380013abcd' })
    expect(result.valid).toBe(false)
    expect(result.errors.phone).toContain('手机号格式不正确')
  })

  it('手机号超长时校验失败', () => {
    const result = validateTeacher({ ...validData, phone: '1234567890123456' })
    expect(result.valid).toBe(false)
    expect(result.errors.phone).toContain('手机号格式不正确')
  })

  it('手机号过短时校验失败', () => {
    const result = validateTeacher({ ...validData, phone: '12345' })
    expect(result.valid).toBe(false)
    expect(result.errors.phone).toContain('手机号格式不正确')
  })

  it('手机号含合理分隔符时通过校验', () => {
    const result = validateTeacher({ ...validData, phone: '138-0013-8000' })
    expect(result.valid).toBe(true)
  })

  it('邮箱为空时校验失败', () => {
    const result = validateTeacher({ ...validData, email: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.email).toBe('邮箱不能为空')
  })

  it('邮箱不含@时校验失败', () => {
    const result = validateTeacher({ ...validData, email: 'invalidemail.com' })
    expect(result.valid).toBe(false)
    expect(result.errors.email).toContain('邮箱格式不正确')
  })

  it('邮箱缺少域名部分时校验失败', () => {
    const result = validateTeacher({ ...validData, email: 'test@com' })
    expect(result.valid).toBe(false)
    expect(result.errors.email).toContain('邮箱格式不正确')
  })

  it('邮箱缺少用户名部分时校验失败', () => {
    const result = validateTeacher({ ...validData, email: '@example.com' })
    expect(result.valid).toBe(false)
    expect(result.errors.email).toContain('邮箱格式不正确')
  })

  it('多个字段同时不合法时返回多个错误', () => {
    const result = validateTeacher({
      teacherName: '',
      course: '',
      grade: '',
      phone: 'abc',
      email: 'no-at-sign',
    })
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'phone', 'teacherName'])
  })
})
