import crypto from 'node:crypto';

export function serializeToolsPrompt(tools, toolChoice = 'auto') {
  if (!Array.isArray(tools) || !tools.length) return '';
  const defs = tools.map(tool => tool?.function || tool).filter(item => item?.name).map(item => ({
    name: item.name,
    description: item.description || '',
    parameters: item.parameters || { type: 'object', properties: {} }
  }));
  if (!defs.length) return '';
  return [
    '你可以调用以下工具。需要调用时，只输出一个 JSON 对象：',
    '{"tool_call":{"name":"工具名","arguments":{}}}',
    '不要执行工具，不要使用 XML、DSML 或 Markdown 代码围栏。',
    `tool_choice: ${typeof toolChoice === 'string' ? toolChoice : JSON.stringify(toolChoice)}`,
    ...defs.map(item => `工具 ${item.name}: ${item.description}\n参数: ${JSON.stringify(item.parameters)}`)
  ].join('\n');
}

export function parseToolCall(text, tools = []) {
  const allowed = new Set(tools.map(t => (t?.function || t)?.name).filter(Boolean));
  const candidates = [];
  const raw = String(text || '').trim();
  candidates.push(raw);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  for (const match of raw.matchAll(/<(?:tool_call|tool)>\s*([\s\S]*?)\s*<\/(?:tool_call|tool)>/gi)) candidates.push(match[1].trim());
  const compact = raw.match(/\{\s*["']?(?:tool_call|name)["']?\s*:[\s\S]*\}/i);
  if (compact) candidates.push(compact[0]);

  for (const candidate of candidates) {
    const parsed = tolerantJson(candidate);
    const call = parsed?.tool_call || parsed;
    if (!call || typeof call !== 'object') continue;
    const fn = call.function || call;
    const name = String(fn.name || '').trim();
    if (!name || (allowed.size && !allowed.has(name))) continue;
    let args = fn.arguments ?? fn.parameters ?? {};
    if (typeof args !== 'string') args = JSON.stringify(args);
    else args = String(tolerantJson(args) ? JSON.stringify(tolerantJson(args)) : args);
    return { id: `call_${crypto.randomBytes(8).toString('hex')}`, type: 'function', function: { name, arguments: args } };
  }
  return null;
}

function tolerantJson(value) {
  try { return JSON.parse(String(value)); } catch { /* continue */ }
  try {
    const repaired = String(value).replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
    return JSON.parse(repaired);
  } catch { return null; }
}
