import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// 模型商配置:存于 config/providers.json;保存时同步到 pi 的 ~/.pi/agent/models.json
// profile 结构: { name, baseUrl, apiKey, model, extraArgs }

export const PI_MODELS_PATH = path.join(os.homedir(), '.pi', 'agent', 'models.json');

export function validateProvider(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim()) return '名称不能为空';
  if (typeof p.baseUrl !== 'string' || !/^https?:\/\/.+/.test(p.baseUrl.trim())) {
    return 'API 链接必须是 http(s) URL';
  }
  if (typeof p.model !== 'string' || !p.model.trim()) return '模型不能为空';
  return null;
}

function normalize(p) {
  return {
    name: p.name.trim(),
    baseUrl: p.baseUrl.trim(),
    apiKey: (p.apiKey ?? '').trim(),
    model: p.model.trim(),
    extraArgs: (p.extraArgs ?? '').trim(),
  };
}

export async function loadProviders(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

async function writeProviders(file, list) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(list, null, 2) + '\n');
}

// 按 name 覆盖式保存;同时同步到 pi 的 models.json
export async function saveProvider(file, profile, piModelsPath = PI_MODELS_PATH) {
  const p = normalize(profile);
  const err = validateProvider(p);
  if (err) throw new Error(err);
  const list = await loadProviders(file);
  const i = list.findIndex((x) => x.name === p.name);
  if (i >= 0) list[i] = p;
  else list.push(p);
  await writeProviders(file, list);
  await syncProviderToPi(p, piModelsPath);
  return p;
}

export async function deleteProvider(file, name, piModelsPath = PI_MODELS_PATH) {
  const list = await loadProviders(file);
  const next = list.filter((x) => x.name !== name);
  if (next.length === list.length) return false;
  await writeProviders(file, next);
  await removeProviderFromPi(name, piModelsPath);
  return true;
}

// 把模型商写进 pi 的 models.json(openai 兼容接口),只动自己的 key,保留其他 provider
export async function syncProviderToPi(profile, piModelsPath = PI_MODELS_PATH) {
  const data = await readJsonOrEmpty(piModelsPath);
  data.providers ??= {};
  const entry = {
    baseUrl: profile.baseUrl,
    api: 'openai-completions',
    models: [{ id: profile.model, name: profile.model }],
  };
  if (profile.apiKey) entry.apiKey = profile.apiKey;
  data.providers[profile.name] = entry;
  await writeJson(piModelsPath, data);
}

export async function removeProviderFromPi(name, piModelsPath = PI_MODELS_PATH) {
  const data = await readJsonOrEmpty(piModelsPath);
  if (data.providers && name in data.providers) {
    delete data.providers[name];
    await writeJson(piModelsPath, data);
  }
}

async function readJsonOrEmpty(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}
