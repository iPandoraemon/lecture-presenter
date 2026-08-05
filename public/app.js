/* global Reveal, RevealMarkdown */
const deck = new Reveal({ hash: false, transition: 'slide', plugins: [RevealMarkdown] });
deck.initialize();

const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const agentSelect = document.getElementById('agent-select');
const statusDot = document.getElementById('agent-status');

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
