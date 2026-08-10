// DeepSeek 等模型在工具不可用时会将原生工具调用标记(DSML)当普通文本输出:
//   <||DSML|| tool_calls>
//   <||DSML|| invoke name="read_file">
//   <||DSML|| parameter name="path" string="true">...</||DSML|| parameter>
//   </||DSML|| invoke>
//   </||DSML|| tool_calls>
// stripDsml 用于整段清洗(最终文本);createDsmlFilter 用于流式增量过滤(处理跨 delta 拆分)。

// 清除整段文本中的 DSML 块与残留单标签;未闭合的块截断到结尾
export function stripDsml(s) {
  return s
    .replace(/<\|\|\s*DSML\s*\|\|\s*invoke[^>]*>[\s\S]*?(<\/\|\|\s*DSML\s*\|\|\s*invoke\s*>|$)/g, '')
    .replace(/<\|\|\s*DSML\s*\|\|\s*parameter[^>]*>[\s\S]*?(<\/\|\|\s*DSML\s*\|\|\s*parameter\s*>|$)/g, '')
    .replace(/<\/?\|\|\s*DSML\s*\|\|[^>]*>?/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

const OPEN_RE = /^<\|\|\s*DSML\s*\|\|\s*(invoke|parameter)[^>]*>/;
const SINGLE_RE = /^<\/?\|\|\s*DSML\s*\|\|[^>]*>/;
const closeRe = (name) => new RegExp(`</\\|\\|\\s*DSML\\s*\\|\\|\\s*${name}\\s*>`);

// 流式过滤:维护"块内"状态,invoke/parameter 块未闭合前持续扣留内容
export function createDsmlFilter() {
  let held = '';
  let inBlock = null;

  function drain() {
    let out = '';
    for (;;) {
      if (inBlock) {
        const close = held.match(closeRe(inBlock));
        if (!close) return out; // 块未闭合,全部扣留
        held = held.slice(close.index + close[0].length);
        inBlock = null;
        continue;
      }
      const start = held.search(/<\|\|/);
      if (start === -1) {
        // 结尾的 '<' / '<|' 可能是标记开头,扣留待确认
        const tail = held.match(/<\|?$/);
        if (tail) {
          out += held.slice(0, tail.index);
          held = held.slice(tail.index);
          return out;
        }
        out += held;
        held = '';
        return out;
      }
      out += held.slice(0, start);
      const rest = held.slice(start);
      const open = rest.match(OPEN_RE);
      if (open) {
        const close = rest.match(closeRe(open[1]));
        if (close && close.index >= open[0].length) {
          held = rest.slice(close.index + close[0].length);
          continue;
        }
        inBlock = open[1]; // 块未闭合,进入块内扣留
        held = rest.slice(open[0].length);
        return out;
      }
      const single = rest.match(SINGLE_RE);
      if (single) {
        held = rest.slice(single[0].length);
        continue;
      }
      if (!rest.includes('>')) {
        held = rest; // 不完整的标记开头,扣留
        return out;
      }
      // 有 '>' 但不是已知 DSML 形态:放行一个字符避免死锁
      out += rest[0];
      held = rest.slice(1);
    }
  }

  return {
    push(delta) {
      held += delta;
      return drain();
    },
    flush() {
      // 块内或疑似标记的扣留内容在结束时丢弃;其余尾部原样放行
      const tail = inBlock || held.startsWith('<|') ? '' : held;
      held = '';
      inBlock = null;
      return tail;
    },
  };
}
