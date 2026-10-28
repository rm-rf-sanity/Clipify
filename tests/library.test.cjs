const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library, MAX_FILE_BYTES } = require('../electron/services/library.cjs');
const { createWave } = require('../electron/services/synthesis.cjs');
const { validateSettings, validateClip } = require('../electron/services/validation.cjs');

async function fixture(t) {
  const testRoot = path.resolve(__dirname, '../.local-test');
  await fs.mkdir(testRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(testRoot, 'unit-'));
  t.after(async () => {
    if (!path.resolve(root).startsWith(testRoot + path.sep)) throw new Error('Test cleanup escaped its workspace.');
    await fs.rm(root, { recursive: true, force: true });
  });
  const library = new Library(root);
  await library.initialize();
  return { root, library };
}

test('a fresh library has playable original samples, persisted without duplication', async t => {
  const { root, library } = await fixture(t);
  assert.equal(library.snapshot().clips.length, 6);
  const audio = await library.readAudio(library.snapshot().clips[0].id);
  assert.equal(Buffer.from(audio).toString('ascii', 0, 4), 'RIFF');
  assert.equal(Buffer.from(audio).readUInt32LE(40) + 44, audio.byteLength);
  const reopened = new Library(root);
  await reopened.initialize();
  assert.deepEqual(reopened.snapshot(), library.snapshot());
  assert.equal('file' in library.snapshot().clips[0], false);
});

test('import owns a private copy; removal never deletes the source file', async t => {
  const { root, library } = await fixture(t);
  const source = path.join(root, 'My sound.WAV');
  const bytes = createWave('chime', 0.1);
  await fs.writeFile(source, bytes);
  const imported = await library.importFiles([source]);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.library.clips.length, 7);
  const clip = imported.library.clips.at(-1);
  assert.equal(clip.name, 'My sound');
  await fs.writeFile(source, 'original changed');
  assert.deepEqual(Buffer.from(await library.readAudio(clip.id)), bytes);
  await library.removeClip(clip.id);
  assert.equal((await fs.readFile(source)).toString(), 'original changed');
  await assert.rejects(library.readAudio(clip.id), /Sound not found/);
});

test('partial imports report unsupported, missing, and oversized files independently', async t => {
  const { root, library } = await fixture(t);
  const bad = path.join(root, 'bad.txt');
  const huge = path.join(root, 'huge.wav');
  await fs.writeFile(bad, 'not audio');
  const handle = await fs.open(huge, 'w');
  await handle.truncate(MAX_FILE_BYTES + 1); await handle.close();
  const result = await library.importFiles([bad, huge, path.join(root, 'missing.mp3')]);
  assert.equal(result.errors.length, 3);
  assert.equal(result.library.clips.length, 6);
});

test('duplicate shortcuts are rejected and edits persist', async t => {
  const { root, library } = await fixture(t);
  const [first, second] = library.snapshot().clips;
  await assert.rejects(library.updateClip({ ...second, hotkey: first.hotkey }), /already assigned/);
  await library.updateClip({ ...first, name: 'A new name', loop: true, volume: 0.25, favorite: false });
  const reopened = new Library(root); await reopened.initialize();
  assert.equal(reopened.snapshot().clips[0].name, 'A new name');
  assert.equal(reopened.snapshot().clips[0].loop, true);
  assert.equal(reopened.snapshot().clips[0].volume, 0.25);
});

test('parallel writes remain valid and preserve all edits', async t => {
  const { root, library } = await fixture(t);
  await Promise.all(library.snapshot().clips.map((clip, i) => library.updateClip({ ...clip, name: 'Clip ' + i })));
  const raw = JSON.parse(await fs.readFile(path.join(root, 'library.json'), 'utf8'));
  assert.equal(raw.clips.length, 6);
  assert.ok(raw.clips.every((clip, i) => clip.name === 'Clip ' + i));
});

test('a rejected mutation leaves memory and disk unchanged and cannot leak into a later save', async t => {
  const { root, library } = await fixture(t);
  const before = library.snapshot();
  const persist = library.persist.bind(library);
  library.persist = async () => { throw new Error('Disk write failed'); };
  await assert.rejects(library.updateClip({ ...before.clips[0], name: 'Rejected edit' }), /Disk write failed/);
  await assert.rejects(library.removeClip(before.clips[1].id), /Disk write failed/);
  await assert.rejects(library.saveSettings({ ...before.settings, overlap: true }), /Disk write failed/);
  assert.deepEqual(library.snapshot(), before);
  const fromDisk = new Library(root);
  await fromDisk.initialize();
  assert.deepEqual(fromDisk.snapshot(), before);

  library.persist = persist;
  await library.updateClip({ ...before.clips[2], name: 'Successful edit' });
  const reopened = new Library(root);
  await reopened.initialize();
  const result = reopened.snapshot();
  assert.equal(result.clips[0].name, before.clips[0].name);
  assert.equal(result.clips[1].id, before.clips[1].id);
  assert.equal(result.settings.overlap, before.settings.overlap);
  assert.equal(result.clips[2].name, 'Successful edit');
});

test('readers see committed state while a write is pending and concurrent operations keep their order', async t => {
  const { root, library } = await fixture(t);
  const before = library.snapshot();
  const persist = library.persist.bind(library);
  let release;
  let signalWriteStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const writeStarted = new Promise(resolve => { signalWriteStarted = resolve; });
  let held = false;
  library.persist = async draft => {
    if (!held) { held = true; signalWriteStarted(); await gate; }
    await persist(draft);
  };
  const edited = library.updateClip({ ...before.clips[0], name: 'First committed edit' });
  await writeStarted;
  const removed = library.removeClip(before.clips[1].id);
  const configured = library.saveSettings({ ...before.settings, overlap: true });
  assert.deepEqual(library.snapshot(), before);
  release();
  const [editResult, removeResult, settingsResult] = await Promise.all([edited, removed, configured]);
  assert.equal(editResult.clips.length, 6);
  assert.equal(editResult.settings.overlap, false);
  assert.equal(removeResult.clips.length, 5);
  assert.equal(removeResult.settings.overlap, false);
  assert.equal(settingsResult.clips.length, 5);
  assert.equal(settingsResult.settings.overlap, true);
  const reopened = new Library(root);
  await reopened.initialize();
  assert.deepEqual(reopened.snapshot(), settingsResult);
});

test('failed import preserves its source and recovery copy without committing an untracked sound', async t => {
  const { root, library } = await fixture(t);
  const before = library.snapshot();
  const source = path.join(root, 'Preserved.wav');
  const bytes = createWave('chime', 0.1);
  await fs.writeFile(source, bytes);
  const persist = library.persist.bind(library);
  library.persist = async () => { throw new Error('Disk write failed'); };
  await assert.rejects(library.importFiles([source]), /Disk write failed/);
  assert.deepEqual(library.snapshot(), before);
  assert.deepEqual(await fs.readFile(source), bytes);
  assert.equal((await fs.readdir(library.audioRoot)).length, 7);
  library.persist = persist;
  await library.saveSettings({ ...before.settings, overlap: true });
  const reopened = new Library(root);
  await reopened.initialize();
  assert.equal(reopened.snapshot().clips.length, 6);
});

test('corrupted libraries and path traversal are preserved and rejected', async t => {
  const { root, library } = await fixture(t);
  const saved = JSON.parse(await fs.readFile(library.file, 'utf8'));
  saved.clips[0].file = '../../private.wav';
  const payload = JSON.stringify(saved);
  await fs.writeFile(library.file, payload);
  await assert.rejects(new Library(root).initialize(), /original files are preserved/);
  assert.equal(await fs.readFile(library.file, 'utf8'), payload);
  await assert.rejects(library.readAudio('../../private'), /Sound not found/);
});

test('invalid sorting metadata and duplicate IDs are rejected without rewriting the catalog', async t => {
  const { root, library } = await fixture(t);
  const saved = JSON.parse(await fs.readFile(library.file, 'utf8'));
  for (const corrupt of [
    value => { value.clips[0].addedAt = 42; },
    value => { value.clips[1].id = value.clips[0].id; },
    value => { value.clips[1].hotkey = value.clips[0].hotkey; },
  ]) {
    const draft = structuredClone(saved);
    corrupt(draft);
    const payload = JSON.stringify(draft);
    await fs.writeFile(library.file, payload);
    await assert.rejects(new Library(root).initialize(), /original files are preserved/);
    assert.equal(await fs.readFile(library.file, 'utf8'), payload);
  }
});

test('settings clamp levels, reject unsafe default cable routing, and validate clip IDs', () => {
  const settings = validateSettings({ cableEnabled: true, cableId: 'default', speakerVolume: Infinity, cableVolume: -4 });
  assert.equal(settings.cableEnabled, false);
  assert.equal(settings.speakerVolume, 0.75);
  assert.equal(settings.cableVolume, 0);
  assert.throws(() => validateClip({ id: '../../secret', name: 'test' }), /Invalid clip ID/);
  assert.throws(() => validateClip({ id: 'test', name: '  ' }), /needs a name/);
});
