export function buildToolConversationPrompt(messages, systemPrompt = '', { maxHistoryTurns = 100 } = {}) {
  const lines = [];
  if (systemPrompt) lines.push(`System: ${systemPrompt}`);
  const source = Array.isArray(messages) ? messages.slice(-Math.max(1, maxHistoryTurns * 2)) : [];
  for (const message of source) {
    if (!message || !message.role) continue;
    if (message.role === 'system') {
      if (message.content) lines.push(`System: ${extractText(message.content)}`);
    } else if (message.role === 'user') {
      lines.push(`User: ${extractText(message.content)}`);
    } else if (message.role === 'assistant') {
      let content = extractText(message.content) || '';
      for (const call of message.tool_calls || []) {
        const fn = call.function || {};
        content += `\n[调用工具: ${fn.name || 'unknown'}(${fn.arguments || '{}'})]`;
      }
      lines.push(`Assistant: ${content}`);
    } else if (message.role === 'tool') {
      lines.push(`Tool Result [${message.tool_call_id || 'unknown'}]: ${extractText(message.content)}`);
    }
  }
  lines.push('Assistant:');
  return lines.join('\n\n');
}

export function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(item => item?.type === 'text').map(item => item.text || '').join('\n');
}
