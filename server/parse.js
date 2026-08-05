// 解析 CLI agent 的 stdout:提取第一个 JSON 对象,失败则整体作为纯文本回答
export function parseAgentOutput(stdout) {
  const text = String(stdout ?? '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { answer: text };
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.answer !== 'string' || !obj.answer) return { answer: text };
    if (typeof obj.template === 'string' && obj.slots && typeof obj.slots === 'object') {
      return { template: obj.template, slots: obj.slots, answer: obj.answer };
    }
    return { answer: obj.answer };
  } catch {
    return { answer: text };
  }
}
