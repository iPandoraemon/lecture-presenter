import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadProviders,
  saveProvider,
  deleteProvider,
  validateProvider,
  syncProviderToPi,
  removeProviderFromPi,
} from '../server/providers.js';

async function tmpFile(name, content) {
  const dir = await mkdtemp(path.join(tmpdir(), 'prov-'));
  const p = path.join(dir, name);
  if (content !== undefined) await writeFile(p, content);
  return p;
}

const sample = {
  name: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash',
  extraArgs: '--thinking high',
};

test('validateProvider 校验必填字段', () => {
  assert.equal(validateProvider(sample), null);
  assert.match(validateProvider({ ...sample, name: '' }), /名称/);
  assert.match(validateProvider({ ...sample, baseUrl: 'notaurl' }), /API 链接/);
  assert.match(validateProvider({ ...sample, model: '' }), /模型/);
  // apiKey 与 extraArgs 可空
  assert.equal(validateProvider({ ...sample, apiKey: '', extraArgs: '' }), null);
});

test('saveProvider / loadProviders / deleteProvider 往返', async () => {
  const file = await tmpFile('providers.json', '[]');
  await saveProvider(file, sample);
  await saveProvider(file, { ...sample, name: 'other', apiKey: '' });
  let list = await loadProviders(file);
  assert.equal(list.length, 2);
  // 同名覆盖
  await saveProvider(file, { ...sample, model: 'deepseek-v4-pro' });
  list = await loadProviders(file);
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.name === 'deepseek').model, 'deepseek-v4-pro');
  await deleteProvider(file, 'other');
  list = await loadProviders(file);
  assert.equal(list.length, 1);
});

test('loadProviders 文件不存在时返回空数组', async () => {
  const file = await tmpFile('not-exist.json');
  assert.deepEqual(await loadProviders(file), []);
});

test('syncProviderToPi 合并写入 models.json 且保留其他 provider', async () => {
  const piModels = await tmpFile('models.json', JSON.stringify({
    providers: { agnes: { baseUrl: 'https://api.agnes-ai.cn/v1', api: 'openai-completions', models: [{ id: 'x' }] } },
  }));
  await syncProviderToPi(sample, piModels);
  const data = JSON.parse(await readFile(piModels, 'utf8'));
  assert.ok(data.providers.agnes, '原有 provider 应保留');
  const p = data.providers.deepseek;
  assert.equal(p.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(p.api, 'openai-completions');
  assert.equal(p.apiKey, 'sk-test');
  assert.deepEqual(p.models, [{ id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' }]);
});

test('syncProviderToPi 无 apiKey 时不写 apiKey 字段;文件不存在时新建', async () => {
  const piModels = await tmpFile('models.json');
  await syncProviderToPi({ ...sample, apiKey: '' }, piModels);
  const data = JSON.parse(await readFile(piModels, 'utf8'));
  assert.equal(data.providers.deepseek.apiKey, undefined);
});

test('removeProviderFromPi 删除指定 provider', async () => {
  const piModels = await tmpFile('models.json', JSON.stringify({
    providers: { deepseek: { baseUrl: 'x' }, agnes: { baseUrl: 'y' } },
  }));
  await removeProviderFromPi('deepseek', piModels);
  const data = JSON.parse(await readFile(piModels, 'utf8'));
  assert.equal(data.providers.deepseek, undefined);
  assert.ok(data.providers.agnes);
});
