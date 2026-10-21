// 启动冒烟：真实进程启动服务端入口，验证默认 DB 路径自动创建父目录与健康检查。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const appRoot = path.resolve(import.meta.dirname, '..')

test('服务入口启动：健康检查正常，数据库父目录自动创建', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-system-startup-'))
  const dbPath = path.join(directory, 'nested', 'deeper', 'application.db')
  const port = 30000 + Math.floor(Math.random() * 20000)
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: appRoot,
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, SMTP_HOST: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })
  try {
    let healthy = null
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      try {
        healthy = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (healthy.ok) break
        healthy = null
      } catch {
        // 服务尚未就绪，继续等待
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.ok(healthy, '服务在 30 秒内未完成健康检查')
    assert.equal(healthy.status, 200)
    assert.deepEqual(await healthy.json(), { ok: true, app: 'ticket-system' })
    const stats = await stat(dbPath)
    assert.ok(stats.isFile(), '数据库文件已在自动创建的父目录中生成')
  } finally {
    child.kill('SIGTERM')
    await new Promise((resolve) => {
      child.once('exit', resolve)
      setTimeout(() => child.kill('SIGKILL'), 5000).unref?.()
    })
    await rm(directory, { recursive: true, force: true })
  }
  assert.equal(stderr.includes('Error'), false, stderr)
})
