import { useState, useCallback, useEffect } from 'react';
import { ConfigProvider, App as AntApp, Layout, Typography, Button, Table, Space, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import type { ColumnsType } from 'antd/es/table';
import type { Teacher } from './types';
import { listTeachers, createTeacher, updateTeacher, deleteTeacher } from './storage';
import { TeacherFormModal } from './components/TeacherFormModal';

const { Header, Content } = Layout;
const { Title } = Typography;

function TeacherManagement() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const { message } = AntApp.useApp();

  const refresh = useCallback(() => {
    setTeachers(listTeachers());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = () => {
    setEditingTeacher(null);
    setModalOpen(true);
  };

  const handleEdit = (record: Teacher) => {
    setEditingTeacher(record);
    setModalOpen(true);
  };

  const handleDelete = (record: Teacher) => {
    const ok = deleteTeacher(record.id);
    if (ok) {
      message.success('删除成功');
      refresh();
    } else {
      message.error('删除失败：未找到该记录');
    }
  };

  const handleSubmit = (values: Omit<Teacher, 'id'>) => {
    if (editingTeacher) {
      const updated = updateTeacher(editingTeacher.id, values);
      if (updated) {
        message.success('修改成功');
      } else {
        message.error('修改失败：未找到该记录');
      }
    } else {
      createTeacher(values);
      message.success('新增成功');
    }
    setModalOpen(false);
    refresh();
  };

  const columns: ColumnsType<Teacher> = [
    { title: '教师名称', dataIndex: 'name', key: 'name' },
    { title: '教授课程', dataIndex: 'course', key: 'course' },
    { title: '年级', dataIndex: 'grade', key: 'grade' },
    { title: '手机', dataIndex: 'phone', key: 'phone' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除教师「${record.name}」吗？`}
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>教师管理</Title>
      </Header>
      <Content style={{ padding: '24px' }}>
        <div style={{ background: '#fff', padding: '24px', borderRadius: '8px' }}>
          <div style={{ marginBottom: '16px' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增教师
            </Button>
          </div>
          <Table
            columns={columns}
            dataSource={teachers}
            rowKey="id"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: '暂无教师记录' }}
          />
        </div>
      </Content>
      <TeacherFormModal
        open={modalOpen}
        editingTeacher={editingTeacher}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <TeacherManagement />
      </AntApp>
    </ConfigProvider>
  );
}
