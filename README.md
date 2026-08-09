# Lecture Presenter

课堂演示工具:左侧 Markdown 课件(reveal.js),右侧对话框连接 CLI Agent(默认 pi,支持自定义模型商)。提问后 Agent 选择预置模板并填入内容,渲染为动态幻灯片插入课件。

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

## 配置 agent 与模型商

Agent 适配器配置在 `config/agents.json`(默认使用 pi,另有 mock 用于演示):

```json
{
  "pi": { "enabled": true, "command": "pi", "args": ["-p", "--no-tools", "{prompt}"], "timeout": 60 }
}
```

- `{prompt}` 会被替换为完整 prompt,CLI 的 stdout 即为回答
- 新增 agent 只需加配置,不改代码;未安装的 CLI 请设 `"enabled": false`

### 模型商配置(目前仅 pi 支持)

点聊天栏的 ⚙ 按钮打开模型商配置窗口,可保存多组配置:名称、API 链接、API Key、模型、额外参数(如 `--thinking high`)。配置保存在 `config/providers.json`(已 gitignore,不会提交;参考 `config/providers.example.json`)。

保存时会同步写入 pi 的 `~/.pi/agent/models.json`(openai 兼容接口),提问时在聊天栏选择对应模型商,即按该配置调用 pi。不选则使用 pi 的默认模型。

## 扩展模板

见 `templates/README.md`。新增模板 = 新建目录放 3 个文件 + 重启。

## 测试

```bash
npm test
```
