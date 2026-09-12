import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-v2-'));
const env = { ...process.env, HOST: '127.0.0.1', PORT: '3219', CONFIG_PATH: path.join(dir, 'config.json'), USER_DATA_DIR: path.join(dir, 'user-data'), TEMP_DIR: path.join(dir, 'tmp'), SESSION_DIR: path.join(dir, 'sessions') };
const child = spawn(process.execPath, ['src/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stderr.on('data', data => { logs += String(data); });
child.stdout.on('data', data => { logs += String(data); });
child.on('error', error => { logs += `spawn error: ${error.stack}\n`; });
child.on('exit', (code, signal) => { logs += `child exit code=${code} signal=${signal}\n`; });
const get = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = http.get(url, { headers }, res => { let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body })); });
  req.on('error', reject);
});
try {
  let health;
  for (let i = 0; i < 80; i++) { try { health = await get('http://127.0.0.1:3219/health'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  if (!health) throw new Error(`health timeout: ${logs}`);
  const models = await get('http://127.0.0.1:3219/v1/models', { authorization: 'Bearer sk-local' });
  console.log(JSON.stringify({ health, modelsStatus: models.status }));
} finally {
  child.kill();
  await fs.rm(dir, { recursive: true, force: true });
}