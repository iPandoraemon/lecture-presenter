# Lecture Presenter 设计文档

日期:2026-08-05

## 背景与目标

大学教师课堂演示工具:左侧展示课件(Markdown 幻灯片),右侧对话框连接 CLI Agent(Claude Code / Kimi / Codex / Pi 等)。提问后 Agent 选择一个预置模板并填入内容,渲染成美观界面,作为动态幻灯片插入课件区展示。

## 关键决策(已与用户确认)

- 技术形态:本地 Web 应用(Node 后端 + 浏览器前端)
- 课件格式:Markdown 幻灯片,`---` 分页
- 模板填充:单次调用,Agent 输出严格 JSON(模板 id + 槽位内容 + 一句话回答)
- 渲染结果呈现:插入为当前页之后的新幻灯片,可翻页回看
- Agent 接入:可配置适配器(config/agents.json),新增 agent 不改代码
- 前端:reveal.js(CDN)+ 原生 HTML/JS,无构建步骤

## 总体架构

```
lecture-presenter/
├── server/              # Node 后端(Express,无构建步骤)
│   ├── index.js         # HTTP + 静态托管
│   ├── agents.js        # AgentAdapter 注册表(读 config/agents.json)
│   ├── templates.js     # 模板清单加载(扫描 templates/)
│   └── prompt.js        # 拼 prompt:课件上下文 + 模板清单 + JSON 输出契约
├── config/agents.json   # 各 CLI 的命令模板、超时、开关
├── templates/           # 每个模板一个目录:meta.json + view.html + style.css
│   └── README.md        # meta.json schema 说明 + 最小示例(扩展模板指南)
├── slides/              # Markdown 课件
└── public/              # 前端:index.html + 原生 JS + reveal.js(CDN)
```

## 数据流(一次问答)

1. 右栏输入问题 → `POST /api/ask { agent, question, slideContext }`
2. 后端取当前幻灯片 Markdown 作为上下文,连同模板清单拼成 prompt,要求 Agent 只输出:
   `{"template": "id", "slots": {...}, "answer": "一句话回答"}`
3. 按适配器配置 spawn CLI(如 `claude -p`, `kimi -p`),读 stdout
4. 后端解析 + 校验 JSON(校验失败则纯文本兜底)
5. 前端:右栏气泡显示 `answer`;左栏按 template id 渲染 HTML,插入为当前页之后的动态幻灯片并自动跳转,翻页键可回看

## 模板系统

v1 内置 4 个模板:

- `key-points` — 标题 + 3~6 个要点卡片
- `comparison` — 双栏对比表
- `code-explain` — 代码块 + 逐段解释
- `diagram-flow` — 标题 + 3~5 步流程

每个模板目录:

- `meta.json`:模板名称、适用场景描述(进 prompt 供 Agent 选择)、槽位定义(名称/类型/是否数组/最大条数)
- `view.html`:`{{slot}}` 占位符
- `style.css`:独立样式

渲染 = 服务端/前端字符串替换。Agent 不输出任何 HTML/JS,保证安全与样式统一。

### 模板扩展机制(硬性要求)

- 后端启动时扫描 `templates/`,发现含 `meta.json + view.html + style.css` 的目录即自动注册
- 新增模板 = 新建目录放 3 个文件 + 重启服务,不改任何代码
- `templates/README.md` 记录 meta.json schema 与最小示例
- `GET /api/templates` 返回当前模板清单,便于调试

## Agent 适配器

`config/agents.json` 示例:

```json
{
  "claude": { "enabled": true, "command": "claude", "args": ["-p", "{prompt}"], "timeout": 60 },
  "kimi":   { "enabled": true, "command": "kimi",   "args": ["-p", "{prompt}"], "timeout": 60 }
}
```

spawn 时将 `{prompt}` 替换为完整 prompt,stdout 即回答。新增 Agent 只需加配置。前端右栏顶部下拉框切换 Agent。

## 界面布局

- 左栏(约 70%):reveal.js 幻灯片区,方向键/点击翻页
- 右栏(约 30%):顶部 Agent 下拉框 + 状态指示灯;中间聊天记录;底部输入框,Enter 发送
- 动态幻灯片带 "AI 生成" 标记
- 主窗口即演示窗口,v1 不做演讲者视图

## 错误处理

- CLI 不存在/超时/非零退出 → 右栏明确错误气泡,不阻塞课件
- Agent 返回非法 JSON → 纯文本兜底为 answer,不生成动态幻灯片
- JSON 合法但模板 id 不存在/槽位缺失 → 按 meta.json 校验,截断/填默认,仍渲染
- 调用中禁止重复发送,超时默认 60s(可配置)

## 测试

- 后端:`node --test` 单测覆盖 prompt 拼接、JSON 解析兜底、模板校验、适配器命令构造(mock spawn)
- 前端:手动验收为主
- 提供 mock agent 配置(回显固定 JSON),无真实 CLI 时可演示和测试
