import { chromium as baseChromium } from 'playwright';

let chromium = baseChromium;
let stealthReady = false;

export async function getChromium({ stealth = false } = {}) {
  if (!stealth || stealthReady) return chromium;
  try {
    const extra = await import('playwright-extra');
    const stealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    chromium = extra.chromium;
    chromium.use(stealthPlugin());
    stealthReady = true;
  } catch {
    // 可选依赖不可用时继续使用原生 Playwright。
  }
  return chromium;
}

export async function launchPersistentContext(userDataDir, options = {}) {
  const engine = await getChromium({ stealth: options.stealth });
  const { stealth: _stealth, ...launchOptions } = options;
  return engine.launchPersistentContext(userDataDir, launchOptions);
}
