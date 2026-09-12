import crypto from 'node:crypto';
import { config } from './config.js';
import { DeepSeekClient } from './deepseekClient.js';
import { Mutex } from './mutex.js';
import { parseChatRequest, cleanupFiles } from './parser.js';
import { resolveModel } from './models.js';
import { SessionStore } from './sessionStore.js';
import { buildToolConversationPrompt } from './promptBuilder.js';
import { serializeToolsPrompt, parseToolCall } from './toolBridge.js';

export const client = new DeepSeekClient(config);
export const mutex = new Mutex();
export const sessions = new SessionStore(config.sessionDir || `${config.rootDir}/data/sessions`, { writeBehindMs: config.sessionWriteBehindMs || 200 });
const startedAt = Date.now();

export function uptime() { return Math.floor((Date.now() - startedAt) / 1000); }
export function isValidApiKey(token) {
  const keys = config.apiKeys?.length ? config.apiKeys : (config.apiKey ? [{ key: config.apiKey, enabled: true }] : []);
  return keys.some(item => item.enabled !== false && safeEqual(String(item.key), String(token || '')));
}
function safeEqual(a, b) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export async function complete(body, { onDelta, source = 'api', apiKey = '' } = {}) {
  const parsed = await parseChatRequest(body, config);
  const model = resolveModel(parsed.requestedModel);
  if (!model) throw Object.assign(new Error(`Model is not supported: ${parsed.requestedModel}`), { status: 400, code: 'model_not_found', type: 'invalid_request_error' });
  const toolPrompt = serializeToolsPrompt(body.tools, body.tool_choice);
  const historyPrompt = buildToolConversationPrompt(body.messages, '', { maxHistoryTurns: config.maxHistoryTurns || 100 });
  const prompt = toolPrompt ? `${historyPrompt}\n\n${toolPrompt}` : (historyPrompt || parsed.prompt);
  let result;
  try {
    result = await mutex.run(() => client.generate({ prompt, imagePaths: parsed.imagePaths, model, onDelta }));
  } finally {
    await cleanupFiles(parsed.imagePaths);
  }
  const toolCall = body.tools?.length ? parseToolCall(result.text, body.tools) : null;
  const session = await sessions.get(apiKey || 'internal') || { history: [], createdAt: new Date().toISOString() };
  session.history = [...(session.history || []), ...body.messages.slice(-2)].slice(-((config.maxHistoryTurns || 100) * 2));
  session.lastUsedAt = new Date().toISOString();
  sessions.set(apiKey || 'internal', session);
  return { model: model.id, result, toolCall };
}
