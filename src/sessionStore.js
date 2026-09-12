import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 16);
}

export class SessionStore {
  constructor(dir, { writeBehindMs = 200 } = {}) {
    this.dir = dir;
    this.writeBehindMs = writeBehindMs;
    this.cache = new Map();
    this.pending = new Map();
    this.timer = null;
  }

  fileFor(apiKey) { return path.join(this.dir, `${hashApiKey(apiKey)}.json`); }

  async get(apiKey) {
    const id = hashApiKey(apiKey);
    if (this.cache.has(id)) return this.cache.get(id);
    try {
      const value = JSON.parse(await fs.readFile(this.fileFor(apiKey), 'utf8'));
      this.cache.set(id, value);
      return value;
    } catch (err) {
      if (err.code !== 'ENOENT') this.cache.set(id, null);
      return null;
    }
  }

  async list() {
    await fs.mkdir(this.dir, { recursive: true });
    const names = await fs.readdir(this.dir).catch(() => []);
    const result = [];
    for (const name of names.filter(n => n.endsWith('.json'))) {
      try { result.push(JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8'))); } catch { /* ignore corrupt entry */ }
    }
    return result;
  }

  set(apiKey, value) {
    const id = hashApiKey(apiKey);
    this.cache.set(id, value);
    this.pending.set(id, { apiKey, value });
    this.schedule();
    return value;
  }

  async remove(apiKey) {
    const id = hashApiKey(apiKey);
    this.cache.delete(id);
    this.pending.delete(id);
    await fs.rm(this.fileFor(apiKey), { force: true });
  }

  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush().catch(() => {}), this.writeBehindMs);
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const writes = [...this.pending.values()];
    this.pending.clear();
    await fs.mkdir(this.dir, { recursive: true });
    await Promise.all(writes.map(async ({ apiKey, value }) => {
      const target = this.fileFor(apiKey);
      const tmp = `${target}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
      await fs.rename(tmp, target);
    }));
  }
}
