import { describe, expect, it } from 'vitest'
import { fromFormValues, toFormValues } from '../src/components/TeacherFormDrawer.jsx'

describe('教师表单取值映射', () => {
  it('编辑时把记录转换为可编辑的行结构', () => {
    expect(
      toFormValues({
        id: 't1',
        name: '王老师',
        courses: ['语文', '历史'],
        grades: ['三年级'],
        mobile: '13800138000',
        email: 'wang@school.com',
      }),
    ).toEqual({
      name: '王老师',
      courses: [{ value: '语文' }, { value: '历史' }],
      grades: [{ value: '三年级' }],
      mobile: '13800138000',
      email: 'wang@school.com',
    })
  })

  it('新增时没有记录也能得到空表单值', () => {
    expect(toFormValues(null)).toEqual({ name: '', courses: [], grades: [], mobile: '', email: '' })
    expect(toFormValues(undefined)).toEqual({ name: '', courses: [], grades: [], mobile: '', email: '' })
  })

  it('提交时摊平行结构并保留空条目，交由存储层统一清洗', () => {
    expect(
      fromFormValues({
        name: '李老师',
        courses: [{ value: '数学' }, { value: '' }],
        grades: [{ value: '初一' }],
        mobile: '',
        email: '',
      }),
    ).toEqual({
      name: '李老师',
      courses: ['数学', ''],
      grades: ['初一'],
      mobile: '',
      email: '',
    })
  })

  it('缺少字段时回退为空值而不是 undefined', () => {
    expect(fromFormValues()).toEqual({ name: '', courses: [], grades: [], mobile: '', email: '' })
  })
})
