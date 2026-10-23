import { spawn } from 'node:child_process';

/**
 * 开发脚本：同时启动后端（tsx watch 热更新）和前端（vite dev server）。
 * 后端端口默认 3000，前端端口默认 5173，vite 自动代理 /api → 后端。
 */
function run(cmd: string, args: string[], label: string) {
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  proc.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${label}] 进程退出，退出码 ${code}`);
      process.exit(code ?? 1);
    }
  });

  return proc;
}

const serverProc = run('tsx', ['watch', 'src/server/index.ts'], 'server');
const viteProc = run('vite', [], 'vite');

function killAll() {
  serverProc.kill('SIGTERM');
  viteProc.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);
