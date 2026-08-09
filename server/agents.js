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

// 流式调用:jsonMode 时按 pi --mode json 的 JSON 行事件解析,
// thinking_delta / text_delta 通过 onEvent 回调,返回完整 text 供后续解析;
// 非 jsonMode 退化为整段输出单个 text 事件
export async function runAgentStream(agentCfg, prompt, argsOverride, onEvent, { jsonMode = false } = {}) {
  if (!agentCfg || agentCfg.enabled === false) {
    throw new Error('agent 不可用');
  }
  let args = [...(argsOverride ?? agentCfg.args)];
  if (jsonMode) {
    // --mode json 插在 {prompt} 之前,避免被当作消息文本
    const i = args.indexOf('{prompt}');
    args.splice(i >= 0 ? i : args.length, 0, '--mode', 'json');
  }
  args = args.map((a) => a.replace('{prompt}', () => prompt));
  const timeoutSec = agentCfg.timeout ?? 60;
  return new Promise((resolve, reject) => {
    const child = spawn(agentCfg.command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    let stderr = '';
    let lineBuf = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutSec * 1000);
    child.stdout.on('data', (d) => {
      if (!jsonMode) {
        text += d;
        if (text.length > MAX_OUTPUT) child.kill('SIGTERM');
        return;
      }
      lineBuf += d;
      let idx;
      while ((idx = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, idx).trim();
        lineBuf = lineBuf.slice(idx + 1);
        if (!line.startsWith('{')) continue;
        try {
          const ev = JSON.parse(line);
          const ame = ev.type === 'message_update' ? ev.assistantMessageEvent : null;
          if (ame?.type === 'thinking_delta' && ame.delta) {
            onEvent({ type: 'thinking', delta: ame.delta });
          } else if (ame?.type === 'text_delta' && ame.delta) {
            text += ame.delta;
            onEvent({ type: 'text', delta: ame.delta });
          }
        } catch {
          // 非完整 JSON 行,忽略
        }
      }
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
        if (!jsonMode) onEvent({ type: 'text', delta: text });
        resolve(text);
      } else {
        reject(new Error(`agent 退出码 ${code}: ${stderr.trim().slice(0, 200) || '(无错误输出)'}`));
      }
    });
  });
}
