import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createApp, ROOT } from '../server/app.js';

let server, base, provDir;
before(async () => {
  provDir = await mkdtemp(path.join(tmpdir(), 'app-prov-'));
  server = createApp({
    providersPath: path.join(provDir, 'providers.json'),
    piModelsPath: path.join(provDir, 'models.json'),
  }).listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const sampleProvider = {
  name: 'test-prov',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-x',
  model: 'm-1',
  extraArgs: '',
};

test('POST /api/providers 保存模型商并同步 pi models.json', async () => {
  const res = await fetch(`${base}/api/providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleProvider),
  });
  assert.equal(res.status, 200);
  const list = await (await fetch(`${base}/api/providers`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'test-prov');
  const piModels = JSON.parse(await readFile(path.join(provDir, 'models.json'), 'utf8'));
  assert.equal(piModels.providers['test-prov'].baseUrl, 'https://api.example.com/v1');
});

test('POST /api/providers 非法配置返回 400', async () => {
  const res = await fetch(`${base}/api/providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', baseUrl: 'x', model: '' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/ask 指定不存在的模型商返回 400', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'pi', provider: 'ghost', question: 'x' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /模型商/);
});

test('POST /api/ask 模型商对非 pi agent 不生效(mock 照常工作)', async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'mock', provider: 'test-prov', question: 'x' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.answer, '这是 mock 回答');
});

test('DELETE /api/providers/:name 删除模型商', async () => {
  const res = await fetch(`${base}/api/providers/test-prov`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  const list = await (await fetch(`${base}/api/providers`)).json();
  assert.equal(list.length, 0);
  const piModels = JSON.parse(await readFile(path.join(provDir, 'models.json'), 'utf8'));
  assert.equal(piModels.providers['test-prov'], undefined);
});


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

test('GET /api/media 返回图片文件', async () => {
  const img = path.join(provDir, 'pic.png');
  await writeFile(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const res = await fetch(`${base}/api/media?path=${encodeURIComponent(img)}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
});

test('GET /api/media 拒绝非图片扩展名', async () => {
  const res = await fetch(`${base}/api/media?path=${encodeURIComponent(path.join(ROOT, 'package.json'))}`);
  assert.equal(res.status, 400);
});

test('GET /api/media 文件不存在返回 404', async () => {
  const res = await fetch(`${base}/api/media?path=${encodeURIComponent('/tmp/no-such-pic-xyz.png')}`);
  assert.equal(res.status, 404);
});

test('POST /api/ask-stream 以 SSE 流式返回 text 事件与最终结果', async () => {
  const res = await fetch(`${base}/api/ask-stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'mock', question: '测试问题', slideContext: '' }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const body = await res.text();
  assert.ok(body.includes('"type":"text"'), '应包含 text 增量事件');
  assert.ok(body.includes('"type":"result"'), '应包含 result 事件');
  assert.ok(body.includes('这是 mock 回答'), 'result 应含回答');
  assert.ok(body.includes('slide'), 'result 应含幻灯片');
});

test('POST /api/ask-stream 未知 agent 返回 400', async () => {
  const res = await fetch(`${base}/api/ask-stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'nobody', question: 'x' }),
  });
  assert.equal(res.status, 400);
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
