const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DEFAULT_SETTINGS, validateSettings } = require('../electron/services/validation.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/audio/syncMicrophone.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function microphone() {
  return { microphoneActive: false, starts: 0, stops: 0,
    async startMicrophone() { this.starts++; this.microphoneActive = true; },
    stopMicrophone() { this.stops++; this.microphoneActive = false; },
  };
}
test('voice mixing and system default microphone are the defaults, including old settings', () => {
  assert.equal(DEFAULT_SETTINGS.microphoneEnabled, true);
  assert.equal(DEFAULT_SETTINGS.microphoneId, 'default');
  assert.equal(validateSettings({ cableId: 'cable', cableEnabled: true }).microphoneEnabled, true);
  assert.equal(validateSettings({ microphoneEnabled: false }).microphoneEnabled, false);
});
test('startup automatically starts voice mixing once when the cable is enabled', async () => {
  const { syncMicrophone } = await modulePromise;
  const engine = microphone();
  const settings = { ...DEFAULT_SETTINGS, cableId: 'cable', cableEnabled: true };
  assert.equal(await syncMicrophone(settings, engine), true);
  assert.equal(await syncMicrophone(settings, engine), true);
  assert.equal(engine.starts, 1);
});
test('a saved mute is honored across startup even with a connected cable', async () => {
  const { syncMicrophone } = await modulePromise;
  const engine = microphone();
  engine.microphoneActive = true;
  assert.equal(await syncMicrophone({ ...DEFAULT_SETTINGS, cableEnabled: true, microphoneEnabled: false }, engine), false);
  assert.equal(engine.microphoneActive, false);
  assert.equal(engine.starts, 0);
});
test('no cable means no automatic microphone capture', async () => {
  const { syncMicrophone } = await modulePromise;
  const engine = microphone();
  assert.equal(await syncMicrophone(DEFAULT_SETTINGS, engine), false);
  assert.equal(engine.starts, 0);
});
test('unavailable microphone reports the failure without pretending capture is live', async () => {
  const { syncMicrophone } = await modulePromise;
  const engine = microphone();
  engine.startMicrophone = async () => { throw new Error('Microphone unavailable'); };
  await assert.rejects(syncMicrophone({ ...DEFAULT_SETTINGS, cableEnabled: true }, engine), /Microphone unavailable/);
  assert.equal(engine.microphoneActive, false);
});
