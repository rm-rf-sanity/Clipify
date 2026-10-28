const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validateClip, validateSettings } = require('./validation.cjs');
const { createWave, STARTER_SOUNDS } = require('./synthesis.cjs');

const SUPPORTED_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm'];
const MAX_FILE_BYTES = 30 * 1024 * 1024;

class Library {
  constructor(root) {
    this.root = root;
    this.audioRoot = path.join(root, 'audio');
    this.file = path.join(root, 'library.json');
    this.state = { version: 1, clips: [], settings: validateSettings() };
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(this.audioRoot, { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (raw.version !== 1 || !Array.isArray(raw.clips)) throw new Error('Unsupported library format.');
      const ids = new Set();
      const hotkeys = new Set();
      this.state = { version: 1, settings: validateSettings(raw.settings), clips: raw.clips.map(item => {
        const clip = validateClip(item);
        if (typeof item.file !== 'string' || path.basename(item.file) !== item.file || !SUPPORTED_EXTENSIONS.includes(path.extname(item.file))) throw new Error('Invalid audio reference.');
        if (typeof item.addedAt !== 'string' || !Number.isFinite(Date.parse(item.addedAt))) throw new Error('Invalid sound creation date.');
        if (ids.has(clip.id)) throw new Error('Duplicate sound ID.');
        if (clip.hotkey && hotkeys.has(clip.hotkey)) throw new Error('Duplicate sound shortcut.');
        ids.add(clip.id);
        if (clip.hotkey) hotkeys.add(clip.hotkey);
        return { ...clip, file: item.file, addedAt: item.addedAt, source: item.source === 'starter' ? 'starter' : 'import' };
      }) };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // Preserve the existing data; do not silently replace a damaged library.
        throw new Error('Your library could not be read. The original files are preserved in ' + this.root, { cause: error });
      }
      for (const [index, sample] of STARTER_SOUNDS.entries()) {
        const id = randomUUID();
        await fs.writeFile(path.join(this.audioRoot, id + '.wav'), createWave(sample.kind, sample.duration));
        this.state.clips.push({
          ...validateClip({ ...sample, id, volume: 0.8, favorite: index < 2, hotkey: `CommandOrControl+Alt+${index + 1}` }),
          file: id + '.wav', addedAt: new Date().toISOString(), source: 'starter',
        });
      }
      await this.persist();
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone({ ...this.state, clips: this.state.clips.map(({ file, ...clip }) => clip) });
  }

  async persist(state = this.state) {
    const temporary = this.file + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporary, this.file);
  }

  mutate(update) {
    // Serialize complete transactions, not just their writes. Readers see only
    // committed state, and a failed write cannot leak into a subsequent save.
    const transaction = this.queue.then(async () => {
      const draft = structuredClone(this.state);
      const result = await update(draft);
      await this.persist(draft);
      this.state = draft;
      return { library: this.snapshot(), result };
    });
    this.queue = transaction.catch(() => {});
    return transaction;
  }

  async importFiles(paths) {
    const { library, result: errors } = await this.mutate(async draft => {
      const errors = [];
      for (const sourcePath of paths) {
        try {
          const extension = path.extname(sourcePath).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.includes(extension)) throw new Error('Unsupported audio format.');
          const stat = await fs.stat(sourcePath);
          if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES) throw new Error('Use a non-empty audio file smaller than 30 MB.');
          const id = randomUUID();
          const file = id + extension;
          await fs.copyFile(sourcePath, path.join(this.audioRoot, file));
          draft.clips.push({
            ...validateClip({ id, name: path.basename(sourcePath, path.extname(sourcePath)), category: 'Effects', volume: 0.8 }),
            file, addedAt: new Date().toISOString(), source: 'import',
          });
        } catch (error) { errors.push(`${path.basename(sourcePath)}: ${error.message}`); }
      }
      return errors;
    });
    return { library, errors };
  }

  async updateClip(input) {
    const validated = validateClip(input);
    const { library } = await this.mutate(draft => {
      const current = draft.clips.find(clip => clip.id === validated.id);
      if (!current) throw new Error('Sound not found.');
      if (validated.hotkey && draft.clips.some(clip => clip.id !== current.id && clip.hotkey === validated.hotkey)) throw new Error('That shortcut is already assigned to another sound.');
      Object.assign(current, validated);
    });
    return library;
  }

  async removeClip(id) {
    const { library } = await this.mutate(draft => {
      const clip = draft.clips.find(item => item.id === id);
      if (!clip) throw new Error('Sound not found.');
      draft.clips = draft.clips.filter(item => item.id !== id);
    });
    // Keep the private audio copy as recoverable data; never touch the original.
    return library;
  }

  async readAudio(id) {
    const clip = this.state.clips.find(item => item.id === id);
    if (!clip) throw new Error('Sound not found.');
    return new Uint8Array(await fs.readFile(path.join(this.audioRoot, clip.file)));
  }

  async saveSettings(input) {
    const settings = validateSettings(input);
    const { library } = await this.mutate(draft => { draft.settings = settings; });
    return library;
  }
}
module.exports = { Library, SUPPORTED_EXTENSIONS, MAX_FILE_BYTES };
