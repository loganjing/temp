// Verification script: starts an isolated server instance, runs API self-checks, cleans up.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function waitForReady(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Server did not become ready within timeout'));
        return;
      }
      fetch(`http://localhost:${port}/api/health`)
        .then((res) => {
          if (res.ok) resolve();
          else setTimeout(attempt, 200);
        })
        .catch(() => setTimeout(attempt, 200));
    }
    attempt();
  });
}

async function api(port, method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

function extractCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  return setCookieHeader.split(';')[0];
}

async function main() {
  const port = await findFreePort();
  const dbPath = join(projectRoot, `data/verify-${process.pid}.sqlite`);

  console.log(`Starting isolated server on port ${port} (DB: ${dbPath})`);

  const child = spawn('npx', ['tsx', 'src/server/index.ts'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      SEED_ON_START: 'true',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  child.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  child.stderr.on('data', (data) => {
    serverOutput += data.toString();
    process.stderr.write(data);
  });

  const checks = [];

  try {
    await waitForReady(port);
    console.log('Server is ready. Running API self-checks...\n');

    // 1. GET /api/session without cookie
    let res = await api(port, 'GET', '/api/session');
    checks.push(['GET /api/session (no cookie) returns null user', res.json?.user === null]);

    // 2. POST /api/session login as u2 (submitter)
    res = await api(port, 'POST', '/api/session', { userId: 'u2' });
    const submitterCookie = extractCookie(res.headers.get('set-cookie'));
    checks.push(['POST /api/session login returns user u2', res.json?.user?.id === 'u2']);
    checks.push(['Submitter has submit_ticket capability', res.json?.capabilities?.includes('submit_ticket') === true]);

    // 3. POST /api/tickets create ticket (hardware auto-assign to g1)
    res = await api(port, 'POST', '/api/tickets', {
      subject: '验收测试工单',
      description: '这是一个验收测试工单的描述内容',
      category: '硬件故障',
      priority: 'P2',
    }, submitterCookie);
    checks.push(['POST /api/tickets returns 201', res.status === 201]);
    const ticketId = res.json?.ticket?.id;
    checks.push(['Ticket has generated id', typeof ticketId === 'string' && ticketId.startsWith('tk_')]);
    checks.push(['Ticket auto-assigned (pending_handling)', res.json?.ticket?.status === 'pending_handling']);
    checks.push(['Ticket assignment group is g1', res.json?.ticket?.assignment?.groupId === 'g1']);
    checks.push(['Ticket assignment mode is auto', res.json?.ticket?.assignment?.assignedMode === 'auto']);
    checks.push(['Ticket has submitter info', !!res.json?.ticket?.submitter?.name]);
    checks.push(['Ticket has createdAt', !!res.json?.ticket?.createdAt]);

    // 4. GET /api/tickets list
    res = await api(port, 'GET', '/api/tickets', null, submitterCookie);
    checks.push(['GET /api/tickets returns items array', Array.isArray(res.json?.items)]);
    checks.push(['Ticket list total > 0', res.json?.total > 0]);

    // 5. GET /api/tickets/:id detail
    res = await api(port, 'GET', `/api/tickets/${ticketId}`, null, submitterCookie);
    checks.push(['GET /api/tickets/:id returns ticket detail', res.json?.ticket?.id === ticketId]);
    checks.push(['Ticket detail has replies array', Array.isArray(res.json?.replies)]);
    checks.push(['Ticket detail has transfers array', Array.isArray(res.json?.transfers)]);
    checks.push(['Ticket detail has logs array', Array.isArray(res.json?.logs)]);

    // 6. Login as handler u3
    res = await api(port, 'POST', '/api/session', { userId: 'u3' });
    const handlerCookie = extractCookie(res.headers.get('set-cookie'));
    checks.push(['Handler u3 login', res.json?.user?.id === 'u3']);
    checks.push(['Handler has handle_ticket capability', res.json?.capabilities?.includes('handle_ticket') === true]);

    // 7. POST /api/tickets/:id/replies handler reply
    res = await api(port, 'POST', `/api/tickets/${ticketId}/replies`, {
      content: '已收到工单，正在处理中。',
    }, handlerCookie);
    checks.push(['Handler reply returns 201', res.status === 201]);
    checks.push(['Reply authorRole is handler', res.json?.reply?.authorRole === 'handler']);

    // 8. Submitter reply
    res = await api(port, 'POST', `/api/tickets/${ticketId}/replies`, {
      content: '好的，谢谢。',
    }, submitterCookie);
    checks.push(['Submitter reply returns 201', res.status === 201]);
    checks.push(['Reply authorRole is submitter', res.json?.reply?.authorRole === 'submitter']);

    // 9. POST /api/tickets/:id/transfer
    res = await api(port, 'POST', `/api/tickets/${ticketId}/transfer`, {
      assigneeId: 'u4',
      note: '转派给赵敏处理',
    }, handlerCookie);
    checks.push(['Transfer returns 200', res.status === 200]);
    checks.push(['Transfer recorded', !!res.json?.transfer?.id]);
    checks.push(['Ticket assignee changed to u4', res.json?.ticket?.assignment?.assigneeId === 'u4']);
    checks.push(['Ticket assignedMode is manual', res.json?.ticket?.assignment?.assignedMode === 'manual']);

    // 10. POST /api/tickets/:id/complete
    res = await api(port, 'POST', `/api/tickets/${ticketId}/complete`, {
      resolution: '问题已解决。',
    }, handlerCookie);
    checks.push(['Complete returns 200', res.status === 200]);
    checks.push(['Ticket status is completed', res.json?.ticket?.status === 'completed']);
    checks.push(['Ticket has completion info', !!res.json?.ticket?.completion?.handledBy]);
    checks.push(['Complete returns notification', !!res.json?.notification?.id]);
    checks.push(['Notification status is sent', res.json?.notification?.status === 'sent']);

    // 11. POST /api/tickets/:id/rating
    res = await api(port, 'POST', `/api/tickets/${ticketId}/rating`, {
      score: 5,
    }, submitterCookie);
    checks.push(['Rating returns 201', res.status === 201]);
    checks.push(['Rating score is 5', res.json?.rating?.score === 5]);

    // 12. Duplicate rating
    res = await api(port, 'POST', `/api/tickets/${ticketId}/rating`, {
      score: 3,
    }, submitterCookie);
    checks.push(['Duplicate rating returns 409', res.status === 409]);
    checks.push(['Duplicate rating code is ALREADY_RATED', res.json?.error?.code === 'ALREADY_RATED']);

    // 13. Reply on completed ticket
    res = await api(port, 'POST', `/api/tickets/${ticketId}/replies`, {
      content: '测试终态回复',
    }, handlerCookie);
    checks.push(['Reply on completed ticket returns 409', res.status === 409]);
    checks.push(['Reply on completed returns INVALID_TRANSITION', res.json?.error?.code === 'INVALID_TRANSITION']);

    // 14. Company isolation
    res = await api(port, 'POST', '/api/session', { userId: 'u7' });
    const betaCookie = extractCookie(res.headers.get('set-cookie'));
    res = await api(port, 'GET', `/api/tickets/${ticketId}`, null, betaCookie);
    checks.push(['Cross-company ticket access returns 404', res.status === 404]);
    checks.push(['Cross-company code is NOT_FOUND', res.json?.error?.code === 'NOT_FOUND']);

    // 15. Beta user sees only Beta tickets
    res = await api(port, 'GET', '/api/tickets', null, betaCookie);
    checks.push(['Beta user sees only Beta tickets', res.json?.items?.every(t => t.companyId === 'c2')]);

    // 16. GET /api/tickets/:id/logs
    res = await api(port, 'GET', `/api/tickets/${ticketId}/logs`, null, submitterCookie);
    checks.push(['GET /api/tickets/:id/logs returns items', Array.isArray(res.json?.items) && res.json.items.length > 0]);

    // 17. GET /api/users/:id/profile
    res = await api(port, 'GET', '/api/users/u2/profile', null, handlerCookie);
    checks.push(['GET /api/users/:id/profile returns user', res.json?.user?.id === 'u2']);
    checks.push(['Profile has historyTickets', !!res.json?.historyTickets]);

    // 18. GET /api/business-groups
    res = await api(port, 'GET', '/api/business-groups', null, handlerCookie);
    checks.push(['GET /api/business-groups returns items', Array.isArray(res.json?.items) && res.json.items.length > 0]);

    // 19. GET /api/assignment-rules
    res = await api(port, 'GET', '/api/assignment-rules', null, handlerCookie);
    checks.push(['GET /api/assignment-rules returns items', Array.isArray(res.json?.items) && res.json.items.length > 0]);

    // 20. GET /api/stats/distribution?dimension=department
    res = await api(port, 'GET', '/api/stats/distribution?dimension=department', null, handlerCookie);
    checks.push(['GET /api/stats/distribution returns items', Array.isArray(res.json?.items)]);
    checks.push(['Distribution has total > 0', res.json?.total > 0]);

    // 21. GET /api/stats/dashboard
    res = await api(port, 'GET', '/api/stats/dashboard', null, handlerCookie);
    checks.push(['GET /api/stats/dashboard returns ticketCount', typeof res.json?.ticketCount === 'number']);
    checks.push(['Dashboard has hotCategories array', Array.isArray(res.json?.hotCategories)]);

    // 22. GET /api/notifications
    res = await api(port, 'GET', '/api/notifications', null, handlerCookie);
    checks.push(['GET /api/notifications returns items', Array.isArray(res.json?.items)]);

    // 23. Create unassigned ticket (no rule for category)
    res = await api(port, 'POST', '/api/tickets', {
      subject: '无规则分类工单',
      description: '测试未命中分配规则的工单',
      category: '未知分类',
      priority: 'P3',
    }, submitterCookie);
    checks.push(['Unmatched category pending_assignment', res.json?.ticket?.status === 'pending_assignment']);
    checks.push(['Unmatched ticket assignment is null', res.json?.ticket?.assignment === null]);

    // 24. Unauthenticated access
    res = await api(port, 'GET', '/api/tickets');
    checks.push(['Unauthenticated returns 401', res.status === 401]);
    checks.push(['Unauthenticated code is UNAUTHENTICATED', res.json?.error?.code === 'UNAUTHENTICATED']);

    // 25. Cancel a pending ticket
    const cancelRes = await api(port, 'POST', '/api/tickets', {
      subject: '待取消工单',
      description: '测试取消功能',
      category: '未知分类',
      priority: 'P3',
    }, submitterCookie);
    const cancelTicketId = cancelRes.json?.ticket?.id;
    res = await api(port, 'POST', `/api/tickets/${cancelTicketId}/cancel`, {
      reason: '不需要了',
    }, submitterCookie);
    checks.push(['Cancel returns 200', res.status === 200]);
    checks.push(['Cancelled ticket status', res.json?.ticket?.status === 'cancelled']);

    // 26. Cancel on cancelled ticket
    res = await api(port, 'POST', `/api/tickets/${cancelTicketId}/cancel`, {}, submitterCookie);
    checks.push(['Cancel on cancelled returns 409', res.status === 409]);

    // 27. Admin login and configure_assignment
    res = await api(port, 'POST', '/api/session', { userId: 'u1' });
    const adminCookie = extractCookie(res.headers.get('set-cookie'));
    checks.push(['Admin u1 has configure_assignment', res.json?.capabilities?.includes('configure_assignment') === true]);

    // 28. Create business group
    res = await api(port, 'POST', '/api/business-groups', {
      name: '验收测试组',
    }, adminCookie);
    checks.push(['Create business group returns 201', res.status === 201]);

    // 29. Submitter without configure_assignment FORBIDDEN
    res = await api(port, 'POST', '/api/business-groups', {
      name: '无权限测试',
    }, submitterCookie);
    checks.push(['Submitter creating group returns 403', res.status === 403]);
    checks.push(['Submitter creating group code is FORBIDDEN', res.json?.error?.code === 'FORBIDDEN']);

  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));

    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (existsSync(p)) {
        try { unlinkSync(p); } catch {}
      }
    }
  }

  let passed = 0;
  let failed = 0;
  for (const [name, pass] of checks) {
    if (pass) {
      passed++;
    } else {
      failed++;
      console.error(`  FAIL: ${name}`);
    }
  }

  console.log(`\n${passed}/${checks.length} checks passed.`);
  if (failed > 0) {
    console.error(`${failed} checks FAILED.`);
    process.exit(1);
  } else {
    console.log('All checks passed.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
