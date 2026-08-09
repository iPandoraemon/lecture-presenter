/* global Reveal, RevealMarkdown */
// 课件由 ?deck= 指定:不含 '/' 时视为 slides/ 下的文件名,否则视为绝对路径走 /api/deck
const params = new URLSearchParams(location.search);
const currentDeck = params.get('deck') ?? 'demo.md';
const isCustomPath = currentDeck.includes('/');
const deckUrl = isCustomPath
  ? `/api/deck?path=${encodeURIComponent(currentDeck)}`
  : `/slides/${currentDeck}`;
// 须在 initialize 之前设置 data-markdown
document.getElementById('deck-section').setAttribute('data-markdown', deckUrl);

const deck = new Reveal({ hash: false, transition: 'slide', plugins: [RevealMarkdown] });
deck.initialize();

const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const agentSelect = document.getElementById('agent-select');
const statusDot = document.getElementById('agent-status');
const deckSelect = document.getElementById('deck-select');

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
      body: JSON.stringify({ agent: agentSelect.value, question, slideContext }),
    });
    const data = await res.json();
    if (!res.ok) {
      appendBubble('ai error', data.error ?? '请求失败');
    } else {
      appendBubble('ai', data.answer ?? '');
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
