# 模板扩展指南

新增模板 = 在本目录新建一个子目录,放入 3 个文件,重启服务即可,无需改代码。

## 目录结构

```
templates/<模板id>/
├── meta.json   # 元数据与槽位定义
├── view.html   # 视图,槽位用 {{槽位名}} 占位
└── style.css   # 样式,建议所有选择器以 .tpl-<模板id> 开头避免冲突
```

## meta.json schema

```json
{
  "name": "显示名称",
  "description": "适用场景描述(会写进 prompt,agent 靠它选模板,务必写清楚)",
  "slots": {
    "槽位名": { "type": "text" },
    "列表槽位名": { "type": "list", "maxItems": 5 }
  }
}
```

- `type: "text"` — 纯文本,HTML 转义后替换 `{{槽位名}}`
- `type: "list"` — 字符串数组,渲染为 `<li>` 序列替换占位符,view 中应放在 `<ul>`/`<ol>` 内
- `maxItems` 可省略(不限),超出会被截断

## 调试

- `GET /api/templates` 查看当前已注册模板
- 用 `mock` agent 或手动构造 JSON 验证渲染效果
