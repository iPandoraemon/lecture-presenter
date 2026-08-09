// 拼出发给 CLI agent 的完整 prompt:课件上下文 + 模板清单 + 严格 JSON 输出契约
export function buildPrompt({ question, slideContext, templates }) {
  const tplList = templates.map((t) => {
    const slotDesc = Object.entries(t.slots)
      .map(([name, def]) => `    - ${name}(${def.type}${def.type === 'list' ? `,最多 ${def.maxItems ?? '不限'} 条` : ''})`)
      .join('\n');
    return `- 模板 id: "${t.id}"\n  适用场景: ${t.description}\n  槽位:\n${slotDesc}`;
  }).join('\n');

  return `你是课堂助教,正在配合教师讲课。请回答下面的问题,并从可用模板中选一个最合适的来组织展示内容。

当前课件页内容:
"""
${slideContext}
"""

可用模板:
${tplList}

问题: ${question}

要求:
1. 先输出一两句话的纯文本回答(不要带任何格式标记),然后另起一行输出幻灯片 JSON。
2. JSON 格式: {"template": "<模板id>", "slots": {<各槽位内容>}}
   即:纯文本回答在前,JSON 在后,除此之外不要输出任何其他内容或 markdown 代码块标记。
3. slots 的键必须与所选模板的槽位完全一致,list 类型槽位用字符串数组。
4. 内容用中文,简洁,适合课堂投影展示。`;
}
