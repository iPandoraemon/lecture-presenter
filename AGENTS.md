# AGENTS.md — Lecture Presenter

课堂演示工具:左侧 Markdown 课件(reveal.js),右侧对话框调用 CLI Agent(默认 pi),回答按预置模板渲染为动态幻灯片插入课件。

## 常用命令

```bash
npm start     # http://localhost:3000
npm test      # node --test tests/*.test.js,提交前必须全绿
```

## 结构速览

- `server/` — Express 后端(ESM):`agents.js`(CLI 适配/spawn)、`prompt.js`、`parse.js`(输出解析)、`templates.js`(模板加载/校验/渲染)、`providers.js`(模型商配置 + 同步 pi)、`dsml.js`(DSML 过滤)、`app.js`(路由)
- `public/` — 前端无构建:`app.js`(ES module)、`frontmatter.js`(YAML 头 + 图片重写)、`layouts.js`(分栏/标题/callout/表格)
- `templates/` — 展示模板,目录即插即用,见 `templates/README.md`
- `config/agents.json` — agent 适配器;`config/providers.json` — 模型商(gitignored,含 API key)
- `slides/` — 用户课件;`docs/` — 设计、计划、`LESSONS.md`

## 关键约定

- 输出契约:agent 返回"纯文本回答在前 + 幻灯片 JSON 在后";解析三级兼容见 `server/parse.js`;改契约必须同步改测试
- 流式:pi 走 `POST /api/ask-stream`(SSE),其余走 `/api/ask`
- 模板渲染永远 HTML 转义,agent 不产出 HTML/JS
- TDD:先写失败测试再实现;用户可见行为尽量用无头 Chrome(`/Applications/Google Chrome.app` + `--headless=new --screenshot/--dump-dom`)或 puppeteer-core 实测,不要只验 HTTP 层

## 资产沉淀流程(每次迭代后执行)

在修复非平凡 bug、发现环境/依赖的坑、调整输出契约或关键机制后,必须更新 `docs/LESSONS.md`:

1. **写什么**:会再踩的坑(现象→根因→处理位置)、可复用的机制(某个依赖的真实行为及正确用法)、修复日志一行(症状→根因→commit)
2. **不写什么**:项目能直接从代码读出的内容、过程叙述、车轱辘话、一次性问题
3. **怎么写**:面向"没经历过本轮会话的 agent",条目自足、位置精确到文件;机制类放主题分类下,修复日志只加一行
4. **何时更新旧条目**:机制发生变化(如输出契约演进)时,改写旧条目保持唯一真相,不要新旧并存
5. 若改动涉及本文件的命令/结构/约定,同步更新本文件与 `README.md`
