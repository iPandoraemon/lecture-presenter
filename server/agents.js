import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export async function loadAgents(configPath) {
  const raw = await readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

const MAX_OUTPUT = 10 * 1024 * 1024;

// 按适配器配置调用 CLI:args 中的 {prompt} 替换为完整 prompt,返回 stdout
// argsOverride 存在时替代 agentCfg.args(用于注入模型商配置构造的参数)
// 注意:stdin 必须 ignore —— 某些 CLI(pi)在非 TTY stdin 未结束时会一直等待输入;
// execFile 不支持自定义 stdio,所以用 spawn 手动收集输出
export async function runAgent(agentCfg, prompt, argsOverride) {
  if (!agentCfg || agentCfg.enabled === false) {
    throw new Error('agent 不可用');
  }
  const args = (argsOverride ?? agentCfg.args).map((a) => a.replace('{prompt}', () => prompt));
  const timeoutSec = agentCfg.timeout ?? 60;
  return new Promise((resolve, reject) => {
    const child = spawn(agentCfg.command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutSec * 1000);
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT) child.kill('SIGTERM');
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(-MAX_OUTPUT);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error(`CLI 未安装: ${agentCfg.command}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`agent 调用超时(${timeoutSec}s)`));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`agent 退出码 ${code}: ${stderr.trim().slice(0, 200) || '(无错误输出)'}`));
      }
    });
  });
}

// 由模型商配置构造 pi 调用参数(baseUrl/apiKey 已通过 models.json 同步给 pi)
export function buildProviderArgs(profile) {
  const extra = (profile.extraArgs ?? '').split(/\s+/).filter(Boolean);
  return [
    '-p', '--no-tools',
    '--provider', profile.name,
    '--model', profile.model,
    ...extra,
    '{prompt}',
  ];
}
