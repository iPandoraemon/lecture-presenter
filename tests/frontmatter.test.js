import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeckFrontmatter, rewriteImageUrls } from '../public/frontmatter.js';

test('解析文件顶部的 YAML 头', () => {
  const { meta, body } = parseDeckFrontmatter(
    '---\ntitle-position: top-left\nratio: "4:6"\n---\n# 第一页\n内容\n',
  );
  assert.equal(meta['title-position'], 'top-left');
  assert.equal(meta.ratio, '4:6'); // 引号被去掉
  assert.equal(body, '# 第一页\n内容\n');
});

test('无 YAML 头时原样返回', () => {
  const { meta, body } = parseDeckFrontmatter('# 第一页\n---\n# 第二页\n');
  assert.deepEqual(meta, {});
  assert.equal(body, '# 第一页\n---\n# 第二页\n');
});

test('块内含非 key: value 行时不视为 YAML 头(防止误判 --- 分页)', () => {
  const text = '---\n# 这其实是第一张幻灯片的内容\n---\n第二页\n';
  const { meta, body } = parseDeckFrontmatter(text);
  assert.deepEqual(meta, {});
  assert.equal(body, text);
});

test('空行容忍', () => {
  const { meta } = parseDeckFrontmatter('---\n\ntitle-position: top-left\n\n---\n正文');
  assert.equal(meta['title-position'], 'top-left');
});

test('rewriteImageUrls 重写相对路径图片', () => {
  const body = '![图](images/a.png)\n![外链](https://x.com/b.png)\n![根路径](/c.png)\n![数据](data:image/png;base64,xx)\n';
  const out = rewriteImageUrls(body, (src) => `/slides/${src}`);
  assert.ok(out.includes('![图](/slides/images/a.png)'));
  assert.ok(out.includes('![外链](https://x.com/b.png)'));
  assert.ok(out.includes('![根路径](/c.png)'));
  assert.ok(out.includes('![数据](data:image/png;base64,xx)'));
});

test('rewriteImageUrls 处理带空格与 query 的路径', () => {
  const out = rewriteImageUrls('![x](my img.png)', (src) => `/api/media?path=${encodeURIComponent('/d/' + src)}`);
  assert.ok(out.includes('![x](/api/media?path=%2Fd%2Fmy%20img.png)'));
});
