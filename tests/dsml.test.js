import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripDsml, createDsmlFilter } from '../server/dsml.js';

// 截图中的真实污染样本
const SAMPLE = `<||DSML|| tool_calls>
<||DSML|| invoke name="read_file">
<||DSML|| parameter name="path" string="true">/Users/wentt/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/README.md</||DSML|| parameter>
</||DSML|| invoke>
</||DSML|| tool_calls>`;

test('stripDsml 清除完整 DSML 工具调用块', () => {
  assert.equal(stripDsml(`思考中\n${SAMPLE}\n继续回答`), '思考中\n\n继续回答');
});

test('stripDsml 清除未闭合的 DSML 块(流中断)', () => {
  assert.equal(stripDsml('前文<||DSML|| invoke name="read_file">半截内容'), '前文');
});

test('stripDsml 不动普通内容与代码符号', () => {
  const code = 'if (a < b && c > d) { return x || y; }';
  assert.equal(stripDsml(code), code);
});

test('流式过滤器:标记跨 delta 拆分时不出垃圾', () => {
  const f = createDsmlFilter();
  const parts = [];
  parts.push(f.push('正常文本<||DS'));
  parts.push(f.push('ML|| invoke name="read_file">垃圾'));
  parts.push(f.push('内容</||DSML|| invoke>后续'));
  parts.push(f.flush());
  assert.equal(parts.join(''), '正常文本后续');
});

test('流式过滤器:普通小于号不误伤', () => {
  const f = createDsmlFilter();
  const out = [f.push('if (a < b) '), f.push('return;'), f.flush()];
  assert.equal(out.join(''), 'if (a < b) return;');
});
