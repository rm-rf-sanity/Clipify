const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/audio/AudioEngine.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const defaults = {
  speakerId: 'speakers', cableId: 'virtual-cable', microphoneId: 'physical-mic',
  speakerVolume: 0.75, cableVolume: 0.6, microphoneVolume: 0.8,
  monitorEnabled: true, cableEnabled: false, microphoneEnabled: true, overlap: false,
};
const clip = id => ({ id, volume: 0.5, loop: false });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, options = {}) {
  const { AudioEngine } = await modulePromise;
  let context;
  const outputs = [];
  const streams = [];
  const parameter = () => ({ value: 1, setTargetAtTime(value) { this.value = value; } });
  class Node {
    connections = [];
    gain = parameter();
    connect(target) { this.connections.push(target); return target; }
    disconnect() { this.connections = []; }
  }
  class Context {
    currentTime = 0;
    gains = [];
    sources = [];
    destinations = [];
    microphoneSources = [];
    createGain() { const node = new Node(); this.gains.push(node); return node; }
    createMediaStreamDestination() { const node = new Node(); node.stream = {}; this.destinations.push(node); return node; }
    createDynamicsCompressor() { const node = new Node(); for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = parameter(); this.compressor = node; return node; }
    createAnalyser() { const node = new Node(); node.getFloatTimeDomainData = data => data.fill(0); return node; }
    async decodeAudioData() { return options.decodeAudio ? options.decodeAudio() : { duration: 2, length: 4410, numberOfChannels: 1, getChannelData: () => Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * 0.5) }; }
    createBufferSource() {
      const node = new Node(); node.start = () => { node.started = true; }; node.stop = () => { node.stopped = true; queueMicrotask(() => node.onended?.()); };
      this.sources.push(node); return node;
    }
    createMediaStreamSource(stream) { const node = new Node(); node.stream = stream; this.microphoneSources.push(node); return node; }
    async resume() {}
    async close() {}
    constructor() { context = this; }
  }
  class Output {
    playCount = 0;
    paused = true;
    sinkId = '';
    listeners = new Map();
    async setSinkId(id) { if (id === 'missing') throw new Error('Output device unavailable'); await options.beforeSetSink?.(id); this.sinkId = id; }
    async play() { await options.beforePlay?.(this); this.playCount++; this.paused = false; }
    pause() { this.paused = true; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    emit(name) { this.listeners.get(name)?.(); }
    constructor() { outputs.push(this); }
  }
  const descriptors = Object.fromEntries(['AudioContext', 'Audio', 'window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const globals = {
    AudioContext: Context, Audio: Output,
    window: { clipify: { readAudio: options.readAudio ?? (async () => new Uint8Array([1, 2, 3])) } },
    navigator: { mediaDevices: { getUserMedia: async constraints => {
      assert.equal(constraints.video, false);
      const track = { stopped: false, stop() { this.stopped = true; } };
      const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
      streams.push(stream); return stream;
    } } },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const engine = new AudioEngine();
  t.after(async () => {
    await engine.dispose();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { engine, context, outputs, streams };
}

test('clips feed both buses; microphone has no path into the speaker monitor', async t => {
  const { engine, context, outputs } = await fixture(t);
  const [bus, monitorGain, cableGain, micGain] = context.gains;
  assert.ok(bus.connections.includes(monitorGain));
  assert.ok(bus.connections.includes(cableGain));
  assert.deepEqual(micGain.connections, [context.compressor]);
  assert.ok(!micGain.connections.includes(monitorGain));
  assert.deepEqual(monitorGain.connections, [context.destinations[0]]);
  assert.equal(outputs[0].srcObject, context.destinations[0].stream);
  assert.equal(outputs[1].srcObject, context.destinations[1].stream);
  await engine.configure({ ...defaults, cableEnabled: true });
  await engine.play(clip('first'));
  assert.equal(outputs[0].sinkId, 'speakers');
  assert.equal(outputs[1].sinkId, 'virtual-cable');
  assert.equal(outputs[0].playCount, 1);
  assert.equal(outputs[1].playCount, 1);
});

test('voice capture is opt-in, physical-device-specific, and stopped with the cable', async t => {
  const { engine, context, streams, outputs } = await fixture(t);
  await engine.configure(defaults);
  assert.equal(streams.length, 0);
  await assert.rejects(engine.startMicrophone(), /Enable a virtual cable/);
  await engine.configure({ ...defaults, cableEnabled: true });
  await engine.startMicrophone();
  assert.equal(engine.microphoneActive, true);
  assert.deepEqual(context.microphoneSources[0].connections, [context.gains[3]]);
  await engine.configure(defaults);
  assert.equal(engine.microphoneActive, false);
  assert.equal(streams[0].getTracks()[0].stopped, true);
  assert.equal(outputs[1].paused, true);
});

test('a missing output fails closed and stops live microphone capture', async t => {
  const { engine, outputs, streams } = await fixture(t);
  await engine.configure({ ...defaults, cableEnabled: true });
  await engine.startMicrophone();
  await assert.rejects(engine.configure({ ...defaults, cableEnabled: true, cableId: 'missing' }), /unavailable/);
  assert.equal(outputs[1].paused, true);
  assert.equal(engine.microphoneActive, false);
  assert.equal(streams[0].getTracks()[0].stopped, true);
  await assert.rejects(engine.configure({ ...defaults, cableEnabled: true, cableId: 'default' }), /Choose a virtual cable/);
  await assert.rejects(engine.configure({ ...defaults, cableEnabled: true, cableId: 'speakers' }), /different devices/);
});

test('Stop all cancels a pending decode instead of allowing late playback', async t => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { engine, context } = await fixture(t, { readAudio: async () => { await wait; return new Uint8Array([1]); } });
  await engine.configure(defaults);
  const pending = engine.play(clip('slow'));
  await tick(); engine.stopAll(); release(); await pending;
  assert.equal(context.sources.length, 0);
});

test('overlap supports concurrent decodes, per-clip stop, and stop-all cleanup', async t => {
  const { engine, context } = await fixture(t);
  let active = [];
  engine.onChange = value => { active = value; };
  await engine.configure({ ...defaults, overlap: true });
  await Promise.all([engine.play(clip('one')), engine.play(clip('two'))]);
  assert.equal(active.length, 2);
  engine.stop('one'); await tick();
  assert.deepEqual(active.map(clip => clip.id), ['two']);
  engine.stopAll(); await tick();
  assert.equal(active.length, 0);
  assert.ok(context.sources.every(source => source.stopped));
});

test('single playback replaces the current clip; a second click stops it', async t => {
  const { engine, context } = await fixture(t);
  await engine.configure(defaults);
  await engine.play(clip('one'));
  await engine.play(clip('two'));
  assert.equal(context.sources[0].stopped, true);
  assert.equal(context.sources[1].started, true);
  await engine.play(clip('two'));
  assert.equal(context.sources[1].stopped, true);
});

test('Stop all cancels a play queued behind an output-device change', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { engine, context } = await fixture(t, { beforeSetSink: id => id === 'new-speaker' ? gate : undefined });
  await engine.configure(defaults);
  const configuration = engine.configure({ ...defaults, speakerId: 'new-speaker' });
  const pending = engine.play(clip('queued'));
  await tick();
  engine.stopAll();
  release();
  await Promise.all([configuration, pending]);
  assert.equal(context.sources.length, 0);
});

test('stopping one clip also cancels it while output configuration is pending', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { engine, context } = await fixture(t, { beforeSetSink: id => id === 'new-speaker' ? gate : undefined });
  await engine.configure(defaults);
  const configuration = engine.configure({ ...defaults, speakerId: 'new-speaker' });
  const pending = engine.play(clip('queued'));
  engine.stop('queued');
  release();
  await Promise.all([configuration, pending]);
  assert.equal(context.sources.length, 0);
});

test('stopping microphone capture during output startup cannot reactivate it later', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { engine, streams, context } = await fixture(t, { beforePlay: () => gate });
  await engine.configure({ ...defaults, cableEnabled: true });
  const pending = engine.startMicrophone();
  await tick();
  assert.equal(streams.length, 1);
  engine.stopMicrophone();
  release();
  await pending;
  assert.equal(engine.microphoneActive, false);
  assert.equal(streams[0].getTracks()[0].stopped, true);
  assert.equal(context.microphoneSources.length, 0);
});

test('simultaneous microphone requests share one capture operation', async t => {
  const { engine, streams } = await fixture(t);
  await engine.configure({ ...defaults, cableEnabled: true });
  await Promise.all([engine.startMicrophone(), engine.startMicrophone()]);
  assert.equal(streams.length, 1);
  assert.equal(engine.microphoneActive, true);
});

test('a runtime cable error stops voice capture and reports the failed route', async t => {
  const { engine, outputs, streams } = await fixture(t);
  const failures = [];
  engine.onDeviceError = (message, route) => failures.push({ message, route });
  await engine.configure({ ...defaults, cableEnabled: true });
  await engine.startMicrophone();
  outputs[1].emit('error');
  assert.equal(engine.microphoneActive, false);
  assert.equal(streams[0].getTracks()[0].stopped, true);
  assert.equal(outputs[1].paused, true);
  assert.equal(failures[0].route, 'cable');
  const plays = outputs[1].playCount;
  await engine.play(clip('monitor-only'));
  assert.equal(outputs[1].playCount, plays);
});

test('muting immediately stops capture even while an output change is pending', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { engine, streams } = await fixture(t, { beforeSetSink: id => id === 'new-speaker' ? gate : undefined });
  const settings = { ...defaults, cableEnabled: true };
  await engine.configure(settings);
  await engine.startMicrophone();
  const changing = engine.configure({ ...settings, speakerId: 'new-speaker' });
  await tick();
  const muting = engine.configure({ ...settings, speakerId: 'new-speaker', microphoneEnabled: false });
  try {
    assert.equal(engine.microphoneActive, false);
    assert.equal(streams[0].getTracks()[0].stopped, true);
  } finally {
    release();
    await Promise.all([changing, muting]);
  }
  await assert.rejects(engine.startMicrophone(), /Enable voice mixing/);
  assert.equal(streams.length, 1);
});

test('muting during microphone startup cancels the pending capture', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { engine, streams, context } = await fixture(t, { beforePlay: () => gate });
  const settings = { ...defaults, cableEnabled: true };
  await engine.configure(settings);
  const pending = engine.startMicrophone();
  await tick();
  await engine.configure({ ...settings, microphoneEnabled: false });
  release();
  await pending;
  assert.equal(engine.microphoneActive, false);
  assert.equal(streams[0].getTracks()[0].stopped, true);
  assert.equal(context.microphoneSources.length, 0);
});

test('decoded cache evicts by byte budget as well as clip count', async t => {
  let decodes = 0;
  const { engine } = await fixture(t, { decodeAudio: () => {
    decodes++;
    // Metadata represents 80 MiB without allocating large test buffers.
    return { duration: 2, length: 20 * 1024 * 1024, numberOfChannels: 1 };
  } });
  await engine.configure(defaults);
  await engine.play(clip('first'));
  engine.stopAll();
  await engine.play(clip('second'));
  engine.stopAll();
  await engine.play(clip('second'));
  engine.stopAll();
  assert.equal(decodes, 2);
  await engine.play(clip('first'));
  assert.equal(decodes, 3);
});

test('a clip exceeding the cache budget can play without being retained', async t => {
  let decodes = 0;
  const { engine } = await fixture(t, { decodeAudio: () => {
    decodes++;
    return { duration: 2, length: 40 * 1024 * 1024, numberOfChannels: 1 };
  } });
  await engine.configure(defaults);
  await engine.play(clip('large'));
  engine.stopAll();
  await engine.play(clip('large'));
  assert.equal(decodes, 2);
});
