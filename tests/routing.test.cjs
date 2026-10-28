const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DEFAULT_SETTINGS } = require('../electron/services/validation.cjs');

const source = fs.readFileSync(path.join(__dirname, '../src/audio/restoreRouting.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const saved = { ...DEFAULT_SETTINGS, speakerId: 'realtek-speaker', cableId: 'vb-cable', microphoneId: 'realtek-microphone', cableEnabled: true };

test('startup restores selected outputs, levels, and enabled virtual routing', async () => {
  const { restoreRouting } = await modulePromise;
  let configured;
  const result = await restoreRouting(saved, async settings => { configured = settings; });
  assert.deepEqual(configured, saved);
  assert.deepEqual(result.settings, saved);
  assert.equal(result.message, '');
});

test('startup preserves an explicitly disabled virtual route', async () => {
  const { restoreRouting } = await modulePromise;
  const states = [];
  const result = await restoreRouting({ ...saved, cableEnabled: false }, async settings => states.push(settings));
  assert.equal(result.settings.cableEnabled, false);
  assert.ok(states.every(settings => !settings.cableEnabled));
});

test('a missing cable leaves the saved physical speaker and microphone intact', async () => {
  const { restoreRouting } = await modulePromise;
  const result = await restoreRouting(saved, async settings => {
    if (settings.cableEnabled) throw new Error('Cable disconnected');
  });
  assert.deepEqual(result.settings, { ...saved, cableEnabled: false });
  assert.match(result.message, /saved virtual cable is unavailable/);
});

test('a missing physical speaker recovers without disabling an available cable', async () => {
  const { restoreRouting } = await modulePromise;
  let configured;
  const result = await restoreRouting(saved, async settings => {
    if (settings.speakerId === saved.speakerId) throw new Error('Speaker disconnected');
    configured = settings;
  });
  assert.deepEqual(configured, { ...saved, speakerId: 'default' });
  assert.equal(result.settings.cableEnabled, true);
  assert.match(result.message, /saved speaker is unavailable/);
});

test('both missing devices recover to default speakers with virtual routing off', async () => {
  const { restoreRouting } = await modulePromise;
  const result = await restoreRouting(saved, async settings => {
    if (settings.speakerId === saved.speakerId || settings.cableEnabled) throw new Error('Device disconnected');
  });
  assert.deepEqual(result.settings, { ...saved, speakerId: 'default', cableEnabled: false });
  assert.match(result.message, /saved speaker is unavailable/);
  assert.match(result.message, /saved virtual cable is unavailable/);
});
