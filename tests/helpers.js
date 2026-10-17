import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/**
 * 测试辅助：真实启动服务（node src/server.js）。
 * - 独立临时 DB_PATH（mkdtemp 目录），互不干扰
 * - PORT=0 由系统分配空闲端口，从 stdout 的 listening 行解析
 * - stop() 结束进程并清理临时目录
 */
export async function startServer() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'ticket-api-test-'));
  const dbPath = path.join(tmpDir, 'app.db');
  const child = spawn(process.execPath, [path.join(projectRoot, 'src', 'server.js')], {
    cwd: projectRoot,
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + String(chunk)).slice(-2000);
  });

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`服务启动超时；stderr: ${stderrTail}`));
    }, 20000);
    let stdoutBuf = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuf += String(chunk);
      const m = stdoutBuf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`服务提前退出 code=${code}；stderr: ${stderrTail}`));
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(method, apiPath, { userId, body } = {}) {
    const headers = {};
    if (userId !== undefined) headers['X-User-Id'] = String(userId);
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json, text };
  }

  return {
    baseUrl,
    api,
    async stop() {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
      }
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.on('exit', resolve);
        setTimeout(resolve, 5000).unref?.();
      });
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/** 断言辅助：错误响应体符合契约 {"error": {code, message}} */
export function assertErrorShape(test, res, expectedStatus, expectedCode) {
  test.equal(res.status, expectedStatus, `status 应为 ${expectedStatus}，实际 ${res.status}：${res.text}`);
  test.ok(res.body && typeof res.body === 'object', '错误响应应为 JSON 对象');
  test.ok(res.body.error && typeof res.body.error === 'object', '错误响应应含 error 对象');
  test.equal(res.body.error.code, expectedCode, `错误码应为 ${expectedCode}，实际 ${res.body.error?.code}`);
  test.ok(typeof res.body.error.message === 'string' && res.body.error.message.length > 0, '错误信息应为非空字符串');
}
