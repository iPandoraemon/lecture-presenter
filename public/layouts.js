// 课件版式:reveal 渲染完成后,按 slide 注释属性(YAML 头提供全局默认)重排 DOM
//
// 用户写法:
//   ---
//   title-position: top-left        ← YAML 头:全局默认标题位置
//   ---
//   ## 某页标题
//   <!-- .slide: data-layout="cols" data-ratio="4:6" data-title="center" -->
//   左栏内容
//   |||                              ← 单独一行,分栏标记
//   右栏内容

// 解析 "4:6" → [4,6];每栏收敛到 [2,8];数量不符或非法时均分
export function parseRatio(str, cols) {
  const parts = (str ?? '').split(':').map((s) => parseInt(s, 10));
  if (parts.length !== cols || parts.some((n) => !Number.isFinite(n))) {
    return Array(cols).fill(1);
  }
  return parts.map((n) => Math.min(8, Math.max(2, n)));
}

// 全局配置(globalCfg 即 YAML 头的 meta),页面级 data-* 属性优先
export function applyLayouts(globalCfg = {}) {
  const padding = globalCfg['page-padding'] ?? '0 2em';
  for (const section of document.querySelectorAll('.slides > section')) {
    const titlePos = section.dataset.title ?? globalCfg['title-position'];
    if (titlePos === 'top-left') section.classList.add('title-top-left');
    section.style.padding = padding;
    processCallouts(section);
    wrapTables(section);
    const layout = section.dataset.layout ?? globalCfg.layout;
    if (layout === 'cols') {
      applyCols(section, section.dataset.ratio ?? globalCfg.ratio);
    }
  }
}

// Obsidian 风格 callout:
//   > [!question] 可选标题
//   > 内容...
// 渲染为带类型配色的提示框;支持的类型见 CALLOUT_TITLES,未知类型用默认样式
const CALLOUT_TITLES = {
  question: '问题', note: '备注', tip: '提示', warning: '警告',
  example: '示例', important: '重要', info: '信息', quote: '引用',
};

function processCallouts(section) {
  for (const bq of [...section.querySelectorAll('blockquote')]) {
    const first = bq.firstElementChild;
    if (!first || first.tagName !== 'P') continue;
    // 标题止于换行(\n 或 <br>),贪婪匹配;剩余行为正文
    const m = first.innerHTML.match(/^\[!([\w-]+)\][ \t]*([^\n<]*)(?:<br\s*\/?>|\n)?/);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const title = (m[2] ?? '').trim();
    // 去掉标记行,剩余内容移入 callout body
    first.innerHTML = first.innerHTML.slice(m[0].length).trim();
    const box = document.createElement('div');
    box.className = `callout callout-${type}`;
    const head = document.createElement('div');
    head.className = 'callout-title';
    head.textContent = title || (CALLOUT_TITLES[type] ?? type);
    box.appendChild(head);
    const body = document.createElement('div');
    body.className = 'callout-body';
    if (first.innerHTML) body.appendChild(first);
    while (bq.firstElementChild) body.appendChild(bq.firstElementChild);
    newlinesToBr(body);
    if (body.childElementCount || body.textContent.trim()) box.appendChild(body);
    bq.replaceWith(box);
  }
}

// 把文本节点中的 \n 换成 <br>(callout 内逐行显示,匹配 Obsidian 习惯);
// 跳过 pre/code,避免破坏代码块的换行
function newlinesToBr(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('pre, code')) continue;
    if (node.nodeValue.includes('\n')) targets.push(node);
  }
  for (const t of targets) {
    const frag = document.createDocumentFragment();
    t.nodeValue.split('\n').forEach((part, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'));
      frag.appendChild(document.createTextNode(part));
    });
    t.replaceWith(frag);
  }
}

// 全局字体:YAML 头支持 font-size / h1-size / h2-size / h3-size(如 32px / 2em)
// 不写则完全沿用 reveal 主题默认
export function applyGlobalFonts(globalCfg = {}) {
  const rules = [];
  if (globalCfg['font-size']) rules.push(`.reveal { font-size: ${globalCfg['font-size']}; }`);
  for (const h of ['h1', 'h2', 'h3']) {
    const v = globalCfg[`${h}-size`];
    if (v) rules.push(`.reveal ${h} { font-size: ${v}; }`);
  }
  if (!rules.length) return;
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

// 大表格装进可滚动区域(上下/左右滚轮),避免溢出幻灯片
function wrapTables(section) {
  for (const table of section.querySelectorAll('table')) {
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.before(wrap);
    wrap.appendChild(table);
  }
}

// 在 ||| 段落处把 section 的直接子元素切分为多栏,按比例设置 flex
function applyCols(section, ratioStr) {
  const groups = [[]];
  for (const el of [...section.children]) {
    if (el.tagName === 'P' && el.textContent.trim() === '|||') groups.push([]);
    else groups[groups.length - 1].push(el);
  }
  if (groups.length < 2) return;
  const ratios = parseRatio(ratioStr, groups.length);
  const wrap = document.createElement('div');
  wrap.className = 'layout-cols';
  groups.forEach((group, i) => {
    const col = document.createElement('div');
    col.className = 'col';
    col.style.flex = String(ratios[i]);
    for (const el of group) col.appendChild(el);
    wrap.appendChild(col);
  });
  section.appendChild(wrap);
}
