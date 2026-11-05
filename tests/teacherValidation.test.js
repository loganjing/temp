import { describe, expect, it } from 'vitest'
import {
  getEmailError,
  getMobileError,
  getNameError,
  isTeacherInputValid,
  validateTeacherInput,
} from '../src/lib/teacherValidation.js'

describe('teacherValidation', () => {
  it('教师名称必填且不接受纯空白', () => {
    expect(getNameError('')).toBe('请输入教师名称')
    expect(getNameError('   ')).toBe('请输入教师名称')
    expect(getNameError(undefined)).toBe('请输入教师名称')
    expect(getNameError('王老师')).toBeNull()
  })

  it('手机留空视为未填写，不报格式错误', () => {
    expect(getMobileError('')).toBeNull()
    expect(getMobileError('   ')).toBeNull()
    expect(getMobileError(undefined)).toBeNull()
  })

  it('手机填写时校验 11 位手机号格式', () => {
    expect(getMobileError('13800138000')).toBeNull()
    expect(getMobileError(' 13900139000 ')).toBeNull()
    expect(getMobileError('1380013800')).not.toBeNull()
    expect(getMobileError('138001380001')).not.toBeNull()
    expect(getMobileError('23800138000')).not.toBeNull()
    expect(getMobileError('138-0013-8000')).not.toBeNull()
  })

  it('邮箱留空视为未填写，填写时校验格式', () => {
    expect(getEmailError('')).toBeNull()
    expect(getEmailError(undefined)).toBeNull()
    expect(getEmailError('teacher@school.com')).toBeNull()
    expect(getEmailError('teacher@school')).not.toBeNull()
    expect(getEmailError('teacher.school.com')).not.toBeNull()
  })

  it('汇总字段级错误信息', () => {
    expect(validateTeacherInput({ name: '  ', mobile: '123', email: 'bad' })).toEqual({
      name: '请输入教师名称',
      mobile: expect.any(String),
      email: expect.any(String),
    })
  })

  it('合法输入通过整体校验，课程与年级不参与必填校验', () => {
    expect(
      isTeacherInputValid({
        name: '王老师',
        courses: [],
        grades: [],
        mobile: '',
        email: '',
      }),
    ).toBe(true)
    expect(isTeacherInputValid({ name: '' })).toBe(false)
  })
})
