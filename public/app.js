/* global Reveal, RevealMarkdown */
import { parseDeckFrontmatter, rewriteImageUrls } from '/frontmatter.js';
import { applyLayouts, applyGlobalFonts } from '/layouts.js';

// 课件由 ?deck= 指定:不含 '/' 时视为 slides/ 下的文件名,否则视为绝对路径走 /api/deck
const params = new URLSearchParams(location.search);
const currentDeck = params.get('deck') ?? 'demo.md';
const isCustomPath = currentDeck.includes('/');
const deckUrl = isCustomPath
  ? `/api/deck?path=${encodeURIComponent(currentDeck)}`
  : `/slides/${currentDeck}`;
// 相对路径图片的重写规则:slides/ 内课件走静态目录,外部课件走 /api/media
const resolveImage = isCustomPath
  ? (src) => {
      const dir = currentDeck.slice(0, currentDeck.lastIndexOf('/'));
      return `/api/media?path=${encodeURIComponent(`${dir}/${src}`)}`;
    }
  : (src) => `/slides/${encodeURI(src)}`;

// 自己 fetch 课件:剥离 YAML 头(全局版式配置)、重写图片路径,再以 script template 嵌入交给 reveal
const deckSection = document.getElementById('deck-section');
let globalCfg = {};
try {
  const res = await fetch(deckUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = parseDeckFrontmatter(await res.text());
  globalCfg = parsed.meta;
  deckSection.setAttribute('data-markdown', '');
  const tpl = document.createElement('script');
  tpl.type = 'text/template';
  tpl.textContent = rewriteImageUrls(parsed.body, resolveImage);
  deckSection.appendChild(tpl);
} catch (err) {
  deckSection.removeAttribute('data-markdown');
  deckSection.innerHTML = `<h2>课件加载失败</h2><p>${currentDeck}: ${err.message}</p>`;
}

const deck = new Reveal({
  hash: false,
  transition: 'slide',
  // 4:3 幻灯片;配合左右 12:4 分栏,16:9 屏幕上恰好填满左栏
  width: 960,
  height: 720,
  plugins: [RevealMarkdown],
});

// print-pdf 模式:打印完毕后自动唤起打印对话框(图片加载完成后)
const printMode = /print-pdf/gi.test(location.search);

deck.initialize().then(async () => {
  applyGlobalFonts(globalCfg);
  applyLayouts(globalCfg);
  if (printMode) {
    await Promise.all(
      [...document.images].map((img) => img.decode().catch(() => {})),
    );
    window.print();
  }
});

const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const agentSelect = document.getElementById('agent-select');
const providerSelect = document.getElementById('provider-select');
const statusDot = document.getElementById('agent-status');
const deckSelect = document.getElementById('deck-select');
const settingsModal = document.getElementById('settings-modal');
const providerList = document.getElementById('provider-list');
const providerForm = document.getElementById('provider-form');
const settingsMsg = document.getElementById('settings-msg');

// 模型商下拉框:默认 + 已保存的模型商
async function loadProviders() {
  try {
    const res = await fetch('/api/providers');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const providers = await res.json();
    const current = providerSelect.value;
    providerSelect.innerHTML = '<option value="">默认模型商</option>';
    for (const p of providers) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.name} (${p.model})`;
      providerSelect.appendChild(opt);
    }
    providerSelect.value = current;
  } catch (err) {
    console.warn('模型商列表加载失败:', err);
  }
}
loadProviders();

// 设置窗口:列表 + 编辑 + 删除 + 保存
function openSettings() {
  settingsMsg.textContent = '';
  renderProviderList();
  settingsModal.classList.remove('hidden');
}

async function renderProviderList() {
  const providers = await (await fetch('/api/providers')).json();
  providerList.innerHTML = '';
  for (const p of providers) {
    const item = document.createElement('div');
    item.className = 'provider-item';
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = p.name;
    const meta = document.createElement('span');
    meta.className = 'p-meta';
    meta.textContent = `${p.model} @ ${p.baseUrl}`;
    const editBtn = document.createElement('button');
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => {
      providerForm.name.value = p.name;
      providerForm.baseUrl.value = p.baseUrl;
      providerForm.apiKey.value = p.apiKey;
      providerForm.model.value = p.model;
      providerForm.extraArgs.value = p.extraArgs;
    });
    const delBtn = document.createElement('button');
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      await fetch(`/api/providers/${encodeURIComponent(p.name)}`, { method: 'DELETE' });
      renderProviderList();
      loadProviders();
    });
    item.append(name, meta, editBtn, delBtn);
    providerList.appendChild(item);
  }
}

providerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  settingsMsg.textContent = '';
  const body = {
    name: providerForm.name.value,
    baseUrl: providerForm.baseUrl.value,
    apiKey: providerForm.apiKey.value,
    model: providerForm.model.value,
    extraArgs: providerForm.extraArgs.value,
  };
  const res = await fetch('/api/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    settingsMsg.textContent = data.error ?? '保存失败';
    return;
  }
  providerForm.reset();
  renderProviderList();
  loadProviders();
});

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

async function loadDecks() {
  try {
    const res = await fetch('/api/slides');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const decks = await res.json();
    for (const d of decks) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d.replace(/\.md$/, '');
      opt.selected = d === currentDeck;
      deckSelect.appendChild(opt);
    }
    if (isCustomPath) {
      // 当前课件是 slides/ 之外的路径,在下拉框中显示出来
      const opt = document.createElement('option');
      opt.value = currentDeck;
      opt.textContent = currentDeck.split('/').pop();
      opt.selected = true;
      deckSelect.appendChild(opt);
    }
  } catch (err) {
    // 课件列表加载失败不影响演示,仅隐藏选择器
    deckSelect.style.display = 'none';
    console.warn('课件列表加载失败:', err);
  }
}
loadDecks();

deckSelect.addEventListener('change', () => {
  location.search = `?deck=${encodeURIComponent(deckSelect.value)}`;
});
// 阻止方向键/空格泄漏给 reveal.js 翻页
deckSelect.addEventListener('keydown', (e) => e.stopPropagation());

// 指定 slides/ 之外的课件绝对路径
document.getElementById('deck-custom').addEventListener('click', () => {
  const p = window.prompt('输入课件文件的完整路径(.md):', isCustomPath ? currentDeck : '');
  if (p && p.trim()) {
    location.search = `?deck=${encodeURIComponent(p.trim())}`;
  }
});

// 导出 PDF:打开 print-pdf 模式新窗口,自动唤起打印(含 AI 动态幻灯片)
document.getElementById('export-pdf').addEventListener('click', () => {
  const url = new URL(location.href);
  url.searchParams.set('print-pdf', '');
  window.open(url, '_blank');
});

// 问答记录(供导出 Markdown)
const qaLog = [];

// 导出问答 Markdown:问题 + AI 回答 + 生成的模板
document.getElementById('export-qa').addEventListener('click', () => {
  if (!qaLog.length) {
    appendBubble('ai error', '还没有问答记录,先提几个问题吧');
    return;
  }
  const lines = [
    '# 课堂问答记录',
    '',
    `- 课件: ${currentDeck}`,
    `- 导出时间: ${new Date().toLocaleString()}`,
    '',
  ];
  qaLog.forEach((q, i) => {
    lines.push(`## Q${i + 1}:${q.question}`, '', q.answer, '');
    if (q.template) lines.push(`> 生成的幻灯片模板: \`${q.template}\``, '');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `问答记录-${currentDeck.replace(/\.md$/, '').replace(/[^\w一-龥-]+/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
});

async function loadAgents() {
  try {
    const res = await fetch('/api/agents');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const agents = await res.json();
    for (const a of agents) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.id + (a.enabled ? '' : '(不可用)');
      opt.disabled = !a.enabled;
      agentSelect.appendChild(opt);
    }
  } catch (err) {
    appendBubble('ai error', 'agent 列表加载失败: ' + err.message);
  }
}
loadAgents();

function appendBubble(role, text) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function insertDynamicSlide(slide) {
  const section = document.createElement('section');
  const style = document.createElement('style');
  style.textContent = slide.css;
  section.appendChild(style);
  const body = document.createElement('div');
  body.innerHTML = slide.html;
  section.appendChild(body);
  const badge = document.createElement('div');
  badge.className = 'ai-badge';
  badge.textContent = 'AI 生成';
  section.appendChild(badge);
  // 动态幻灯片假定课件只使用水平分页(未启用垂直分页),`.slides > section.present` 为顶层 section。
  const current = document.querySelector('.slides > section.present');
  if (current) current.after(section);
  else document.querySelector('.slides').appendChild(section);
  deck.sync();
  deck.next();
}

let sending = false;
async function send() {
  const question = chatInput.value.trim();
  if (!question || sending) return;
  sending = true;
  statusDot.className = 'dot busy';
  appendBubble('user', question);
  chatInput.value = '';
  try {
    const slideContext =
      document.querySelector('.slides > section.present')?.textContent ?? '';
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agentSelect.value,
        provider: providerSelect.value,
        question,
        slideContext,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      appendBubble('ai error', data.error ?? '请求失败');
    } else {
      appendBubble('ai', data.answer ?? '');
      qaLog.push({
        question,
        answer: data.answer ?? '',
        template: data.slide?.templateId,
      });
      if (data.slide) insertDynamicSlide(data.slide);
    }
  } catch (err) {
    appendBubble('ai error', '网络错误: ' + err.message);
  } finally {
    sending = false;
    statusDot.className = 'dot';
  }
}

sendBtn.addEventListener('click', send);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.stopPropagation();
    send();
  }
});
