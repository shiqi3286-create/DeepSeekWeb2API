import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs/promises';
import { config } from './config.js';
import { client, mutex, complete, isValidApiKey, uptime, sessions } from './service.js';
import { logger } from './logger.js';
import { listModels } from './models.js';
import { ApiError, contentChunk, done, error, heartbeat, json, requestId, roleChunk, sse, sseHeaders } from './http.js';

let server;
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (config.loginMode) {
  await client.login();
} else {
  await fs.mkdir(config.tempDir, { recursive: true });
  await fs.mkdir(config.sessionDir, { recursive: true });
  server = http.createServer(handleRequest);
  server.listen(config.port, config.host, () => {
    logger.info('DeepSeekWeb2API started', { url: config.publicBaseUrl || `http://127.0.0.1:${config.port}`, auth: config.apiKey ? 'enabled' : 'disabled' });
  });
}

async function shutdown() {
  logger.info('shutting down');
  server?.close();
  await sessions.flush().catch(() => {});
  await client.close();
  process.exit(0);
}

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      json(res, 200, { ok: true, queue: mutex.size, browser: Boolean(client.context), loggedIn: Boolean(client.page), uptime: uptime() });
      return;
    }
    if (parsedUrl.pathname.startsWith('/v1/')) authorize(req);
    if (req.method === 'GET' && parsedUrl.pathname === '/v1/models') { json(res, 200, listModels()); return; }
    if (req.method === 'POST' && parsedUrl.pathname === '/v1/chat/completions') { await handleChat(req, res); return; }
    json(res, 404, { error: { message: 'Not found', type: 'invalid_request_error', code: 'not_found' } });
  } catch (err) {
    logger.error('request failed', { error: err.message });
    error(res, err);
  }
}

function authToken(req) {
  const candidates = [req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '', req.headers['api-key'], req.headers['x-api-key']];
  return candidates.find(Boolean) || '';
}
function authorize(req) {
  if (config.apiKeys?.length || config.apiKey) {
    const token = authToken(req);
    if (!isValidApiKey(token)) throw new ApiError('Invalid API key', 401, 'invalid_api_key', 'authentication_error');
  }
}

async function readJson(req) {
  const chunks = []; let total = 0;
  for await (const chunk of req) { total += chunk.length; if (total > config.maxBodyBytes) throw new ApiError('Request body is too large', 413, 'request_too_large', 'invalid_request_error'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError('Request body must be valid JSON', 400, 'invalid_json', 'invalid_request_error'); }
}

async function handleChat(req, res) {
  const body = await readJson(req);
  const key = authToken(req) || 'internal';
  const id = requestId();
  if (body.stream === true) {
    sseHeaders(res); sse(res, roleChunk({ id, model: body.model || 'deepseek' }));
    const keepalive = setInterval(() => heartbeat(res), config.keepaliveMs);
    let emitted = false;
    try {
      const result = await complete(body, { apiKey: key, source: 'api', onDelta: delta => {
        if (res.writableEnded || !delta?.value) return;
        emitted = true;
        sse(res, contentChunk({ id, model: resultModel(body), content: delta.type === 'content' ? delta.value : undefined, reasoning: delta.type === 'reasoning' ? delta.value : undefined }));
      }});
      if (!emitted && result.result.reasoning) sse(res, contentChunk({ id, model: result.model, reasoning: result.result.reasoning }));
      if (!emitted && result.result.text) sse(res, contentChunk({ id, model: result.model, content: result.result.text }));
      if (result.toolCall) sse(res, { id, object: 'chat.completion.chunk', model: result.model, choices: [{ index: 0, delta: { tool_calls: [result.toolCall] }, finish_reason: 'tool_calls' }] });
      sse(res, contentChunk({ id, model: result.model, finishReason: result.toolCall ? 'tool_calls' : 'stop' })); done(res);
    } catch (err) { error(res, err, true); } finally { clearInterval(keepalive); }
    return;
  }
  const result = await complete(body, { apiKey: key, source: 'api' });
  const payload = { id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: result.model, choices: [{ index: 0, message: result.toolCall ? { role: 'assistant', content: null, tool_calls: [result.toolCall] } : { role: 'assistant', content: result.result.text, ...(result.result.reasoning ? { reasoning_content: result.result.reasoning } : {}) }, finish_reason: result.toolCall ? 'tool_calls' : 'stop' }] };
  json(res, 200, payload);
}
function resultModel(body) { return body.model || 'deepseek'; }
