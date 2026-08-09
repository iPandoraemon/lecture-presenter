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
  assert.ok(p.includes('"template"'));
  assert.ok(p.includes('纯文本回答在前,JSON 在后'));
});
