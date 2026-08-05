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
