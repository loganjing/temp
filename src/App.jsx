import React from 'react'
import TimelineTrajectory from './components/TimelineTrajectory.jsx'
import { getSessionTrajectory } from './data/sessionRepository.js'

export default function App() {
  const session = getSessionTrajectory()

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">会话流程轨迹</h1>
        <p className="app-subtitle">{session.title}</p>
      </header>
      <main className="app-main">
        <TimelineTrajectory session={session} />
      </main>
    </div>
  )
}
