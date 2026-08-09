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
    wrapTables(section);
    const layout = section.dataset.layout ?? globalCfg.layout;
    if (layout === 'cols') {
      applyCols(section, section.dataset.ratio ?? globalCfg.ratio);
    }
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
