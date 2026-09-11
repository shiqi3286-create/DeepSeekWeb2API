// 下载官方 Windows 版 Node 运行时，解压 node.exe 到 build/node/。
// 供桌面客户端的服务子进程使用，同时会被 electron-builder 打进 extraResources。
// 用法：node scripts/fetch-node.mjs [v版本号]   （默认 NODE_VERSION 环境变量或 v20.19.0）
import { mkdir, access, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.NODE_VERSION || process.argv[2] || 'v20.19.0';
const arch = process.env.NODE_ARCH || (os.arch() === 'arm64' ? 'arm64' : 'x64');
const outDir = join(root, 'build', 'node');
const nodeExe = join(outDir, 'node.exe');

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function download(url, dest) {
  console.log(`[fetch-node] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
}

async function extractZip(zipPath, target) {
  await mkdir(target, { recursive: true });
  // Windows 自带 tar (bsdtar) 可解压 zip；优先用它，失败再退回 PowerShell
  const candidates = [
    ['tar', ['-xf', zipPath, '-C', target]],
    ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${target}' -Force`]]
  ];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: 'inherit' });
      console.log(`[fetch-node] extracted with ${cmd}`);
      return;
    } catch { /* try next */ }
  }
  throw new Error('failed to extract zip (need tar or powershell)');
}

async function main() {
  if (await exists(nodeExe)) {
    console.log(`[fetch-node] node.exe already exists: ${nodeExe}`);
    return;
  }
  const dirName = `node-${version}-win-${arch}`;
  const zipName = `${dirName}.zip`;
  const zipUrl = `https://nodejs.org/dist/${version}/${zipName}`;
  const zipPath = join(os.tmpdir(), zipName);

  if (!(await exists(zipPath))) {
    await download(zipUrl, zipPath);
  }

  const extractDir = join(os.tmpdir(), `node-extract-${Date.now()}`);
  await extractZip(zipPath, extractDir);

  const src = join(extractDir, dirName, 'node.exe');
  if (!(await exists(src))) {
    throw new Error(`node.exe not found in extracted archive: ${src}`);
  }
  await mkdir(outDir, { recursive: true });
  await copyFile(src, nodeExe);
  console.log(`[fetch-node] node.exe ready: ${nodeExe}`);
}

main().catch(err => {
  console.error(`[fetch-node] ${err.message}`);
  process.exit(1);
});