import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeToolsPrompt, parseToolCall } from '../src/toolBridge.js';
import { buildToolConversationPrompt } from '../src/promptBuilder.js';

test('tool bridge parses JSON tool calls', () => {
  const call = parseToolCall('{"tool_call":{"name":"read_file","arguments":{"path":"C:\\\\tmp\\\\a.txt"}}}', [{ function: { name: 'read_file' } }]);
  assert.equal(call.function.name, 'read_file');
  assert.match(call.function.arguments, /tmp/);
});

test('tool prompt serializes definitions', () => {
  const prompt = serializeToolsPrompt([{ type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object' } } }]);
  assert.match(prompt, /read_file/);
  assert.match(prompt, /不要使用 XML/);
});

test('prompt builder retains tool history', () => {
  const prompt = buildToolConversationPrompt([
    { role: 'user', content: 'read config' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"config.json"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' }
  ]);
  assert.match(prompt, /调用工具/);
  assert.match(prompt, /Tool Result/);
});