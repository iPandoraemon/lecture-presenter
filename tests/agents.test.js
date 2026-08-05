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

test('prompt 中的 $& / $1 字面透传', async () => {
  const prompt = 'JS 里的 $& 与 $1 是什么';
  const out = await runAgent(
    { command: 'node', args: ['-e', 'console.log("{prompt}")'], timeout: 5 },
    prompt,
  );
  assert.equal(out.trim(), prompt);
});

test('不存在的 CLI 报未安装', async () => {
  await assert.rejects(
    () =>
      runAgent(
        { command: 'definitely-not-a-real-cli-xyz', args: [], timeout: 5 },
        'x',
      ),
    /未安装/,
  );
});

test('超时报错', async () => {
  await assert.rejects(
    () =>
      runAgent(
        { command: 'node', args: ['-e', 'setTimeout(()=>{},5000)'], timeout: 1 },
        'x',
      ),
    /超时/,
  );
});
