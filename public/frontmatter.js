// 解析课件 Markdown 顶部的 YAML 头(--- 包裹的 key: value 行)
// 仅支持扁平键值,足够课件全局配置使用;返回 { meta, body }
// 防误判:块内存在非 key: value 的非空行时,不视为 YAML 头(可能是课件恰好以 --- 分页开头)
export function parseDeckFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---(\n|$)/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue; // 空行容忍
    const kv = trimmed.match(/^([A-Za-z][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!kv) return { meta: {}, body: text };
    meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(m[0].length) };
}

// 重写 Markdown 里的相对路径图片:resolve(src) 返回可访问的 URL
// 绝对路径(/开头)、http(s)、data: 的不动
export function rewriteImageUrls(body, resolve) {
  return body.replace(
    /!\[([^\]]*)\]\((?!https?:|data:|\/)([^)]+)\)/g,
    (m, alt, src) => `![${alt}](${resolve(src.trim())})`,
  );
}
