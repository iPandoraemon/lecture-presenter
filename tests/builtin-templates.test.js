import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplates, validateSlots, renderTemplate } from '../server/templates.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// 每个模板槽位的示例值
const SAMPLES = {
  'key-points': { title: '什么是闭包', points: ['定义', '用途', '示例'] },
  comparison: {
    title: 'TCP vs UDP',
    leftTitle: 'TCP',
    leftPoints: ['可靠', '面向连接'],
    rightTitle: 'UDP',
    rightPoints: ['低延迟', '无连接'],
  },
  'code-explain': {
    title: '快速排序',
    code: 'function quickSort(arr) { /* ... */ }',
    explanations: ['选基准', '分区', '递归'],
  },
  'diagram-flow': { title: 'HTTP 请求流程', steps: ['DNS 解析', '建立连接', '发送请求'] },
};

test('内置 4 个模板可加载,且示例槽位渲染后无残留占位符', async () => {
  const templates = await loadTemplates(path.join(repoRoot, 'templates'));
  const ids = templates.map((t) => t.id).sort();
  assert.deepEqual(ids, ['code-explain', 'comparison', 'diagram-flow', 'key-points']);

  for (const tpl of templates) {
    const slots = validateSlots(tpl, SAMPLES[tpl.id]);
    const html = renderTemplate(tpl, slots);
    assert.ok(!html.includes('{{'), `${tpl.id} 渲染后仍残留占位符: ${html}`);
  }
});
