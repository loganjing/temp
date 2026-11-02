import { describe, it, expect } from 'vitest'
import { getSessionTrajectory } from '../src/data/sessionRepository.js'

describe('sessionRepository', () => {
  it('getSessionTrajectory 返回带派生编号的会话轨迹', () => {
    const session = getSessionTrajectory()
    expect(session.id).toBeDefined()
    expect(session.steps.length).toBeGreaterThanOrEqual(3)

    // 编号连续且从 1 开始
    session.steps.forEach((step, i) => {
      expect(step.seq).toBe(i + 1)
    })
  })

  it('首步为用户输入，末步为模型回复', () => {
    const session = getSessionTrajectory()
    const first = session.steps[0]
    const last = session.steps[session.steps.length - 1]

    expect(first.type).toBe('user')
    expect(last.type).toBe('model')
  })

  it('工具调用步骤均带工具名称', () => {
    const session = getSessionTrajectory()
    const toolSteps = session.steps.filter(s => s.type === 'tool')

    expect(toolSteps.length).toBeGreaterThanOrEqual(1)
    toolSteps.forEach(step => {
      expect(step.toolName).toBeTruthy()
    })
  })

  it('中间步骤不少于 5 个且模型回复与工具调用交替出现', () => {
    const session = getSessionTrajectory()
    const middle = session.steps.slice(1, -1)

    expect(middle.length).toBeGreaterThanOrEqual(5)

    // 检查交替：相邻的 model/tool 不重复
    for (let i = 1; i < middle.length; i++) {
      if (middle[i].type === 'tool') {
        expect(middle[i - 1].type).toBe('model')
      }
    }
  })

  it('每个步骤都有摘要', () => {
    const session = getSessionTrajectory()
    session.steps.forEach(step => {
      expect(step.summary).toBeTruthy()
      expect(step.summary.length).toBeGreaterThan(0)
    })
  })

  it('用户输入和模型回复步骤有要点内容', () => {
    const session = getSessionTrajectory()
    const userStep = session.steps.find(s => s.type === 'user')
    const modelSteps = session.steps.filter(s => s.type === 'model')

    expect(userStep.content).toBeTruthy()
    // 最终回复必须有内容
    const finalReply = modelSteps[modelSteps.length - 1]
    expect(finalReply.content).toBeTruthy()
  })
})
