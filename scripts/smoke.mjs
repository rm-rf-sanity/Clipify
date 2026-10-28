import { _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { createWave } = require('../electron/services/synthesis.cjs');

const root = path.resolve('.local-test', `desktop-${Date.now()}`);
await mkdir(root, { recursive: true });
const source = path.join(root, 'Imported test tone.wav');
await writeFile(source, createWave('chime', 0.8));
const env = { ...process.env, CLIPIFY_TEST_DATA: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'Your sound. On cue.' }).waitFor();
  await page.getByRole('button', { name: 'Play Little victory', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.waveform rect').length > 200);
  await page.screenshot({ path: path.join(root, 'soundboard.png') });
  await mkdir('docs', { recursive: true });
  await page.screenshot({ path: 'docs/soundboard.png' });
  await page.getByRole('button', { name: 'Play Little victory', exact: true }).click();
  await page.getByRole('button', { name: 'Stop Little victory', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop all', exact: false }).click();
  await page.getByRole('button', { name: 'Play Little victory', exact: true }).waitFor();
  console.log('PASS: actual decode, playback, and stop');

  await page.getByRole('textbox', { name: 'Search sounds' }).fill('no-such-sound');
  await page.getByRole('heading', { name: 'No sounds by that name.' }).waitFor();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Favorites', exact: false }).first().click();
  assert.equal(await page.locator('.sound-card').count(), 2);
  await page.getByRole('button', { name: 'Soundboard', exact: false }).first().click();
  console.log('PASS: search, empty state, and favorite filtering');

  await page.getByRole('button', { name: 'Edit Little victory' }).click();
  await page.getByLabel('Sound name', { exact: true }).fill('Edited victory');
  await page.getByLabel('Loop this sound').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('heading', { name: 'Edited victory' }).waitFor();
  await page.getByRole('button', { name: 'Play Edited victory', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop Edited victory', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  console.log('PASS: edit, loop past the clip end, and Escape stop');

  // Replace only the test process file picker; import still uses the actual copy/storage IPC.
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, source);
  await page.getByRole('button', { name: 'Add sounds', exact: true }).click();
  await page.getByRole('heading', { name: 'Imported test tone' }).waitFor();
  await page.getByRole('button', { name: 'Play Imported test tone', exact: true }).click();
  await page.getByRole('button', { name: 'Stop Imported test tone', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  console.log('PASS: native import IPC, audio copy, and imported playback');

  await page.getByRole('button', { name: 'Edit Imported test tone' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Keep sound' }).waitFor();
  await page.getByRole('button', { name: 'Remove sound', exact: true }).click();
  await page.getByRole('heading', { name: 'Imported test tone' }).waitFor({ state: 'detached' });
  console.log('PASS: reviewable remove flow');

  await page.getByRole('button', { name: 'Quick setup', exact: false }).click();
  await page.getByRole('heading', { name: 'Your sound, through your mic.' }).waitFor();
  await page.screenshot({ path: path.join(root, 'guide.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('switch', { name: 'Allow overlapping sounds' }).click();
  await page.waitForFunction(async () => (await window.clipify.load()).settings.overlap === true);
  await page.getByRole('button', { name: 'Soundboard', exact: false }).first().click();
  await page.getByRole('button', { name: 'List view' }).click();
  await page.locator('.list-layout').waitFor();
  await page.getByRole('button', { name: 'Grid view' }).click();
  console.log('PASS: setup modal, settings persistence, and view controls');

  await page.getByRole('switch', { name: 'Speaker monitoring', exact: true }).click();
  await page.waitForFunction(async () => (await window.clipify.load()).settings.monitorEnabled === false);
  await page.getByRole('button', { name: 'Play Soft signal', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Enable a speaker or virtual cable' }).waitFor();
  assert.equal(await page.locator('.sound-card.is-playing').count(), 0);
  await page.getByRole('switch', { name: 'Speaker monitoring', exact: true }).click();
  await page.waitForFunction(async () => (await window.clipify.load()).settings.monitorEnabled === true);
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  const registered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+Space'));
  if (registered) {
    await page.getByRole('button', { name: 'Play Edited victory', exact: true }).click();
    await page.getByRole('button', { name: 'Stop Edited victory', exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('audio:hotkey', '__stop__'));
    await page.getByRole('button', { name: 'Play Edited victory', exact: true }).waitFor();
  }
  console.log('PASS: muted-output guard and global hotkey registration/event bridge');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 740));
  await page.locator('.main-content').evaluate(element => { element.scrollTop = 0; });
  const notificationDismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await notificationDismiss.count()) await notificationDismiss.click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: path.join(root, 'compact.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940));
  const data = await page.evaluate(() => window.clipify.load());
  assert.equal(data.clips[0].name, 'Edited victory');
  assert.equal(data.clips.length, 6);
  assert.equal(data.settings.overlap, true);
  assert.deepEqual(errors, []);
  console.log('PASS: compact 1080×740 layout, persisted library, no renderer exceptions');

  // Exercise startup with deterministic available sinks, independent of CI hardware.
  await page.evaluate(async () => {
    const data = await window.clipify.load();
    await window.clipify.saveSettings({ ...data.settings, speakerId: 'saved-speaker', cableId: 'saved-cable', cableEnabled: true, microphoneEnabled: false });
  });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.setSinkId = async function () {};
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const stream = context.createMediaStreamDestination().stream;
      const track = stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); void context.close(); };
      return stream;
    };
  });
  await page.reload();
  await page.getByText('Sending to virtual cable', { exact: true }).waitFor();
  const remembered = await page.evaluate(() => window.clipify.load());
  assert.equal(remembered.settings.speakerId, 'saved-speaker');
  assert.equal(remembered.settings.cableId, 'saved-cable');
  assert.equal(remembered.settings.cableEnabled, true);
  assert.equal(remembered.settings.microphoneEnabled, false);
  assert.equal(await page.getByRole('switch', { name: 'Mix physical microphone into virtual cable' }).getAttribute('aria-checked'), 'false');
  console.log('PASS: startup restores saved output devices and enabled virtual routing');

  await page.evaluate(async () => {
    const data = await window.clipify.load();
    await window.clipify.saveSettings({ ...data.settings, microphoneId: 'default', microphoneEnabled: true });
  });
  await page.reload();
  await page.getByText('Microphone live', { exact: true }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Mix physical microphone into virtual cable' }).getAttribute('aria-checked'), 'true');
  assert.equal(await page.getByLabel('PHYSICAL MICROPHONE', { exact: true }).inputValue(), 'default');
  await page.getByRole('switch', { name: 'Mix physical microphone into virtual cable' }).click();
  await page.waitForFunction(async () => (await window.clipify.load()).settings.microphoneEnabled === false);
  await page.reload();
  await page.getByText('Microphone capture off', { exact: true }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Mix physical microphone into virtual cable' }).getAttribute('aria-checked'), 'false');
  console.log('PASS: automatic system-default voice mixing and persisted manual mute (synthetic mic only)');
  console.log('Screenshots: ' + root);
} finally { await app.close(); }

// A stale Windows device ID must not prevent users from opening their library.
const file = path.join(root, 'library.json');
const persisted = JSON.parse(await readFile(file, 'utf8'));
persisted.settings.speakerId = 'disconnected-speaker';
persisted.settings.cableId = 'disconnected-cable';
persisted.settings.cableEnabled = true;
await writeFile(file, JSON.stringify(persisted));
const reopened = await electron.launch({ args: ['.'], env });
try {
  const page = await reopened.firstWindow();
  await page.getByRole('heading', { name: 'Edited victory', exact: true }).waitFor();
  await page.getByRole('alert').filter({ hasText: 'saved speaker is unavailable' }).waitFor();
  const restored = await page.evaluate(() => window.clipify.load());
  assert.equal(restored.settings.speakerId, 'default');
  assert.equal(restored.settings.cableEnabled, false);
  assert.equal(restored.settings.overlap, true);
  assert.equal(await page.getByRole('switch', { name: 'Mix physical microphone into virtual cable' }).getAttribute('aria-checked'), 'false');
  console.log('PASS: restart restores edits, recovers a disconnected speaker, and keeps cable/capture off');
} finally { await reopened.close(); }
