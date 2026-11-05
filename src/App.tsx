import { ConfigProvider, Layout, Typography, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { usePomodoroTimer } from './hooks/usePomodoroTimer'
import { StatsHeader } from './components/StatsHeader'
import { PomodoroTimer } from './components/PomodoroTimer'
import { RecordList } from './components/RecordList'
import { Heatmap } from './components/Heatmap'

const { Header, Content } = Layout

function App() {
  const pomodoro = usePomodoroTimer()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#ff4d4f',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            专注时段记录
          </Typography.Title>
        </Header>
        <Content style={{ padding: 24, maxWidth: 960, margin: '0 auto', width: '100%' }}>
          <StatsHeader records={pomodoro.records} />
          <PomodoroTimer
            phase={pomodoro.phase}
            remainingSeconds={pomodoro.remainingSeconds}
            running={pomodoro.running}
            focusSeconds={pomodoro.durations.focusSeconds}
            restSeconds={pomodoro.durations.restSeconds}
            onStart={pomodoro.start}
            onPause={pomodoro.pause}
            onResume={pomodoro.resume}
            onReset={pomodoro.reset}
          />
          <RecordList records={pomodoro.records} />
          <Heatmap records={pomodoro.records} />
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App
