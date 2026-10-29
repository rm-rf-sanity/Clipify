const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DEFAULT_SETTINGS, validateSettings } = require('../electron/services/validation.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/audio/deviceIdentity.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const output = (deviceId, label) => ({ deviceId, label, kind: 'audiooutput' });
const saved = { ...DEFAULT_SETTINGS, speakerId: 'speaker', cableId: 'old-cable', cableLabel: 'Speakers (2- VB-Audio Virtual Cable)', cableEnabled: true };

test('available device IDs learn their names without changing routing preferences', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const settings = { ...saved, cableEnabled: false };
  const result = reconcileDeviceIdentities(settings, [output('speaker', 'Physical speakers'), output('old-cable', 'Speakers (2- VB-Audio Virtual Cable)')]);
  assert.equal(result.speakerLabel, 'Physical speakers');
  assert.equal(result.cableId, saved.cableId);
  assert.equal(result.cableEnabled, false);
  assert.equal(result.cableVolume, settings.cableVolume);
  assert.equal(settings.speakerLabel, '');
});

test('a rotated cable ID recovers from its unique remembered name after a Windows instance change', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const result = reconcileDeviceIdentities(saved, [output('new-cable', 'Speakers (3- VB-Audio Virtual Cable)'), output('16-channel', 'CABLE In 16 Ch (3- VB-Audio Virtual Cable)')]);
  assert.equal(result.cableId, 'new-cable');
  assert.equal(result.cableLabel, 'Speakers (3- VB-Audio Virtual Cable)');
  assert.equal(result.cableEnabled, true);
  assert.equal(result.speakerId, saved.speakerId);
});

test('a missing two-channel cable never substitutes a different channel layout', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const result = reconcileDeviceIdentities(saved, [output('16-channel', 'CABLE In 16 Ch (2- VB-Audio Virtual Cable)')]);
  assert.equal(result.cableId, 'old-cable');
});

test('ambiguous device names do not reconnect automatically', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const result = reconcileDeviceIdentities(saved, [output('one', 'Speakers (3- VB-Audio Virtual Cable)'), output('two', 'Speakers (4- VB-Audio Virtual Cable)')]);
  assert.equal(result.cableId, 'old-cable');
});

test('default aliases cannot substitute for the explicit cable output', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const result = reconcileDeviceIdentities({ ...saved, microphoneLabel: 'Previous microphone' }, [output('default', saved.cableLabel), output('communications', saved.cableLabel)]);
  assert.equal(result.cableId, 'old-cable');
  assert.equal(result.microphoneId, 'default');
  assert.equal(result.microphoneLabel, '');
});

test('legacy settings and missing labels do not guess a virtual output', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  assert.equal(reconcileDeviceIdentities({ ...saved, cableLabel: '' }, [output('new-cable', saved.cableLabel)]).cableId, 'old-cable');
  assert.equal(reconcileDeviceIdentities(saved, [output('new-cable', '')]).cableId, 'old-cable');
});

test('microphone identity recovery only matches recording devices', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const result = reconcileDeviceIdentities({ ...saved, microphoneId: 'old-mic', microphoneLabel: 'Shared name' }, [output('output', 'Shared name'), { deviceId: 'new-mic', label: 'Shared name', kind: 'audioinput' }]);
  assert.equal(result.microphoneId, 'new-mic');
});

test('a new manual selection does not inherit the previous device name', async () => {
  const { reconcileDeviceIdentities } = await modulePromise;
  const result = reconcileDeviceIdentities({ ...saved, cableId: 'new-selection' }, [output('old-cable', saved.cableLabel), output('new-selection', '')], saved);
  assert.equal(result.cableId, 'new-selection');
  assert.equal(result.cableLabel, '');
});

test('remembered names survive native settings validation and reject oversized labels', () => {
  assert.equal(validateSettings(saved).cableLabel, saved.cableLabel);
  assert.equal(validateSettings({ cableLabel: 'x'.repeat(513) }).cableLabel, '');
  assert.equal(validateSettings({ speakerId: 'legacy' }).speakerLabel, '');
});
