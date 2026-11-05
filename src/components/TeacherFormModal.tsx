import { useEffect } from 'react';
import { Modal, Form, Input, App as AntApp } from 'antd';
import type { Teacher } from '../types';

interface TeacherFormModalProps {
  open: boolean;
  editingTeacher: Teacher | null;
  onCancel: () => void;
  onSubmit: (values: Omit<Teacher, 'id'>) => void;
}

interface FormValues {
  name: string;
  course: string;
  grade: string;
  phone: string;
  email: string;
}

export function TeacherFormModal({ open, editingTeacher, onCancel, onSubmit }: TeacherFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const { message } = AntApp.useApp();

  useEffect(() => {
    if (open) {
      if (editingTeacher) {
        form.setFieldsValue({
          name: editingTeacher.name,
          course: editingTeacher.course,
          grade: editingTeacher.grade,
          phone: editingTeacher.phone,
          email: editingTeacher.email,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, editingTeacher, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
    } catch (error) {
      // validation errors are displayed on fields by antd
      if (error && typeof error === 'object' && 'errorFields' in error) {
        message.warning('请完善表单必填项');
      }
    }
  };

  return (
    <Modal
      title={editingTeacher ? '编辑教师' : '新增教师'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      forceRender
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="name"
          label="教师名称"
          rules={[{ required: true, message: '请输入教师名称' }]}
        >
          <Input placeholder="请输入教师名称" maxLength={50} />
        </Form.Item>
        <Form.Item
          name="course"
          label="教授课程"
          rules={[{ required: true, message: '请输入教授课程' }]}
        >
          <Input placeholder="请输入教授课程" maxLength={50} />
        </Form.Item>
        <Form.Item
          name="grade"
          label="年级"
          rules={[{ required: true, message: '请输入年级' }]}
        >
          <Input placeholder="请输入年级" maxLength={20} />
        </Form.Item>
        <Form.Item
          name="phone"
          label="手机"
          rules={[
            { required: true, message: '请输入手机号' },
            { pattern: /^1\d{10}$/, message: '请输入有效的手机号（以1开头的11位数字）' },
          ]}
        >
          <Input placeholder="请输入手机号" maxLength={11} />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入有效的邮箱地址' },
          ]}
        >
          <Input placeholder="请输入邮箱" maxLength={100} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
