import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, buildProviderArgs } from '../server/agents.js';

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

test('buildProviderArgs 由模型商配置构造 pi 参数', () => {
  const args = buildProviderArgs({
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-test',
    model: 'deepseek-v4-flash',
    extraArgs: '--thinking high',
  });
  assert.deepEqual(args, [
    '-p', '--no-tools',
    '--provider', 'deepseek',
    '--model', 'deepseek-v4-flash',
    '--thinking', 'high',
    '{prompt}',
  ]);
});

test('buildProviderArgs extraArgs 为空时不追加', () => {
  const args = buildProviderArgs({ name: 'a', baseUrl: 'http://x', apiKey: '', model: 'm', extraArgs: '' });
  assert.deepEqual(args, ['-p', '--no-tools', '--provider', 'a', '--model', 'm', '{prompt}']);
});

test('runAgent 支持 argsOverride 覆盖配置参数', async () => {
  const out = await runAgent(
    { command: 'node', args: ['-e', 'console.log("不应使用")'], timeout: 5 },
    '覆盖测试',
    ['-e', 'console.log("{prompt}")'],
  );
  assert.equal(out.trim(), '覆盖测试');
});

test('子进程读 stdin 时立即得到 EOF,不挂起', async () => {
  // readFileSync(0) 在 stdin 未关闭时会阻塞;ignore 后读到 /dev/null 立即返回
  const out = await runAgent(
    { command: 'node', args: ['-e', 'console.log(require("fs").readFileSync(0,"utf8").length)'], timeout: 5 },
    'x',
  );
  assert.equal(out.trim(), '0');
});
