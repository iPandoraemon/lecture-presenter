import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// 扫描 dir,每个含 meta.json + view.html + style.css 的子目录注册为一个模板
export async function loadTemplates(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const tplDir = path.join(dir, entry.name);
    try {
      const [metaRaw, view, style] = await Promise.all([
        readFile(path.join(tplDir, 'meta.json'), 'utf8'),
        readFile(path.join(tplDir, 'view.html'), 'utf8'),
        readFile(path.join(tplDir, 'style.css'), 'utf8'),
      ]);
      const meta = JSON.parse(metaRaw);
      if (typeof meta.slots !== 'object' || meta.slots === null || Array.isArray(meta.slots)) {
        throw new Error('meta.json 缺少有效的 slots 定义');
      }
      templates.push({ id: entry.name, ...meta, view, style });
    } catch (err) {
      // 目录不完整、meta.json 非法或缺 slots 定义,跳过
      console.warn(`跳过模板 ${entry.name}: ${err.message}`);
    }
  }
  return templates;
}

// 按 tpl.slots 定义清洗 agent 返回的槽位:列表截断到 maxItems,缺失填空
export function validateSlots(tpl, slots) {
  const result = {};
  for (const [name, def] of Object.entries(tpl.slots)) {
    let value = slots?.[name];
    if (def.type === 'list') {
      if (!Array.isArray(value)) value = value == null ? [] : [String(value)];
      value = value.map(String).slice(0, def.maxItems ?? value.length);
    } else {
      value = value == null ? '' : String(value);
    }
    result[name] = value;
  }
  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 字符串替换渲染;list 槽位渲染为 <li> 序列;所有内容 HTML 转义
export function renderTemplate(tpl, slots) {
  let html = tpl.view;
  for (const [name, def] of Object.entries(tpl.slots)) {
    const value = slots[name];
    const replacement = def.type === 'list'
      ? (Array.isArray(value) ? value : []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : escapeHtml(value ?? '');
    html = html.split(`{{${name}}}`).join(replacement);
  }
  return html;
}
