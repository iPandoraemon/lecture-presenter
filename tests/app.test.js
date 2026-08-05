import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

let server, base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET /api/templates 返回 4 个内置模板', async () => {
  const res = await fetch(`${base}/api/templates`);
  const list = await res.json();
  assert.equal(list.length, 4);
  assert.ok(list.some((t) => t.id === 'key-points'));
});

test('GET /api/agents 返回 agent 列表', async () => {
  const res = await fetch(`${base}/api/agents`);
  const list = await res.json();
  assert.ok(list.some((a) => a.id === 'mock'));
});

test('POST /api/ask 用 mock agent 返回 answer 与渲染后的 slide', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'mock', question: '测试问题', slideContext: '' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.answer, '这是 mock 回答');
  assert.ok(data.slide.html.includes('甲'));
  assert.ok(data.slide.css.length > 0);
});

test('POST /api/ask 缺少参数返回 400', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(res.status, 400);
});

test('POST /api/ask 未知 agent 返回 400', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'nobody', question: 'x' }),
  });
  assert.equal(res.status, 400);
});
