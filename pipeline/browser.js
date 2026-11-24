// Launches headless Chrome with the GPU enabled and loads the 3D engine.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { CACHE, ensureDir, findChrome } from './paths.js';

export async function openEngine(port, { width, height, id = 0 } = {}) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    userDataDir: ensureDir(path.join(CACHE, 'chrome', 'w' + id)),
    protocolTimeout: 600000,
    args: [
      // GPU backend per OS: Direct3D 11 on Windows, Metal on macOS, the default (GL) on Linux
      ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : process.platform === 'darwin' ? ['--use-angle=metal'] : []), '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
      '--force-high-performance-gpu', '--disable-extensions',
      `--window-size=${width},${height}`,
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`[${m.type()}] ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/engine/index.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 }).catch((e) => { throw new Error('Engine failed to load:\n' + errors.join('\n')); });
  return { browser, page, errors, close: () => browser.close() };
}
