# Lecture Presenter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个课堂演示工具:左侧 reveal.js Markdown 课件,右侧聊天框连接可配置 CLI Agent,Agent 返回"模板 id + 槽位"JSON,渲染为动态幻灯片插入课件。

**Architecture:** Node(ESM)+ Express 后端,无构建步骤;前端为 reveal.js(CDN)+ 原生 JS 单页。后端扫描 `templates/` 目录自动注册模板,通过 `config/agents.json` 适配器 spawn CLI。

**Tech Stack:** Node >= 18(内置 fetch、`node --test`)、Express 4、reveal.js 4.6.1(CDN)。

**设计文档:** `docs/plans/2026-08-05-lecture-presenter-design.md`(已批准)

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config/agents.json`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "lecture-presenter",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
```

- [ ] **Step 2: 写 .gitignore**

```
node_modules/
```

- [ ] **Step 3: 写 config/agents.json**

`mock` agent 用于无真实 CLI 时的演示与测试;真实 CLI 未安装时把对应 `enabled` 改为 `false`。

```json
{
  "claude": { "enabled": true, "command": "claude", "args": ["-p", "{prompt}"], "timeout": 60 },
  "kimi": { "enabled": true, "command": "kimi", "args": ["-p", "{prompt}"], "timeout": 60 },
  "mock": {
    "enabled": true,
    "command": "node",
    "args": ["-e", "console.log(JSON.stringify({template:'key-points',slots:{title:'示例标题',points:['甲','乙','丙']},answer:'这是 mock 回答'}))"],
    "timeout": 10
  }
}
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`
Expected: 生成 `node_modules/` 与 `package-lock.json`,无报错

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore config/agents.json
git commit -m "chore: 项目脚手架与 agent 适配器配置"
```

---

### Task 2: Agent 输出解析(parse.js)

**Files:**
- Create: `server/parse.js`
- Test: `tests/parse.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentOutput } from '../server/parse.js';

test('解析合法 JSON 输出', () => {
  const out = parseAgentOutput('{"template":"key-points","slots":{"title":"t","points":["a"]},"answer":"你好"}');
  assert.equal(out.template, 'key-points');
  assert.deepEqual(out.slots, { title: 't', points: ['a'] });
  assert.equal(out.answer, '你好');
});

test('JSON 前后有杂质也能解析', () => {
  const out = parseAgentOutput('前言...\n{"answer":"只答"}\n后记');
  assert.equal(out.answer, '只答');
  assert.equal(out.template, undefined);
});

test('纯文本兜底', () => {
  const out = parseAgentOutput('这是一段普通回答');
  assert.deepEqual(out, { answer: '这是一段普通回答' });
});

test('非法 JSON 兜底为原文', () => {
  const out = parseAgentOutput('{broken json}');
  assert.equal(out.answer, '{broken json}');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/parse.test.js`
Expected: FAIL,`Cannot find module '../server/parse.js'`

- [ ] **Step 3: 实现 server/parse.js**

```js
// 解析 CLI agent 的 stdout:提取第一个 JSON 对象,失败则整体作为纯文本回答
export function parseAgentOutput(stdout) {
  const text = String(stdout ?? '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { answer: text };
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.answer !== 'string' || !obj.answer) return { answer: text };
    if (typeof obj.template === 'string' && obj.slots && typeof obj.slots === 'object') {
      return { template: obj.template, slots: obj.slots, answer: obj.answer };
    }
    return { answer: obj.answer };
  } catch {
    return { answer: text };
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/parse.test.js`
Expected: 4 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/parse.js tests/parse.test.js
git commit -m "feat: agent 输出 JSON 解析与纯文本兜底"
```

---

### Task 3: 模板加载、校验与渲染(templates.js)

**Files:**
- Create: `server/templates.js`
- Test: `tests/templates.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTemplates, validateSlots, renderTemplate } from '../server/templates.js';

async function makeTemplatesDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tpl-'));
  const t = path.join(dir, 'demo');
  await mkdir(t);
  await writeFile(path.join(t, 'meta.json'), JSON.stringify({
    name: '演示', description: '测试用',
    slots: { title: { type: 'text' }, points: { type: 'list', maxItems: 3 } },
  }));
  await writeFile(path.join(t, 'view.html'), '<h2>{{title}}</h2><ul>{{points}}</ul>');
  await writeFile(path.join(t, 'style.css'), '.demo{color:red}');
  await mkdir(path.join(dir, 'incomplete')); // 缺文件,应被跳过
  return dir;
}

test('loadTemplates 扫描目录并跳过不完整模板', async () => {
  const dir = await makeTemplatesDir();
  const templates = await loadTemplates(dir);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].id, 'demo');
  assert.equal(templates[0].name, '演示');
  assert.ok(templates[0].view.includes('{{title}}'));
  assert.ok(templates[0].style.includes('color:red'));
});

test('validateSlots 截断超长列表并填充默认值', () => {
  const tpl = { slots: { title: { type: 'text' }, points: { type: 'list', maxItems: 3 } } };
  const slots = validateSlots(tpl, { points: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(slots.points, ['a', 'b', 'c']);
  assert.equal(slots.title, '');
});

test('renderTemplate 替换槽位并转义 HTML', () => {
  const tpl = {
    view: '<h2>{{title}}</h2><ul>{{points}}</ul>',
    slots: { title: { type: 'text' }, points: { type: 'list' } },
  };
  const html = renderTemplate(tpl, { title: '<script>x</script>', points: ['甲', '乙'] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<li>甲</li><li>乙</li>'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/templates.test.js`
Expected: FAIL,`Cannot find module '../server/templates.js'`

- [ ] **Step 3: 实现 server/templates.js**

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// 扫描 dir,每个含 meta.json + view.html + style.css 的子目录注册为一个模板
export async function loadTemplates(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const tplDir = path.join(dir, entry.name);
    try {
      const [metaRaw, view, style] = await Promise.all([
        readFile(path.join(tplDir, 'meta.json'), 'utf8'),
        readFile(path.join(tplDir, 'view.html'), 'utf8'),
        readFile(path.join(tplDir, 'style.css'), 'utf8'),
      ]);
      const meta = JSON.parse(metaRaw);
      templates.push({ id: entry.name, ...meta, view, style });
    } catch {
      // 目录不完整或 meta.json 非法,跳过
    }
  }
  return templates;
}

// 按 tpl.slots 定义清洗 agent 返回的槽位:列表截断到 maxItems,缺失填空
export function validateSlots(tpl, slots) {
  const result = {};
  for (const [name, def] of Object.entries(tpl.slots)) {
    let value = slots?.[name];
    if (def.type === 'list') {
      if (!Array.isArray(value)) value = value == null ? [] : [String(value)];
      value = value.map(String).slice(0, def.maxItems ?? value.length);
    } else {
      value = value == null ? '' : String(value);
    }
    result[name] = value;
  }
  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 字符串替换渲染;list 槽位渲染为 <li> 序列;所有内容 HTML 转义
export function renderTemplate(tpl, slots) {
  let html = tpl.view;
  for (const [name, def] of Object.entries(tpl.slots)) {
    const value = slots[name];
    const replacement = def.type === 'list'
      ? (Array.isArray(value) ? value : []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : escapeHtml(value ?? '');
    html = html.split(`{{${name}}}`).join(replacement);
  }
  return html;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/templates.test.js`
Expected: 3 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/templates.js tests/templates.test.js
git commit -m "feat: 模板扫描加载、槽位校验与转义渲染"
```

---

### Task 4: Prompt 拼接(prompt.js)

**Files:**
- Create: `server/prompt.js`
- Test: `tests/prompt.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../server/prompt.js';

test('buildPrompt 包含问题、上下文、模板清单与 JSON 契约', () => {
  const p = buildPrompt({
    question: '什么是闭包?',
    slideContext: '# 函数',
    templates: [{ id: 'key-points', description: '要点', slots: { title: { type: 'text' } } }],
  });
  assert.ok(p.includes('什么是闭包?'));
  assert.ok(p.includes('# 函数'));
  assert.ok(p.includes('key-points'));
  assert.ok(p.includes('"answer"'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/prompt.test.js`
Expected: FAIL,`Cannot find module '../server/prompt.js'`

- [ ] **Step 3: 实现 server/prompt.js**

```js
// 拼出发给 CLI agent 的完整 prompt:课件上下文 + 模板清单 + 严格 JSON 输出契约
export function buildPrompt({ question, slideContext, templates }) {
  const tplList = templates.map((t) => {
    const slotDesc = Object.entries(t.slots)
      .map(([name, def]) => `    - ${name}(${def.type}${def.type === 'list' ? `,最多 ${def.maxItems ?? '不限'} 条` : ''})`)
      .join('\n');
    return `- 模板 id: "${t.id}"\n  适用场景: ${t.description}\n  槽位:\n${slotDesc}`;
  }).join('\n');

  return `你是课堂助教,正在配合教师讲课。请回答下面的问题,并从可用模板中选一个最合适的来组织展示内容。

当前课件页内容:
"""
${slideContext}
"""

可用模板:
${tplList}

问题: ${question}

要求:
1. 只输出一个 JSON 对象,不要输出任何其他文字、解释或 markdown 代码块标记。
2. JSON 格式: {"template": "<模板id>", "slots": {<各槽位内容>}, "answer": "<一两句话的文字回答>"}
3. slots 的键必须与所选模板的槽位完全一致,list 类型槽位用字符串数组。
4. 内容用中文,简洁,适合课堂投影展示。`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/prompt.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/prompt.js tests/prompt.test.js
git commit -m "feat: 课堂助教 prompt 拼接"
```

---

### Task 5: Agent 适配器(agents.js)

**Files:**
- Create: `server/agents.js`
- Test: `tests/agents.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../server/agents.js';

test('runAgent 替换 {prompt} 并返回 stdout', async () => {
  const out = await runAgent(
    { command: 'node', args: ['-e', 'console.log("{prompt}")'], timeout: 5 },
    '你好',
  );
  assert.equal(out.trim(), '你好');
});

test('disabled agent 抛错', async () => {
  await assert.rejects(
    () => runAgent({ enabled: false, command: 'node', args: [] }, 'x'),
    /不可用/,
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/agents.test.js`
Expected: FAIL,`Cannot find module '../server/agents.js'`

- [ ] **Step 3: 实现 server/agents.js**

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const execFileP = promisify(execFile);

export async function loadAgents(configPath) {
  const raw = await readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

// 按适配器配置调用 CLI:args 中的 {prompt} 替换为完整 prompt,返回 stdout
export async function runAgent(agentCfg, prompt) {
  if (!agentCfg || agentCfg.enabled === false) {
    throw new Error('agent 不可用');
  }
  const args = agentCfg.args.map((a) => a.replace('{prompt}', prompt));
  const { stdout } = await execFileP(agentCfg.command, args, {
    timeout: (agentCfg.timeout ?? 60) * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/agents.test.js`
Expected: 2 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/agents.js tests/agents.test.js
git commit -m "feat: CLI agent 适配器(spawn + 超时)"
```

---

### Task 6: 内置 4 个模板 + 扩展指南

**Files:**
- Create: `templates/key-points/{meta.json,view.html,style.css}`
- Create: `templates/comparison/{meta.json,view.html,style.css}`
- Create: `templates/code-explain/{meta.json,view.html,style.css}`
- Create: `templates/diagram-flow/{meta.json,view.html,style.css}`
- Create: `templates/README.md`

- [ ] **Step 1: 写 templates/key-points/**

`meta.json`:

```json
{
  "name": "要点卡片",
  "description": "概念讲解类问题:一个标题加 3~6 个要点",
  "slots": {
    "title": { "type": "text" },
    "points": { "type": "list", "maxItems": 6 }
  }
}
```

`view.html`:

```html
<div class="tpl-key-points">
  <h2>{{title}}</h2>
  <ul class="kp-list">{{points}}</ul>
</div>
```

`style.css`:

```css
.tpl-key-points h2 { margin-bottom: 0.6em; }
.tpl-key-points .kp-list { list-style: none; padding: 0; display: grid; gap: 0.4em; }
.tpl-key-points .kp-list li {
  background: #eef4ff; border-left: 6px solid #3b82f6; border-radius: 8px;
  padding: 0.4em 0.8em; font-size: 0.85em; text-align: left;
}
```

- [ ] **Step 2: 写 templates/comparison/**

`meta.json`:

```json
{
  "name": "双栏对比",
  "description": "A vs B 对比类问题:两个对象各自的要点对照",
  "slots": {
    "title": { "type": "text" },
    "leftTitle": { "type": "text" },
    "leftPoints": { "type": "list", "maxItems": 6 },
    "rightTitle": { "type": "text" },
    "rightPoints": { "type": "list", "maxItems": 6 }
  }
}
```

`view.html`:

```html
<div class="tpl-comparison">
  <h2>{{title}}</h2>
  <div class="cmp-cols">
    <div class="cmp-col cmp-left">
      <h3>{{leftTitle}}</h3>
      <ul>{{leftPoints}}</ul>
    </div>
    <div class="cmp-col cmp-right">
      <h3>{{rightTitle}}</h3>
      <ul>{{rightPoints}}</ul>
    </div>
  </div>
</div>
```

`style.css`:

```css
.tpl-comparison .cmp-cols { display: flex; gap: 0.8em; }
.tpl-comparison .cmp-col { flex: 1; border-radius: 10px; padding: 0.5em 0.8em; }
.tpl-comparison .cmp-left { background: #eef4ff; border-top: 6px solid #3b82f6; }
.tpl-comparison .cmp-right { background: #fdf0e6; border-top: 6px solid #f59e0b; }
.tpl-comparison h3 { margin: 0.2em 0 0.4em; }
.tpl-comparison ul { list-style: none; padding: 0; display: grid; gap: 0.3em; }
.tpl-comparison li {
  background: #ffffffcc; border-radius: 6px; padding: 0.3em 0.6em;
  font-size: 0.8em; text-align: left;
}
```

- [ ] **Step 3: 写 templates/code-explain/**

`meta.json`:

```json
{
  "name": "代码讲解",
  "description": "代码类问题:一段代码加逐条解释",
  "slots": {
    "title": { "type": "text" },
    "code": { "type": "text" },
    "explanations": { "type": "list", "maxItems": 6 }
  }
}
```

`view.html`:

```html
<div class="tpl-code-explain">
  <h2>{{title}}</h2>
  <pre><code>{{code}}</code></pre>
  <ol class="ce-list">{{explanations}}</ol>
</div>
```

`style.css`:

```css
.tpl-code-explain pre {
  background: #1e293b; color: #e2e8f0; border-radius: 10px;
  padding: 0.6em 0.9em; text-align: left; font-size: 0.7em;
  white-space: pre-wrap; margin: 0 0 0.6em;
}
.tpl-code-explain .ce-list { padding-left: 1.2em; display: grid; gap: 0.3em; }
.tpl-code-explain .ce-list li {
  background: #f0fdf4; border-left: 6px solid #22c55e; border-radius: 8px;
  padding: 0.3em 0.7em; font-size: 0.8em; text-align: left;
}
```

- [ ] **Step 4: 写 templates/diagram-flow/**

`meta.json`:

```json
{
  "name": "流程图",
  "description": "流程/原理类问题:3~5 个按顺序的步骤",
  "slots": {
    "title": { "type": "text" },
    "steps": { "type": "list", "maxItems": 5 }
  }
}
```

`view.html`:

```html
<div class="tpl-diagram-flow">
  <h2>{{title}}</h2>
  <ol class="flow-list">{{steps}}</ol>
</div>
```

`style.css`:

```css
.tpl-diagram-flow .flow-list {
  list-style: none; padding: 0; display: flex; flex-direction: column;
  align-items: center; gap: 0.9em;
}
.tpl-diagram-flow .flow-list li {
  background: #f5f3ff; border: 2px solid #8b5cf6; border-radius: 999px;
  padding: 0.35em 1.4em; font-size: 0.85em; position: relative;
}
.tpl-diagram-flow .flow-list li:not(:last-child)::after {
  content: '▼'; position: absolute; left: 50%; transform: translateX(-50%);
  bottom: -1.05em; color: #8b5cf6; font-size: 0.8em;
}
```

- [ ] **Step 5: 写 templates/README.md(扩展指南)**

````markdown
# 模板扩展指南

新增模板 = 在本目录新建一个子目录,放入 3 个文件,重启服务即可,无需改代码。

## 目录结构

```
templates/<模板id>/
├── meta.json   # 元数据与槽位定义
├── view.html   # 视图,槽位用 {{槽位名}} 占位
└── style.css   # 样式,建议所有选择器以 .tpl-<模板id> 开头避免冲突
```

## meta.json schema

```json
{
  "name": "显示名称",
  "description": "适用场景描述(会写进 prompt,agent 靠它选模板,务必写清楚)",
  "slots": {
    "槽位名": { "type": "text" },
    "列表槽位名": { "type": "list", "maxItems": 5 }
  }
}
```

- `type: "text"` — 纯文本,HTML 转义后替换 `{{槽位名}}`
- `type: "list"` — 字符串数组,渲染为 `<li>` 序列替换占位符,view 中应放在 `<ul>`/`<ol>` 内
- `maxItems` 可省略(不限),超出会被截断

## 调试

- `GET /api/templates` 查看当前已注册模板
- 用 `mock` agent 或手动构造 JSON 验证渲染效果
````

- [ ] **Step 6: 冒烟验证**

Run: `node -e "import('./server/templates.js').then(m => m.loadTemplates('templates')).then(t => console.log(t.map(x => x.id)))"`
Expected: `[ 'code-explain', 'comparison', 'diagram-flow', 'key-points' ]`(顺序可能不同,共 4 个)

- [ ] **Step 7: Commit**

```bash
git add templates/
git commit -m "feat: 内置 4 个展示模板与扩展指南"
```

---

### Task 7: HTTP API(app.js + index.js)

**Files:**
- Create: `server/app.js`
- Create: `server/index.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: 写失败测试**

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/app.test.js`
Expected: FAIL,`Cannot find module '../server/app.js'`

- [ ] **Step 3: 实现 server/app.js**

```js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgents, runAgent } from './agents.js';
import { loadTemplates, validateSlots, renderTemplate } from './templates.js';
import { parseAgentOutput } from './parse.js';
import { buildPrompt } from './prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/slides', express.static(path.join(ROOT, 'slides')));

  app.get('/api/templates', async (req, res) => {
    const templates = await loadTemplates(path.join(ROOT, 'templates'));
    res.json(templates.map(({ id, name, description }) => ({ id, name, description })));
  });

  app.get('/api/agents', async (req, res) => {
    const agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
    res.json(Object.entries(agents).map(([id, a]) => ({ id, enabled: a.enabled !== false })));
  });

  app.post('/api/ask', async (req, res) => {
    const { agent, question, slideContext } = req.body ?? {};
    if (!agent || !question) {
      return res.status(400).json({ error: '缺少 agent 或 question' });
    }
    try {
      const agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
      const cfg = agents[agent];
      if (!cfg || cfg.enabled === false) {
        return res.status(400).json({ error: `agent "${agent}" 不可用` });
      }
      const templates = await loadTemplates(path.join(ROOT, 'templates'));
      const prompt = buildPrompt({ question, slideContext: slideContext ?? '', templates });
      const stdout = await runAgent(cfg, prompt);
      const parsed = parseAgentOutput(stdout);
      const tpl = parsed.template && templates.find((t) => t.id === parsed.template);
      if (!tpl) {
        // 无模板或模板 id 不存在:纯文本兜底
        return res.json({ answer: parsed.answer });
      }
      const slots = validateSlots(tpl, parsed.slots);
      const html = renderTemplate(tpl, slots);
      res.json({ answer: parsed.answer, slide: { templateId: tpl.id, html, css: tpl.style } });
    } catch (err) {
      res.status(502).json({ error: `agent 调用失败: ${err.message}` });
    }
  });

  return app;
}
```

- [ ] **Step 4: 实现 server/index.js**

```js
import { createApp } from './app.js';

const port = process.env.PORT ?? 3000;
createApp().listen(port, () => {
  console.log(`lecture-presenter: http://localhost:${port}`);
});
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/app.test.js`
Expected: 5 个测试全部 PASS

- [ ] **Step 6: 全量回归**

Run: `npm test`
Expected: 全部测试 PASS(共 15 个)

- [ ] **Step 7: Commit**

```bash
git add server/app.js server/index.js tests/app.test.js
git commit -m "feat: HTTP API(templates/agents/ask)"
```

---

### Task 8: 前端页面(public/)

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`
- Create: `slides/demo.md`

前端无构建步骤,以手动验收为主,不写自动化测试。

- [ ] **Step 1: 写 public/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Lecture Presenter</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/theme/white.css" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div id="layout">
    <div id="slide-pane">
      <div class="reveal">
        <div class="slides">
          <section data-markdown="/slides/demo.md"
                   data-separator="^\n---\n$"
                   data-separator-notes="^Note:"></section>
        </div>
      </div>
    </div>
    <div id="chat-pane">
      <div id="chat-header">
        <select id="agent-select"></select>
        <span id="agent-status" class="dot"></span>
      </div>
      <div id="chat-log"></div>
      <div id="chat-input-row">
        <input id="chat-input" type="text" placeholder="向 AI 助教提问…" autocomplete="off" />
        <button id="chat-send">发送</button>
      </div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/markdown/markdown.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 public/style.css**

```css
html, body { height: 100%; margin: 0; }
#layout { display: flex; height: 100vh; }
#slide-pane { flex: 7; position: relative; }
#slide-pane .reveal { position: absolute; inset: 0; }
#chat-pane {
  flex: 3; display: flex; flex-direction: column; min-width: 280px;
  border-left: 1px solid #ddd; background: #fafafa;
  font-family: -apple-system, "PingFang SC", sans-serif;
}
#chat-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px; border-bottom: 1px solid #e5e5e5;
}
#agent-select { flex: 1; padding: 6px; font-size: 14px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }
.dot.busy { background: #f59e0b; animation: blink 0.8s infinite alternate; }
@keyframes blink { to { opacity: 0.3; } }
#chat-log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.bubble {
  max-width: 90%; padding: 8px 12px; border-radius: 12px;
  font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.bubble.user { align-self: flex-end; background: #3b82f6; color: #fff; }
.bubble.ai { align-self: flex-start; background: #fff; border: 1px solid #e5e5e5; }
.bubble.error { align-self: flex-start; background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; }
#chat-input-row { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e5e5e5; }
#chat-input { flex: 1; padding: 8px; font-size: 14px; border: 1px solid #ccc; border-radius: 8px; }
#chat-send { padding: 8px 16px; border: none; border-radius: 8px; background: #3b82f6; color: #fff; cursor: pointer; }
.ai-badge {
  position: absolute; top: 8px; right: 12px; font-size: 14px;
  background: #8b5cf6; color: #fff; padding: 2px 10px; border-radius: 999px;
}
```

- [ ] **Step 3: 写 public/app.js**

```js
/* global Reveal, RevealMarkdown */
const deck = new Reveal({ hash: false, transition: 'slide', plugins: [RevealMarkdown] });
deck.initialize();

const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const agentSelect = document.getElementById('agent-select');
const statusDot = document.getElementById('agent-status');

async function loadAgents() {
  const res = await fetch('/api/agents');
  const agents = await res.json();
  for (const a of agents) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.id + (a.enabled ? '' : '(不可用)');
    opt.disabled = !a.enabled;
    agentSelect.appendChild(opt);
  }
}
loadAgents();

function appendBubble(role, text) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function insertDynamicSlide(slide) {
  const section = document.createElement('section');
  const style = document.createElement('style');
  style.textContent = slide.css;
  section.appendChild(style);
  const body = document.createElement('div');
  body.innerHTML = slide.html;
  section.appendChild(body);
  const badge = document.createElement('div');
  badge.className = 'ai-badge';
  badge.textContent = 'AI 生成';
  section.appendChild(badge);
  const current = document.querySelector('.slides > section.present');
  if (current) current.after(section);
  else document.querySelector('.slides').appendChild(section);
  deck.sync();
  deck.next();
}

let sending = false;
async function send() {
  const question = chatInput.value.trim();
  if (!question || sending) return;
  sending = true;
  statusDot.className = 'dot busy';
  appendBubble('user', question);
  chatInput.value = '';
  try {
    const slideContext =
      document.querySelector('.slides > section.present')?.textContent ?? '';
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentSelect.value, question, slideContext }),
    });
    const data = await res.json();
    if (!res.ok) {
      appendBubble('ai error', data.error ?? '请求失败');
    } else {
      appendBubble('ai', data.answer ?? '');
      if (data.slide) insertDynamicSlide(data.slide);
    }
  } catch (err) {
    appendBubble('ai error', '网络错误: ' + err.message);
  } finally {
    sending = false;
    statusDot.className = 'dot';
  }
}

sendBtn.addEventListener('click', send);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.stopPropagation();
    send();
  }
});
```

- [ ] **Step 4: 写 slides/demo.md(示例课件)**

```markdown
# 示例课程
## Lecture Presenter 演示

左侧是课件,右侧可以向 AI 助教提问。

---

## 第二页:试一试

- 在右侧输入一个问题,例如"什么是闭包?"
- AI 的回答会以动态幻灯片插入到本页之后
- 按 ← 返回本页

Note: 这是演讲者备注,不会显示。

---

## 第三页:结束

谢谢观看!
```

- [ ] **Step 5: 手动验收**

Run: `npm start`,浏览器打开 `http://localhost:3000`
Expected:
1. 左侧显示 demo.md 第一页,→ 键可翻页(共 3 页)
2. 右栏下拉框含 claude / kimi / mock
3. 选择 `mock`,发送"测试问题" → 右栏出现"这是 mock 回答"气泡;左栏自动跳到一张"示例标题 + 甲/乙/丙"蓝色要点卡片幻灯片,右上角有"AI 生成"标记;按 ← 可回到原页
4. 选择 `claude`(若本机未安装 claude CLI)→ 右栏出现错误气泡,课件不受影响

- [ ] **Step 6: Commit**

```bash
git add public/ slides/demo.md
git commit -m "feat: 双栏前端页面与动态幻灯片插入"
```

---

### Task 9: 项目 README 与最终回归

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README.md**

````markdown
# Lecture Presenter

课堂演示工具:左侧 Markdown 课件(reveal.js),右侧对话框连接 CLI Agent(Claude Code / Kimi 等)。提问后 Agent 选择预置模板并填入内容,渲染为动态幻灯片插入课件。

## 快速开始

```bash
npm install
npm start          # http://localhost:3000
```

## 使用

- 课件放在 `slides/`,Markdown 格式,`---` 分页;修改 `public/index.html` 中的 `data-markdown` 路径切换课件
- 右栏下拉框选择 agent,输入问题,Enter 发送
- AI 生成的内容会作为新幻灯片插入当前页之后,按 ← 返回

## 配置 agent

编辑 `config/agents.json`:

```json
{
  "my-agent": { "enabled": true, "command": "my-cli", "args": ["-p", "{prompt}"], "timeout": 60 }
}
```

- `{prompt}` 会被替换为完整 prompt,CLI 的 stdout 即为回答
- 新增 agent 只需加配置,不改代码;未安装的 CLI 请设 `"enabled": false`
- 内置 `mock` agent 用于无真实 CLI 时演示

## 扩展模板

见 `templates/README.md`。新增模板 = 新建目录放 3 个文件 + 重启。

## 测试

```bash
npm test
```
````

- [ ] **Step 2: 全量回归**

Run: `npm test`
Expected: 全部测试 PASS(共 15 个)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: 项目 README"
```

---

## Self-Review 记录

- **Spec coverage:** 双栏布局(Task 8)、Markdown 课件(Task 8 Step 4)、可配置适配器(Task 1/5)、单次 JSON 契约(Task 2/4)、模板扫描+校验+渲染(Task 3)、4 个内置模板+扩展指南(Task 6)、动态幻灯片插入(Task 8 Step 3)、错误处理与兜底(Task 2/7)、mock agent(Task 1)、测试(各 Task)、README(Task 9)— 全覆盖。
- **类型一致性:** `loadTemplates` 返回 `{id, name, description, slots, view, style}`;`validateSlots(tpl, slots)` 与 `renderTemplate(tpl, slots)` 均以 `tpl.slots` 为准;`parseAgentOutput` 返回 `{template?, slots?, answer}`;`/api/ask` 响应 `{answer, slide?: {templateId, html, css}}`,前端 `insertDynamicSlide` 使用 `slide.css`/`slide.html` — 一致。
