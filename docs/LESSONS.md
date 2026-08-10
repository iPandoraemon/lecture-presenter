# LESSONS — 坑与机制资产库

面向后续迭代本产品的 agent。只记录**会再踩的坑**和**可复用的机制**,按主题分类;每条 = 现象 → 根因 → 处理(位置)。修复日志见文末。

## 工具链 / Node

1. **Node 24 的 `node --test` 不支持目录参数**,报 "Cannot find module '.../tests'"。test 脚本必须用 glob:`node --test tests/*.test.js`。
2. **`execFile`(含 promisify)不接受自定义 `stdio`**;超时/限流/stdin 控制要用 `spawn` 手动收集 stdout/stderr(见 `server/agents.js`)。
3. **`String.replace` 的替换串会解释 `$&`/`$1` 等模式**——内容含这些字符会被静默篡改。占位符替换一律用函数形式 `() => value`,或 `split/join`(`server/agents.js`、`server/templates.js`)。
4. **Express 4 不捕获 async handler 的异常**,未处理 rejection 在 Node 24 默认配置下直接崩进程。所有 async 路由必须自带 try/catch(`server/app.js`)。
5. **execFile 的错误 message 包含完整命令行**(会把几 KB 的 prompt 泄到前端)。在适配层转译为简短中文错误(未安装/超时/退出码),勿直接透传 `err.message`。

## pi CLI 集成

6. **pi 在非 TTY stdin 下会等待 stdin EOF**(把管道当输入源)。spawn 必须 `stdio: ['ignore','pipe','pipe']`,否则调用挂起到超时。
7. **自定义模型商**:写入 `~/.pi/agent/models.json` 的 `providers.<name>` = `{baseUrl, api:'openai-completions', apiKey?, models:[{id,name}]}`,模型只需 id;调用 `pi -p --no-tools --provider <name> --model <id>`。apiKey 缺省时 pi 回落到自己 auth 存储的凭证。写入时合并而非覆盖,保留其他 provider(`server/providers.js`)。
8. **流式输出**:`pi --mode json` 输出 JSON 行事件流,增量在 `message_update.assistantMessageEvent`(`thinking_delta`/`text_delta`)。`--mode json` 必须插在 prompt 文本**之前**的 argv 位置(`server/agents.js runAgentStream`)。
9. **DeepSeek 会间歇输出原生 DSML 工具调用标记**(`<||DSML|| invoke ...>`),尤其当问题涉及"pi/读文档"时;`--no-tools` 下标记不被执行,直接污染文本流。用 `server/dsml.js` 过滤(整段 + 流式带块状态两种);prompt 中已加禁工具指令。

## 前端 / reveal.js

10. **reveal 的 section 是 `box-sizing: content-box`**,`width:100%` 再加 padding 会使内容向右溢出被右侧栏遮挡。加 padding 必须配 `.reveal .slides section { box-sizing: border-box; }`。
11. `.reveal .slides { pointer-events: none }`,section 为 auto;自定义滚动容器(如表格区)overflow:auto + 裁剪生效后,macOS 触控板滚动可用。怀疑"滚不动"时先查容器是否真实 overflow。
12. **打印分页**:`.reveal` 若为 `position:absolute; inset:0`,打印只有一页——`@media print` 必须恢复静态流式布局(`public/style.css` 打印段)。reveal 的 `print/pdf.css` 注入即全局生效,打印完在 `afterprint` 移除。打印 AI 动态页必须在**当前页面**原地打印,新窗口没有会话 DOM。
13. **内嵌 markdown 的正确方式**:section 上 `data-markdown`(空值)+ `<script type="text/template">` 子元素塞文本;不要 innerHTML 塞 markdown(标签会被解析)。
14. **YAML frontmatter 与 `---` 分页符冲突**:frontmatter 只在文件开头识别,且块内每行都必须匹配 `key: value`,否则整个不当 frontmatter(防止把以 `---` 开头的课件第一张幻灯片吞掉)。见 `public/frontmatter.js`。
15. **fetch 加载模式下相对图片路径按页面 URL 解析 → 404**。须在文本级重写:slides/ 内课件 → `/slides/`,外部课件 → `/api/media?path=`(`rewriteImageUrls`)。

## 输出契约与解析

16. **模型输出契约是易碎点,已演进四次**:JSON-only → answer 被误嵌进 slots(解析器提升容错)→ DSML 污染(过滤)→ 流式需要"纯文本回答在前、JSON 在后"(三级兼容:JSON.answer > slots.answer > JSON 前纯文本)。改契约时同步改 `server/parse.js` 及其测试。
17. 模板渲染安全:agent 内容**永远 HTML 转义**后字符串替换(`renderTemplate`),agent 不产出任何 HTML/JS;list 槽位渲染为 `<li>` 序列。模板即插即用:每次请求扫描 `templates/`,缺 `slots` 定义的目录跳过并 console.warn。

## 修复日志(症状 → 根因 → commit)

- npm test 报错 → Node 24 目录参数 → `99a245f`
- 无 slots 模板渲染崩溃 → 加载时未校验 → `4bdfadc`
- prompt 中 `$&` 被篡改 / 错误信息泄 prompt → replace 模式 / execFile message → `228c85b`
- 改坏 agents.json 服务崩溃 → async handler 未捕获 → `8d564e5`
- code-explain 步骤无编号 → ol+grid 抑制 ::marker → CSS counter `03159d3`
- slots 整体缺失降级纯文本 → parse 要求过严 → `4e37070`
- 真实 agent 必 60s 超时 → pi 等 stdin EOF → spawn+ignore `d0c6d54`
- 第二次提问显示原始 JSON → answer 嵌进 slots → `fa1c754`
- 表格被对话栏遮挡 → padding+content-box 右溢出 → `01b2a41`
- callout 标题进正文/标题吞正文 → 懒惰匹配、\n 非 <br> → `814c5a0`
- PDF/问答导出缺 AI 内容 → 新窗口无会话 DOM / 未存幻灯片文本 → `1d04620`
- 流式中途报"网络错误" → appendBubble 未 return 元素 → `c6e7a57`
- 输出混 DSML 垃圾 → DeepSeek 原生工具标记 → `796828d`
