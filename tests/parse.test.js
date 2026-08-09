import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentOutput } from '../server/parse.js';

test('解析合法 JSON 输出', () => {
  const out = parseAgentOutput('{"template":"key-points","slots":{"title":"t","points":["a"]},"answer":"你好"}');
  assert.equal(out.template, 'key-points');
  assert.deepEqual(out.slots, { title: 't', points: ['a'] });
  assert.equal(out.answer, '你好');
});

test('template 无 slots 时填默认仍返回 template', () => {
  const out = parseAgentOutput('{"template":"key-points","answer":"你好"}');
  assert.deepEqual(out, { template: 'key-points', slots: {}, answer: '你好' });
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

test('answer 误嵌套在 slots 内时提升为根级字段', () => {
  const out = parseAgentOutput(
    '{"template":"key-points","slots":{"title":"t","points":["a"],"answer":"嵌套回答"}}',
  );
  assert.equal(out.template, 'key-points');
  assert.equal(out.answer, '嵌套回答');
  assert.deepEqual(out.slots, { title: 't', points: ['a'] });
});

test('新契约:JSON 前的纯文本作为回答(JSON 无 answer 字段)', () => {
  const out = parseAgentOutput(
    '闭包是函数加词法作用域。\n{"template":"key-points","slots":{"title":"t","points":["a"]}}',
  );
  assert.equal(out.template, 'key-points');
  assert.equal(out.answer, '闭包是函数加词法作用域。');
  assert.deepEqual(out.slots, { title: 't', points: ['a'] });
});
