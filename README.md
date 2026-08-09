# Lecture Presenter

课堂演示工具:左侧 Markdown 课件(reveal.js),右侧对话框连接 CLI Agent(Claude Code / Kimi / OpenCode / Pi 等)。提问后 Agent 选择预置模板并填入内容,渲染为动态幻灯片插入课件。

## 快速开始

```bash
npm install
npm start          # http://localhost:3000
```

## 使用

- 课件放在 `slides/`,Markdown 格式,`---` 分页
- 点击页面左上角的下拉框切换课件(自动列出 `slides/` 下所有 .md 文件);也可用 URL 参数直接指定:`http://localhost:3000/?deck=my-course.md`
- 课件也可以在 `slides/` 之外:点下拉框旁的 `…` 按钮输入 .md 文件的完整路径,或直接用 URL 参数:`http://localhost:3000/?deck=/Users/you/course/lesson1.md`
- 新增/替换 `slides/` 里的文件后,刷新页面或重新打开下拉框即可看到,无需重启
- 右栏下拉框选择 agent,输入问题,Enter 发送
- AI 生成的内容会作为新幻灯片插入当前页之后,按 ← 返回

## 配置 agent

编辑 `config/agents.json`:

```json
{
  "my-agent": { "enabled": true, "command": "my-cli", "args": ["-p", "{prompt}"], "timeout": 60 }
}
```

- `{prompt}` 会被替换为完整 prompt,CLI 的 stdout 即为回答
- 新增 agent 只需加配置,不改代码;未安装的 CLI 请设 `"enabled": false`
- 内置 `mock` agent 用于无真实 CLI 时演示

## 扩展模板

见 `templates/README.md`。新增模板 = 新建目录放 3 个文件 + 重启。

## 测试

```bash
npm test
```
