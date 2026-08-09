// 解析 CLI agent 的 stdout:提取第一个 JSON 对象,失败则整体作为纯文本回答
export function parseAgentOutput(stdout) {
  const text = String(stdout ?? '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { answer: text };
  try {
    const obj = JSON.parse(match[0]);
    const slots = (obj.slots && typeof obj.slots === 'object' && !Array.isArray(obj.slots))
      ? { ...obj.slots }
      : {};
    // 容错:模型有时把 answer 误嵌进 slots,提升为根级
    const answer = (typeof obj.answer === 'string' && obj.answer)
      || (typeof slots.answer === 'string' && slots.answer)
      || null;
    if (!answer) return { answer: text };
    delete slots.answer;
    if (typeof obj.template === 'string') {
      return { template: obj.template, slots, answer };
    }
    return { answer };
  } catch {
    return { answer: text };
  }
}
