import { describe, it, expect } from 'vitest'
import {
  validateName,
  validatePhone,
  validateEmail,
  validateTeacher,
} from '../src/utils/validation.js'

describe('validateName', () => {
  it('通过有效名称', () => {
    expect(validateName('张老师').valid).toBe(true)
  })

  it('拒绝空字符串', () => {
    const result = validateName('')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('拒绝纯空格', () => {
    const result = validateName('   ')
    expect(result.valid).toBe(false)
  })

  it('拒绝 null/undefined', () => {
    expect(validateName(null).valid).toBe(false)
    expect(validateName(undefined).valid).toBe(false)
  })
})

describe('validatePhone', () => {
  it('选填，空值通过', () => {
    expect(validatePhone('').valid).toBe(true)
    expect(validatePhone(null).valid).toBe(true)
  })

  it('通过有效手机号', () => {
    expect(validatePhone('13800138000').valid).toBe(true)
  })

  it('拒绝非1开头', () => {
    expect(validatePhone('23800138000').valid).toBe(false)
  })

  it('拒绝位数不足', () => {
    expect(validatePhone('1380013800').valid).toBe(false)
  })

  it('拒绝非数字字符', () => {
    expect(validatePhone('1380013800a').valid).toBe(false)
  })
})

describe('validateEmail', () => {
  it('选填，空值通过', () => {
    expect(validateEmail('').valid).toBe(true)
    expect(validateEmail(null).valid).toBe(true)
  })

  it('通过有效邮箱', () => {
    expect(validateEmail('teacher@example.com').valid).toBe(true)
  })

  it('拒绝缺少@', () => {
    expect(validateEmail('teacherexample.com').valid).toBe(false)
  })

  it('拒绝缺少域名后缀', () => {
    expect(validateEmail('teacher@example').valid).toBe(false)
  })

  it('拒绝含空格', () => {
    expect(validateEmail('teach er@example.com').valid).toBe(false)
  })
})

describe('validateTeacher', () => {
  it('全部字段有效时通过', () => {
    const result = validateTeacher({
      name: '张老师',
      course: '数学',
      grade: '高一',
      phone: '13800138000',
      email: 'zhang@example.com',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('名称为空时不通过', () => {
    const result = validateTeacher({
      name: '',
      course: '',
      grade: '',
      phone: '',
      email: '',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeDefined()
  })

  it('手机和邮箱格式错误时同时报错', () => {
    const result = validateTeacher({
      name: '张老师',
      phone: 'abc',
      email: 'not-an-email',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.phone).toBeDefined()
    expect(result.errors.email).toBeDefined()
  })

  it('选填字段为空时通过', () => {
    const result = validateTeacher({
      name: '张老师',
      course: '',
      grade: '',
      phone: '',
      email: '',
    })
    expect(result.valid).toBe(true)
  })
})
