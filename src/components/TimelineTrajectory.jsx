import React from 'react'
import StepItem from './StepItem.jsx'

/**
 * 轨迹容器组件 — 纵向时间线承载一次会话的完整轨迹。
 * 全部步骤在同一视图中自上而下排列，通过时间线连接呈现先后衔接关系。
 * @param {{ session: object }} props
 */
export default function TimelineTrajectory({ session }) {
  const { steps } = session
  const lastIndex = steps.length - 1

  return (
    <div className="timeline-trajectory">
      <div className="timeline-line" aria-hidden="true" />
      <div className="timeline-steps">
        {steps.map((step, index) => (
          <StepItem
            key={step.seq}
            step={step}
            isStart={index === 0}
            isEnd={index === lastIndex}
          />
        ))}
      </div>
    </div>
  )
}
