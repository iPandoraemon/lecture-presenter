import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgents, runAgent } from './agents.js';
import { loadTemplates, validateSlots, renderTemplate } from './templates.js';
import { parseAgentOutput } from './parse.js';
import { buildPrompt } from './prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/slides', express.static(path.join(ROOT, 'slides')));

  app.get('/api/templates', async (req, res) => {
    const templates = await loadTemplates(path.join(ROOT, 'templates'));
    res.json(templates.map(({ id, name, description }) => ({ id, name, description })));
  });

  app.get('/api/agents', async (req, res) => {
    const agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
    res.json(Object.entries(agents).map(([id, a]) => ({ id, enabled: a.enabled !== false })));
  });

  app.post('/api/ask', async (req, res) => {
    const { agent, question, slideContext } = req.body ?? {};
    if (!agent || !question) {
      return res.status(400).json({ error: '缺少 agent 或 question' });
    }
    try {
      const agents = await loadAgents(path.join(ROOT, 'config', 'agents.json'));
      const cfg = agents[agent];
      if (!cfg || cfg.enabled === false) {
        return res.status(400).json({ error: `agent "${agent}" 不可用` });
      }
      const templates = await loadTemplates(path.join(ROOT, 'templates'));
      const prompt = buildPrompt({ question, slideContext: slideContext ?? '', templates });
      const stdout = await runAgent(cfg, prompt);
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

  return app;
}
