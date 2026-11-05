import { useState } from 'react'
import {
  App as AntApp,
  Avatar,
  Button,
  ConfigProvider,
  Empty,
  Layout,
  Menu,
  Space,
  Table,
  Tag,
} from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BookOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import TeacherFormDrawer from './components/TeacherFormDrawer'
import { addTeacher, deleteTeacher, readTeachers, updateTeacher } from './lib/teacherStore'
import './styles.css'

const { Sider, Content } = Layout

const CLOSED_DRAWER = { open: false, mode: 'create', teacher: null }

function renderValueList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return <span className="muted">未填写</span>
  }
  return (
    <span className="tag-list">
      {values.map((value, index) => (
        <Tag key={`${value}-${index}`}>{value}</Tag>
      ))}
    </span>
  )
}

function TeacherWorkspace() {
  const { message, modal } = AntApp.useApp()
  const [teachers, setTeachers] = useState(() => readTeachers())
  const [drawer, setDrawer] = useState(CLOSED_DRAWER)

  const refresh = () => setTeachers(readTeachers())
  const openCreate = () => setDrawer({ open: true, mode: 'create', teacher: null })
  const openEdit = (teacher) => setDrawer({ open: true, mode: 'edit', teacher })
  const closeDrawer = () => setDrawer(CLOSED_DRAWER)

  const handleSubmit = (values) => {
    if (drawer.mode === 'edit' && drawer.teacher) {
      updateTeacher(drawer.teacher.id, values)
      message.success('教师信息已更新')
    } else {
      addTeacher(values)
      message.success('教师已添加')
    }
    refresh()
    closeDrawer()
  }

  const handleDelete = (teacher) => {
    modal.confirm({
      title: `确定删除教师「${teacher.name}」吗？`,
      content: '删除后该教师记录将无法恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        deleteTeacher(teacher.id)
        refresh()
        message.success('教师已删除')
      },
    })
  }

  const columns = [
    {
      title: '教师名称',
      dataIndex: 'name',
      width: 150,
      render: (value) => <strong className="teacher-name">{value}</strong>,
    },
    { title: '教授课程', dataIndex: 'courses', width: 250, render: renderValueList },
    { title: '年级', dataIndex: 'grades', width: 210, render: renderValueList },
    {
      title: '手机',
      dataIndex: 'mobile',
      width: 150,
      render: (value) => value || <span className="muted">未填写</span>,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      render: (value) => value || <span className="muted">未填写</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Layout className="app-layout">
      <Sider className="desktop-sider" width={220} theme="dark">
        <div className="brand">
          <div className="brand-icon">
            <BookOutlined />
          </div>
          <div>
            <strong>教师管理</strong>
            <span>TEACHER DIRECTORY</span>
          </div>
        </div>
        <div className="nav-caption">教学管理</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={['teachers']}
          items={[{ key: 'teachers', icon: <TeamOutlined />, label: '教师管理' }]}
        />
        <div className="sider-bottom">
          <span className="sider-online" />
          记录保存在当前浏览器
        </div>
      </Sider>
      <Layout>
        <header className="topbar">
          <div className="top-left">
            <span className="crumb">教学管理</span>
            <span className="slash">/</span>
            <strong>教师管理</strong>
          </div>
          <Space size={14}>
            <span className="top-divider" />
            <Avatar style={{ background: '#e9edff', color: '#315fe8', fontWeight: 600 }}>管</Avatar>
            <span className="user-name">管理员</span>
          </Space>
        </header>
        <Content className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                TEACHER DIRECTORY <span>/</span> 教学管理
              </div>
              <h1>教师管理</h1>
              <p>维护教师名称、教授课程、年级、手机与邮箱，支持新增、编辑与删除。</p>
            </div>
            <Button type="primary" size="large" icon={<UserAddOutlined />} onClick={openCreate}>
              新增教师
            </Button>
          </div>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>
                  教师列表 <span>{teachers.length}</span>
                </h2>
                <p>共 {teachers.length} 位教师，记录保存在当前浏览器中</p>
              </div>
            </div>
            <Table
              columns={columns}
              dataSource={teachers}
              rowKey="id"
              pagination={false}
              scroll={{ x: 940 }}
              locale={{
                emptyText: (
                  <Empty description="暂无教师记录，先添加第一位教师">
                    <Button type="primary" onClick={openCreate}>
                      新增教师
                    </Button>
                  </Empty>
                ),
              }}
            />
          </section>
          <div className="page-footer">
            <span>数据仅保存在当前浏览器，更换设备或浏览器不会同步。</span>
            <span>UI 基础：Ant Design</span>
          </div>
        </Content>
      </Layout>
      <TeacherFormDrawer
        open={drawer.open}
        mode={drawer.mode}
        teacher={drawer.teacher}
        onSubmit={handleSubmit}
        onCancel={closeDrawer}
      />
    </Layout>
  )
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#315fe8',
          colorText: '#202b3a',
          colorBgLayout: '#f4f6fa',
          borderRadius: 8,
          controlHeight: 38,
          fontSize: 14,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#697588',
            rowHoverBg: '#f6f9ff',
            cellPaddingBlock: 14,
          },
          Menu: {
            darkItemBg: '#142238',
            darkItemSelectedBg: '#29486f',
            darkItemSelectedColor: '#fff',
          },
        },
      }}
    >
      <AntApp>
        <TeacherWorkspace />
      </AntApp>
    </ConfigProvider>
  )
}