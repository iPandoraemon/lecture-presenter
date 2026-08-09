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

## 课件写作(版式配置)

### 全局配置:文件顶部的 YAML 头

```markdown
---
title-position: top-left    # 标题位置:top-left / center(默认 center)
page-padding: 0 3em         # 页面内边距,默认 "0 2em"
font-size: 34px             # 正文字号,不写则用 reveal 默认(约 40px)
h1-size: 2.2em              # 各级标题字号,可选 h1-size / h2-size / h3-size
---
```

所有键都可省略,省略则使用默认值;不写 YAML 头的课件显示与之前完全一致。

### 图片与表格

- 图片用相对路径引用即可:`![说明](images/pic.png)`,slides/ 内课件相对 `slides/` 解析;外部路径课件相对课件所在目录解析(支持 png/jpg/gif/svg/webp)
- 表格会自动包裹可滚动区域,超出大小时支持滚轮上下/左右滚动,不会溢出页面

### Callout 提示框(Obsidian 风格)

```markdown
> [!question] 什么是大模型?
> 大模型是参数量巨大的深度学习模型。
> 支持推理、问答、翻译等任务。
```

在引用块第一行写 `[!类型]`,可选标题跟在后面。支持 `question` `note` `tip` `warning` `example` `important` `info` `quote`,未知名称按默认样式渲染。

### 导出

- **⤓ PDF**:课件栏左上角的按钮,新窗口打开打印视图并自动唤起打印对话框,选"另存为 PDF"即可——课堂上 AI 生成的动态幻灯片也会一起导出;表格在 PDF 中完整展开
- **⤓ 问答**:把本次的提问和 AI 回答(含生成的模板名)导出为 Markdown 文件下载

### 页面级配置:幻灯片内的注释(覆盖全局)

```markdown
## 某页标题
<!-- .slide: data-layout="cols" data-ratio="4:6" data-title="center" -->
```

- `data-title="center"`:这一页标题恢复居中
- `data-layout="cols"`:分栏版式,用单独一行 `|||` 切分内容(两个 `|||` 即三栏)
- `data-ratio="4:6"`:栏宽比例,每栏取值范围 2~8,超出自动收敛

```markdown
## 双栏示例
<!-- .slide: data-layout="cols" data-ratio="4:6" -->

左栏文字、列表……

|||

右栏图片、代码……
```

三者都可省略,不配置的课件与之前显示完全一致。

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
