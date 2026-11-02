import React from 'react'

const TYPE_META = {
  user: {
    label: '用户输入',
    icon: 'U',
    className: 'step-user'
  },
  model: {
    label: '模型回复',
    icon: 'M',
    className: 'step-model'
  },
  tool: {
    label: '工具调用',
    icon: 'T',
    className: 'step-tool'
  }
}

/**
 * 步骤条目组件 — 粗粒度呈现单个步骤。
 * 包含：步骤编号、类型标识、一句话动作摘要。
 * 按类型附加：用户输入/模型回复显示要点内容，工具调用显示工具名称。
 * @param {{ step: object, isStart: boolean, isEnd: boolean }} props
 */
export default function StepItem({ step, isStart, isEnd }) {
  const meta = TYPE_META[step.type]

  return (
    <div className={`step-item ${meta.className} ${isStart ? 'step-start' : ''} ${isEnd ? 'step-end' : ''}`}>
      <div className="step-marker">
        <div className={`step-icon ${meta.className}`}>{meta.icon}</div>
      </div>
      <div className="step-body">
        <div className="step-header">
          <span className="step-seq">第 {step.seq} 步</span>
          <span className={`step-type-badge ${meta.className}`}>{meta.label}</span>
          {isStart && <span className="step-position-tag tag-start">起点</span>}
          {isEnd && <span className="step-position-tag tag-end">终点</span>}
        </div>
        <p className="step-summary">{step.summary}</p>
        {step.type === 'tool' && step.toolName && (
          <p className="step-detail">
            <span className="detail-label">工具：</span>
            <code className="tool-name">{step.toolName}</code>
          </p>
        )}
        {step.content && (
          <p className="step-detail step-content">{step.content}</p>
        )}
      </div>
    </div>
  )
}
