import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Space, Spin, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../platform/api-client'
import { defaultPathFor, useSession } from '../platform/session'

interface LoginValues {
  email: string
  password: string
}

export default function LoginPage() {
  const { status, user, login } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    )
  }
  if (status === 'authenticated' && user) return <Navigate to={defaultPathFor(user)} replace />

  const submit = async (values: LoginValues) => {
    setBusy(true)
    setError('')
    try {
      const profile = await login(values.email.trim(), values.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : defaultPathFor(profile), { replace: true })
    } catch (cause) {
      setError(errorMessage(cause, '登录失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="app-logo-mark login-logo-mark">工</div>
        <Typography.Title level={2} className="login-title">工单受理与处理平台</Typography.Title>
        <Typography.Paragraph className="login-subtitle">
          提交、分派、处理与评价工单，按公司隔离数据，按角色开放入口。
        </Typography.Paragraph>
      </div>
      <Card className="login-card" title="账号登录">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {error && <Alert type="error" showIcon message={error} />}
          <Form<LoginValues> layout="vertical" onFinish={(values) => void submit(values)} requiredMark={false}>
            <Form.Item label="邮箱" name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱地址' }]}>
              <Input prefix={<MailOutlined />} autoComplete="email" placeholder="name@company.com" size="large" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="登录密码" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={busy}>
              登录
            </Button>
          </Form>
          <Typography.Text type="secondary">账号由公司管理员维护，登录问题请联系管理员。</Typography.Text>
        </Space>
      </Card>
    </div>
  )
}