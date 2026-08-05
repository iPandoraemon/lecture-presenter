import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTemplates, validateSlots, renderTemplate } from '../server/templates.js';

async function makeTemplatesDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tpl-'));
  const t = path.join(dir, 'demo');
  await mkdir(t);
  await writeFile(path.join(t, 'meta.json'), JSON.stringify({
    name: '演示', description: '测试用',
    slots: { title: { type: 'text' }, points: { type: 'list', maxItems: 3 } },
  }));
  await writeFile(path.join(t, 'view.html'), '<h2>{{title}}</h2><ul>{{points}}</ul>');
  await writeFile(path.join(t, 'style.css'), '.demo{color:red}');
  await mkdir(path.join(dir, 'incomplete')); // 缺文件,应被跳过
  const noslots = path.join(dir, 'noslots');
  await mkdir(noslots);
  await writeFile(path.join(noslots, 'meta.json'), JSON.stringify({ name: '无槽位' }));
  await writeFile(path.join(noslots, 'view.html'), '<h2>x</h2>');
  await writeFile(path.join(noslots, 'style.css'), '.x{}');
  const badjson = path.join(dir, 'badjson');
  await mkdir(badjson);
  await writeFile(path.join(badjson, 'meta.json'), '{invalid json');
  await writeFile(path.join(badjson, 'view.html'), '<h2>x</h2>');
  await writeFile(path.join(badjson, 'style.css'), '.x{}');
  return dir;
}

test('loadTemplates 扫描目录并跳过不完整模板', async () => {
  const dir = await makeTemplatesDir();
  const templates = await loadTemplates(dir);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].id, 'demo');
  assert.equal(templates[0].name, '演示');
  assert.ok(templates[0].view.includes('{{title}}'));
  assert.ok(templates[0].style.includes('color:red'));
});

test('loadTemplates 跳过缺 slots 定义和 meta.json 非法的模板', async () => {
  const dir = await makeTemplatesDir();
  const templates = await loadTemplates(dir);
  assert.deepEqual(templates.map((t) => t.id), ['demo']);
});

test('validateSlots 截断超长列表并填充默认值', () => {
  const tpl = { slots: { title: { type: 'text' }, points: { type: 'list', maxItems: 3 } } };
  const slots = validateSlots(tpl, { points: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(slots.points, ['a', 'b', 'c']);
  assert.equal(slots.title, '');
});

test('renderTemplate 替换槽位并转义 HTML', () => {
  const tpl = {
    view: '<h2>{{title}}</h2><ul>{{points}}</ul>',
    slots: { title: { type: 'text' }, points: { type: 'list' } },
  };
  const html = renderTemplate(tpl, { title: '<script>x</script>', points: ['甲', '乙'] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<li>甲</li><li>乙</li>'));
});
