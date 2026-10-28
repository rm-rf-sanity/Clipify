import { _electron as electron } from '@playwright/test';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';

await mkdir('.local-test', { recursive: true });
const root = await mkdtemp(path.resolve('.local-test', 'package-'));
const env = { ...process.env, CLIPIFY_TEST_DATA: root };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = path.resolve('release/win-unpacked/Clipify.exe');
const packageRoot = path.dirname(executablePath);
assert.equal(await readFile(path.join(packageRoot, 'COPYRIGHT-Clipify.txt'), 'utf8'), await readFile('COPYRIGHT', 'utf8'));
assert.equal(await readFile(path.join(packageRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8'), await readFile('THIRD_PARTY_NOTICES.md', 'utf8'));
const app = await electron.launch({ executablePath, args: ['--clipify-test-profile'], env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Your sound. On cue.' }).waitFor();
  await page.locator('.sound-card').first().waitFor();
  assert.equal(new URL(page.url()).protocol, 'clipify:');
  const state = await page.evaluate(() => window.clipify.load());
  assert.ok(state.clips.length > 0);
  assert.equal(state.settings.cableEnabled, false);
  await page.getByText('Microphone capture off', { exact: true }).waitFor();
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), root);
  const security = await app.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: preferences.sandbox, isolated: preferences.contextIsolation, node: preferences.nodeIntegration, webSecurity: preferences.webSecurity };
  });
  assert.deepEqual(security, { sandbox: true, isolated: true, node: false, webSecurity: true });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(await page.evaluate(async () => {
    let listener;
    let timer;
    const violation = new Promise(resolve => {
      listener = event => {
        if (event.effectiveDirective === 'connect-src' && event.blockedURI.startsWith('https://example.invalid')) {
          clearTimeout(timer);
          resolve(true);
        }
      };
      window.addEventListener('securitypolicyviolation', listener);
      timer = setTimeout(() => resolve(false), 3000);
    });
    const rejected = await fetch('https://example.invalid/').then(() => false, () => true);
    const policyViolation = await violation;
    window.removeEventListener('securitypolicyviolation', listener);
    return { rejected, policyViolation };
  }), { rejected: true, policyViolation: true });
  assert.equal(await page.evaluate(async () => (await fetch('clipify://app/..%5Celectron%5Cmain.cjs')).status), 403);
  assert.equal(await page.evaluate(async () => {
    try { await window.clipify.readAudio('../library.json'); return false; }
    catch { return true; }
  }), true);
  assert.equal(await page.evaluate(() => window.open('https://example.invalid/') === null), true);
  console.log('PASS: packaged Windows executable, isolated profile, microphone off, copyright notices, protocol, and sandbox');
  console.log('PASS: CSP blocks remote fetch; traversal, arbitrary audio IDs, and new windows are rejected');
} finally { await app.close(); }
