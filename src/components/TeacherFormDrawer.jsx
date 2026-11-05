import { useEffect } from 'react'
import { Button, Drawer, Form, Input } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { getEmailError, getMobileError } from '../lib/teacherValidation'

export function toFormValues(teacher) {
  return {
    name: teacher?.name ?? '',
    courses: (teacher?.courses ?? []).map((value) => ({ value })),
    grades: (teacher?.grades ?? []).map((value) => ({ value })),
    mobile: teacher?.mobile ?? '',
    email: teacher?.email ?? '',
  }
}

export function fromFormValues(values = {}) {
  const pickValues = (rows) =>
    (Array.isArray(rows) ? rows : []).map((row) => (row && typeof row === 'object' ? row.value : row))
  return {
    name: values.name ?? '',
    courses: pickValues(values.courses),
    grades: pickValues(values.grades),
    mobile: values.mobile ?? '',
    email: values.email ?? '',
  }
}

const EMPTY_FORM_VALUES = { name: '', courses: [], grades: [], mobile: '', email: '' }

function ValueList({ label, name, placeholder, addLabel }) {
  return (
    <Form.Item label={label} className="value-list-item">
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <div className="value-list">
            {fields.map(({ key, name: rowName, ...restField }, index) => (
              <div className="value-row" key={key}>
                <Form.Item {...restField} name={[rowName, 'value']} className="value-row-input">
                  <Input placeholder={`${placeholder} ${index + 1}`} aria-label={`${label}第 ${index + 1} 项`} />
                </Form.Item>
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  aria-label={`移除${label}第 ${index + 1} 项`}
                  onClick={() => remove(rowName)}
                />
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ value: '' })}>
              {addLabel}
            </Button>
          </div>
        )}
      </Form.List>
      <div className="field-hint">可添加多个条目，留空条目保存时会自动忽略。</div>
    </Form.Item>
  )
}

export default function TeacherFormDrawer({ open, mode, teacher, onSubmit, onCancel }) {
  const [form] = Form.useForm()
  const isEdit = mode === 'edit'

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue(isEdit && teacher ? toFormValues(teacher) : EMPTY_FORM_VALUES)
  }, [open, isEdit, teacher, form])

  const mobileRules = [
    {
      validator: (_, value) => {
        const error = getMobileError(value)
        return error ? Promise.reject(new Error(error)) : Promise.resolve()
      },
    },
  ]

  const emailRules = [
    {
      validator: (_, value) => {
        const error = getEmailError(value)
        return error ? Promise.reject(new Error(error)) : Promise.resolve()
      },
    },
  ]

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      width={520}
      title={isEdit ? '编辑教师' : '新增教师'}
      className="teacher-drawer"
      maskClosable={false}
      footer={
        <div className="drawer-footer">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => form.submit()}>
            保存
          </Button>
        </div>
      }
    >
      <p className="drawer-intro">
        {isEdit ? '修改教师信息后保存，清单会同步显示最新内容。' : '填写教师基本信息，保存后该教师会出现在教师清单中。'}
      </p>
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={EMPTY_FORM_VALUES}
        onFinish={(values) => onSubmit(fromFormValues(values))}
      >
        <Form.Item
          name="name"
          label="教师名称"
          rules={[{ required: true, whitespace: true, message: '请输入教师名称' }]}
        >
          <Input placeholder="请输入教师名称" maxLength={40} />
        </Form.Item>
        <ValueList label="教授课程" name="courses" placeholder="课程" addLabel="添加课程" />
        <ValueList label="年级" name="grades" placeholder="年级" addLabel="添加年级" />
        <Form.Item name="mobile" label="手机" rules={mobileRules}>
          <Input placeholder="请输入 11 位手机号" allowClear />
        </Form.Item>
        <Form.Item name="email" label="邮箱" rules={emailRules}>
          <Input placeholder="请输入邮箱地址" allowClear />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
