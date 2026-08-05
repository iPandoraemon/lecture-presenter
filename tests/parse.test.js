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
