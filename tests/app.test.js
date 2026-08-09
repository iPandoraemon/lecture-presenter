import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createApp, ROOT } from '../server/app.js';

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

test('GET /api/slides 返回 slides 目录下的 .md 课件列表', async () => {
  const res = await fetch(`${base}/api/slides`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.includes('demo.md'));
  assert.ok(list.every((f) => f.endsWith('.md')));
});

test('GET /api/deck 按绝对路径返回 .md 课件内容', async () => {
  const res = await fetch(`${base}/api/deck?path=${encodeURIComponent(path.join(ROOT, 'slides', 'demo.md'))}`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('示例课程'));
});

test('GET /api/deck 拒绝非 .md 文件', async () => {
  const res = await fetch(`${base}/api/deck?path=${encodeURIComponent(path.join(ROOT, 'package.json'))}`);
  assert.equal(res.status, 400);
});

test('GET /api/deck 拒绝相对路径', async () => {
  const res = await fetch(`${base}/api/deck?path=${encodeURIComponent('slides/demo.md')}`);
  assert.equal(res.status, 400);
});

test('GET /api/deck 文件不存在返回 404', async () => {
  const res = await fetch(`${base}/api/deck?path=${encodeURIComponent('/tmp/definitely-not-exist-xyz.md')}`);
  assert.equal(res.status, 404);
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

test('POST /api/ask agent 无有效模板时纯文本兜底(无 slide)', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'mock-text', question: '测试问题', slideContext: '' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.answer, '这是一段纯文本回答');
  assert.equal(data.slide, undefined);
});

test('POST /api/ask question 非字符串返回 400', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'mock', question: 123 }),
  });
  assert.equal(res.status, 400);
});
