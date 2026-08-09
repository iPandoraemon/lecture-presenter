import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { loadAgents, runAgent, buildProviderArgs, runAgentStream } from './agents.js';
import { loadTemplates, validateSlots, renderTemplate } from './templates.js';
import { parseAgentOutput } from './parse.js';
import { buildPrompt } from './prompt.js';
import {
  loadProviders,
  saveProvider,
  deleteProvider,
  validateProvider,
  PI_MODELS_PATH,
} from './providers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');

export function createApp(options = {}) {
  const providersPath = options.providersPath ?? path.join(ROOT, 'config', 'providers.json');
  const piModelsPath = options.piModelsPath ?? PI_MODELS_PATH;
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/slides', express.static(path.join(ROOT, 'slides')));

  app.get('/api/slides', async (req, res) => {
    try {
      const files = await readdir(path.join(ROOT, 'slides'));
      res.json(files.filter((f) => f.endsWith('.md')).sort());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 按绝对路径读取 slides/ 之外的 .md 课件(仅允许 .md,防止任意文件泄露)
  app.get('/api/deck', async (req, res) => {
    const p = req.query.path;
    if (typeof p !== 'string' || !path.isAbsolute(p) || !p.endsWith('.md')) {
      return res.status(400).json({ error: '需要 .md 文件的绝对路径' });
    }
    try {
      const content = await readFile(p, 'utf8');
      res.type('text/markdown').send(content);
    } catch {
      res.status(404).json({ error: '文件不存在或不可读' });
    }
  });

  // 外部课件的图片资源:仅允许常见图片扩展名
  const MEDIA_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  };
  app.get('/api/media', async (req, res) => {
    const p = req.query.path;
    const type = typeof p === 'string' && MEDIA_TYPES[path.extname(p).toLowerCase()];
    if (!type || !path.isAbsolute(p)) {
      return res.status(400).json({ error: '需要图片文件的绝对路径(png/jpg/gif/svg/webp)' });
    }
    try {
      res.type(type).send(await readFile(p));
    } catch {
      res.status(404).json({ error: '文件不存在或不可读' });
    }
  });

  app.get('/api/templates', async (req, res) => {
    try {
      const templates = await loadTemplates(path.join(ROOT, 'templates'));
      res.json(templates.map(({ id, name, description }) => ({ id, name, description })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/agents', async (req, res) => {
    try {
      const agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
      res.json(Object.entries(agents).map(([id, a]) => ({ id, enabled: a.enabled !== false })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/providers', async (req, res) => {
    res.json(await loadProviders(providersPath));
  });

  app.post('/api/providers', async (req, res) => {
    const err = validateProvider(req.body ?? {});
    if (err) return res.status(400).json({ error: err });
    try {
      const saved = await saveProvider(providersPath, req.body, piModelsPath);
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: `保存失败: ${e.message}` });
    }
  });

  app.delete('/api/providers/:name', async (req, res) => {
    try {
      const removed = await deleteProvider(providersPath, req.params.name, piModelsPath);
      if (!removed) return res.status(404).json({ error: '模型商不存在' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `删除失败: ${e.message}` });
    }
  });

  app.post('/api/ask', async (req, res) => {
    const { agent, question, slideContext, provider } = req.body ?? {};
    if (typeof agent !== 'string' || !agent || typeof question !== 'string' || !question) {
      return res.status(400).json({ error: '缺少 agent 或 question' });
    }
    let agents;
    try {
      agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
    } catch (err) {
      return res.status(500).json({ error: `配置加载失败: ${err.message}` });
    }
    const cfg = agents[agent];
    if (!cfg || cfg.enabled === false) {
      return res.status(400).json({ error: `agent "${agent}" 不可用` });
    }
    // 模型商注入目前只适配 pi:由配置构造调用参数
    let argsOverride;
    if (agent === 'pi' && provider) {
      const profile = (await loadProviders(providersPath)).find((p) => p.name === provider);
      if (!profile) {
        return res.status(400).json({ error: `模型商 "${provider}" 不存在` });
      }
      argsOverride = buildProviderArgs(profile);
    }
    try {
      const templates = await loadTemplates(path.join(ROOT, 'templates'));
      const prompt = buildPrompt({ question, slideContext: slideContext ?? '', templates });
      const stdout = await runAgent(cfg, prompt, argsOverride);
      const parsed = parseAgentOutput(stdout);
      const tpl = parsed.template && templates.find((t) => t.id === parsed.template);
      if (!tpl) {
        // 无模板或模板 id 不存在:纯文本兜底
        return res.json({ answer: parsed.answer });
      }
      const slots = validateSlots(tpl, parsed.slots);
      const html = renderTemplate(tpl, slots);
      res.json({ answer: parsed.answer, slide: { templateId: tpl.id, html, css: tpl.style } });
    } catch (err) {
      res.status(502).json({ error: `agent 调用失败: ${err.message}` });
    }
  });

  // SSE 流式问答:pi 走 --mode json 事件流(thinking/text 增量),其余 agent 整段输出
  app.post('/api/ask-stream', async (req, res) => {
    const { agent, question, slideContext, provider } = req.body ?? {};
    if (typeof agent !== 'string' || !agent || typeof question !== 'string' || !question) {
      return res.status(400).json({ error: '缺少 agent 或 question' });
    }
    let agents;
    try {
      agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
    } catch (err) {
      return res.status(500).json({ error: `配置加载失败: ${err.message}` });
    }
    const cfg = agents[agent];
    if (!cfg || cfg.enabled === false) {
      return res.status(400).json({ error: `agent "${agent}" 不可用` });
    }
    let argsOverride;
    if (agent === 'pi' && provider) {
      const profile = (await loadProviders(providersPath)).find((p) => p.name === provider);
      if (!profile) {
        return res.status(400).json({ error: `模型商 "${provider}" 不存在` });
      }
      argsOverride = buildProviderArgs(profile);
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const sendEvent = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    try {
      const templates = await loadTemplates(path.join(ROOT, 'templates'));
      const prompt = buildPrompt({ question, slideContext: slideContext ?? '', templates });
      const fullText = await runAgentStream(cfg, prompt, argsOverride, sendEvent, {
        jsonMode: agent === 'pi',
      });
      const parsed = parseAgentOutput(fullText);
      const tpl = parsed.template && templates.find((t) => t.id === parsed.template);
      if (!tpl) {
        sendEvent({ type: 'result', answer: parsed.answer });
      } else {
        const slots = validateSlots(tpl, parsed.slots);
        const html = renderTemplate(tpl, slots);
        sendEvent({
          type: 'result',
          answer: parsed.answer,
          slide: { templateId: tpl.id, html, css: tpl.style },
        });
      }
    } catch (err) {
      sendEvent({ type: 'error', error: `agent 调用失败: ${err.message}` });
    }
    res.end();
  });

  return app;
}
