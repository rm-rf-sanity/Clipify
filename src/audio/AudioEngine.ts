import type { Clip, Settings } from '../types';

export interface ActiveClip { id: string; startedAt: number; duration: number; loop: boolean }
export interface ClipAnalysis { duration: number; peaks: number[] }
type Voice = { source: AudioBufferSourceNode; gain: GainNode; info: ActiveClip };
const MAX_CACHED_BYTES = 128 * 1024 * 1024;
const decodedBytes = (buffer: AudioBuffer) => buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;

/** One clock and source per clip, feeding independent monitor and virtual-cable buses. */
export class AudioEngine {
  private context = new AudioContext({ latencyHint: 'interactive' });
  private clipBus = this.context.createGain();
  private monitorGain = this.context.createGain();
  private cableGain = this.context.createGain();
  private micGain = this.context.createGain();
  private monitorDestination = this.context.createMediaStreamDestination();
  private cableDestination = this.context.createMediaStreamDestination();
  private limiter = this.context.createDynamicsCompressor();
  private analyser = this.context.createAnalyser();
  private monitor = new Audio();
  private cable = new Audio();
  private buffers = new Map<string, AudioBuffer>();
  private cachedBytes = 0;
  private pendingBuffers = new Map<string, Promise<AudioBuffer>>();
  private voices = new Map<string, Voice>();
  private pendingPlays = new Map<string, symbol>();
  private microphone?: MediaStream;
  private microphoneSource?: MediaStreamAudioSourceNode;
  private microphoneGeneration = 0;
  private microphoneRequest?: symbol;
  private settings?: Settings;
  private configuration: Promise<void> = Promise.resolve();
  private generation = 0;
  private closing = false;
  onChange: (active: ActiveClip[]) => void = () => {};
  onMicrophoneEnded: () => void = () => {};
  onDeviceError: (message: string, route: 'monitor' | 'cable') => void = () => {};

  constructor() {
    this.monitor.srcObject = this.monitorDestination.stream;
    this.cable.srcObject = this.cableDestination.stream;
    this.clipBus.connect(this.monitorGain).connect(this.monitorDestination);
    this.clipBus.connect(this.cableGain).connect(this.limiter);
    this.micGain.connect(this.limiter);
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.limiter.connect(this.cableDestination);
    this.clipBus.connect(this.analyser);
    this.analyser.fftSize = 256;
    for (const output of [this.monitor, this.cable]) {
      output.addEventListener('error', () => {
        output.pause();
        const route = output === this.cable ? 'cable' : 'monitor';
        if (route === 'cable') this.stopMicrophone();
        if (this.settings) this.settings = { ...this.settings, [route === 'cable' ? 'cableEnabled' : 'monitorEnabled']: false };
        this.onDeviceError('An audio output became unavailable. Check your devices in Audio routing.', route);
      });
    }
  }

  get currentTime() { return this.context.currentTime; }
  get microphoneActive() { return Boolean(this.microphone); }

  configure(settings: Settings): Promise<void> {
    // Muting must not wait for an output change or a settings write to finish.
    if (!settings.microphoneEnabled || !settings.cableEnabled) this.stopMicrophone();
    const apply = async () => {
      if (this.closing) return;
      const previous = this.settings;
      if (!settings.microphoneEnabled || !settings.cableEnabled || settings.cableId !== previous?.cableId || settings.microphoneId !== previous?.microphoneId) this.stopMicrophone();
      if (settings.cableEnabled && (!settings.cableId || ['default', 'communications'].includes(settings.cableId))) throw new Error('Choose a virtual cable output first.');
      if (settings.cableEnabled && settings.speakerId === settings.cableId) throw new Error('Select different devices for speakers and the virtual cable.');
      try {
        if (!previous || previous.speakerId !== settings.speakerId) await this.monitor.setSinkId(settings.speakerId === 'default' ? '' : settings.speakerId);
        if (settings.cableEnabled && (!previous?.cableEnabled || previous.cableId !== settings.cableId)) {
          this.cable.pause();
          await this.cable.setSinkId(settings.cableId);
        }
        this.monitorGain.gain.setTargetAtTime(settings.monitorEnabled ? settings.speakerVolume : 0, this.context.currentTime, 0.015);
        this.cableGain.gain.setTargetAtTime(settings.cableEnabled ? settings.cableVolume : 0, this.context.currentTime, 0.015);
        this.micGain.gain.setTargetAtTime(settings.microphoneVolume, this.context.currentTime, 0.015);
        if (!settings.cableEnabled) this.cable.pause();
        if (!settings.monitorEnabled) this.monitor.pause();
        this.settings = { ...settings };
        if (this.voices.size || this.microphone) await this.startOutputs();
      } catch (error) {
        // Fail closed: a missing cable must never fall back to the speakers.
        this.cable.pause();
        this.stopMicrophone();
        if (previous) {
          this.settings = { ...previous, cableEnabled: false };
          await this.monitor.setSinkId(previous.speakerId === 'default' ? '' : previous.speakerId).catch(() => this.monitor.pause());
          this.monitorGain.gain.value = previous.monitorEnabled ? previous.speakerVolume : 0;
        }
        throw error;
      }
    };
    const result = this.configuration.then(apply);
    this.configuration = result.catch(() => {});
    return result;
  }

  private async startOutputs() {
    await this.context.resume();
    if (this.settings?.monitorEnabled) await this.monitor.play();
    if (this.settings?.cableEnabled) await this.cable.play();
  }

  private async buffer(id: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(id);
    if (cached) { this.buffers.delete(id); this.buffers.set(id, cached); return cached; }
    const pending = this.pendingBuffers.get(id);
    if (pending) return pending;
    const load = (async () => {
      const bytes = await window.clipify.readAudio(id);
      const buffer = await this.context.decodeAudioData(new Uint8Array(bytes).buffer);
      if (buffer.duration > 300) throw new Error('This sound is longer than 5 minutes. Trim it before importing.');
      const bytesUsed = decodedBytes(buffer);
      if (!this.closing && bytesUsed <= MAX_CACHED_BYTES) {
        while (this.buffers.size >= 12 || this.cachedBytes + bytesUsed > MAX_CACHED_BYTES) {
          const oldest = this.buffers.keys().next().value!;
          this.cachedBytes -= decodedBytes(this.buffers.get(oldest)!);
          this.buffers.delete(oldest);
        }
        this.buffers.set(id, buffer);
        this.cachedBytes += bytesUsed;
      }
      return buffer;
    })();
    this.pendingBuffers.set(id, load);
    try { return await load; } finally { this.pendingBuffers.delete(id); }
  }

  async analyse(id: string): Promise<ClipAnalysis> {
    const buffer = await this.buffer(id);
    const channel = buffer.getChannelData(0);
    const peaks = Array.from({ length: 44 }, (_, i) => {
      const from = Math.floor(i * channel.length / 44);
      const to = Math.floor((i + 1) * channel.length / 44);
      let peak = 0;
      for (let j = from; j < to; j += 16) peak = Math.max(peak, Math.abs(channel[j]));
      return peak;
    });
    const maximum = Math.max(0.01, ...peaks);
    return { duration: buffer.duration, peaks: peaks.map(peak => Math.max(0.06, peak / maximum)) };
  }

  async play(clip: Clip) {
    if (this.closing) return;
    if (this.voices.has(clip.id)) { this.stop(clip.id); return; }
    if (this.pendingPlays.has(clip.id)) { this.pendingPlays.delete(clip.id); return; }
    const generation = this.settings?.overlap ? this.generation : ++this.generation;
    const request = Symbol(clip.id);
    this.pendingPlays.set(clip.id, request);
    try {
      await this.configuration;
      if (generation !== this.generation || this.closing || this.pendingPlays.get(clip.id) !== request) return;
      if (!this.settings?.monitorEnabled && !this.settings?.cableEnabled) throw new Error('Enable a speaker or virtual cable output in Audio routing.');
      const buffer = await this.buffer(clip.id);
      if (generation !== this.generation || this.closing || this.pendingPlays.get(clip.id) !== request) return;
      await this.startOutputs();
      if (generation !== this.generation || this.closing || this.pendingPlays.get(clip.id) !== request) return;
      if (!this.settings?.overlap) this.stopVoices();
      if (this.voices.size >= 16) throw new Error('Up to 16 sounds can play at once.');
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = clip.loop;
      gain.gain.value = clip.volume;
      source.connect(gain).connect(this.clipBus);
      const info = { id: clip.id, startedAt: this.context.currentTime, duration: buffer.duration, loop: clip.loop };
      const voice = { source, gain, info };
      this.voices.set(clip.id, voice);
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (this.voices.get(clip.id) === voice) this.voices.delete(clip.id);
        this.emit();
      };
      source.start();
      this.emit();
    } finally { if (this.pendingPlays.get(clip.id) === request) this.pendingPlays.delete(clip.id); }
  }

  updateClip(clip: Clip) {
    const voice = this.voices.get(clip.id);
    if (!voice) return;
    voice.source.loop = clip.loop;
    voice.info.loop = clip.loop;
    voice.gain.gain.setTargetAtTime(clip.volume, this.context.currentTime, 0.015);
    this.emit();
  }

  stop(id: string) {
    this.pendingPlays.delete(id);
    const voice = this.voices.get(id);
    if (voice) { voice.source.stop(); this.voices.delete(id); this.emit(); }
  }
  private stopVoices() { for (const voice of this.voices.values()) voice.source.stop(); this.voices.clear(); this.emit(); }
  stopAll() { ++this.generation; this.pendingPlays.clear(); this.stopVoices(); }
  private emit() { this.onChange([...this.voices.values()].map(voice => ({ ...voice.info }))); }

  async startMicrophone() {
    if (this.microphone || this.microphoneRequest || this.closing) return;
    const generation = this.microphoneGeneration;
    const request = Symbol('microphone');
    this.microphoneRequest = request;
    let stream: MediaStream | undefined;
    try {
      await this.configuration;
      if (this.closing || generation !== this.microphoneGeneration) return;
      if (!this.settings?.cableEnabled || !this.settings.cableId) throw new Error('Enable a virtual cable output before connecting your microphone.');
      if (!this.settings.microphoneEnabled) throw new Error('Enable voice mixing before connecting your microphone.');
      const selected = { ...this.settings };
      const valid = () => !this.closing && generation === this.microphoneGeneration && this.settings?.microphoneEnabled && this.settings.cableEnabled && this.settings.cableId === selected.cableId && this.settings.microphoneId === selected.microphoneId;
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: selected.microphoneId === 'default' ? undefined : { exact: selected.microphoneId },
        echoCancellation: true, noiseSuppression: true, autoGainControl: false,
      }, video: false });
      if (!valid()) return;
      await this.startOutputs();
      if (!valid()) return;
      this.microphone = stream;
      this.microphoneSource = this.context.createMediaStreamSource(stream);
      this.microphoneSource.connect(this.micGain);
      stream.getAudioTracks()[0].onended = () => this.stopMicrophone();
    } finally {
      if (stream && this.microphone !== stream) stream.getTracks().forEach(track => track.stop());
      if (this.microphoneRequest === request) this.microphoneRequest = undefined;
    }
  }

  stopMicrophone() {
    ++this.microphoneGeneration;
    this.microphoneRequest = undefined;
    this.microphoneSource?.disconnect(); this.microphoneSource = undefined;
    this.microphone?.getTracks().forEach(track => track.stop()); this.microphone = undefined;
    this.onMicrophoneEnded();
  }

  getLevel() {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return Math.min(1, Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length) * 3);
  }

  async dispose() {
    this.closing = true; this.stopAll(); this.stopMicrophone();
    this.monitor.pause(); this.cable.pause();
    this.monitor.srcObject = null; this.cable.srcObject = null;
    this.buffers.clear(); this.cachedBytes = 0; await this.context.close();
  }
}
