import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const execFileP = promisify(execFile);

export async function loadAgents(configPath) {
  const raw = await readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

// 按适配器配置调用 CLI:args 中的 {prompt} 替换为完整 prompt,返回 stdout
export async function runAgent(agentCfg, prompt) {
  if (!agentCfg || agentCfg.enabled === false) {
    throw new Error('agent 不可用');
  }
  const args = agentCfg.args.map((a) => a.replace('{prompt}', () => prompt));
  try {
    const { stdout } = await execFileP(agentCfg.command, args, {
      timeout: (agentCfg.timeout ?? 60) * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`CLI 未安装: ${agentCfg.command}`);
    }
    if (err.killed || err.signal) {
      throw new Error(`agent 调用超时(${agentCfg.timeout ?? 60}s)`);
    }
    const stderr = (err.stderr ?? '').trim().slice(0, 200);
    throw new Error(`agent 退出码 ${err.code}: ${stderr || err.message}`);
  }
}
