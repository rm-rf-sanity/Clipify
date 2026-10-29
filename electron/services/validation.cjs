const COLORS = ['violet', 'peach', 'mint', 'blue', 'pink', 'yellow'];
const CATEGORIES = ['Essentials', 'Reactions', 'Music', 'Effects'];
const DEFAULT_SETTINGS = Object.freeze({
  speakerId: 'default', cableId: '', microphoneId: 'default',
  speakerLabel: '', cableLabel: '', microphoneLabel: '',
  speakerVolume: 0.75, cableVolume: 0.75, microphoneVolume: 0.8,
  monitorEnabled: true, cableEnabled: false, microphoneEnabled: true, overlap: false,
});

function bounded(value, fallback = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function validateClip(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.id)) throw new Error('Invalid clip ID.');
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!name) throw new Error('A sound needs a name.');
  const hotkey = typeof input.hotkey === 'string' ? input.hotkey : '';
  if (hotkey && !/^CommandOrControl\+Alt\+([1-9]|[A-Z])$/.test(hotkey)) throw new Error('Choose Ctrl + Alt with a letter or number.');
  return {
    id: input.id, name, color: COLORS.includes(input.color) ? input.color : 'violet',
    category: CATEGORIES.includes(input.category) ? input.category : 'Effects',
    favorite: input.favorite === true, loop: input.loop === true,
    volume: bounded(input.volume), hotkey,
    duration: typeof input.duration === 'number' && Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0,
  };
}

function validateSettings(input = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of ['speakerId', 'cableId', 'microphoneId', 'speakerLabel', 'cableLabel', 'microphoneLabel']) {
    if (typeof input[key] === 'string' && input[key].length <= 512) settings[key] = input[key];
  }
  for (const key of ['speakerVolume', 'cableVolume', 'microphoneVolume']) settings[key] = bounded(input[key], settings[key]);
  for (const key of ['monitorEnabled', 'cableEnabled', 'microphoneEnabled', 'overlap']) {
    if (typeof input[key] === 'boolean') settings[key] = input[key];
  }
  // Never route to the system default by accident when a virtual output is missing.
  if (!settings.cableId || settings.cableId === 'default' || settings.cableId === 'communications') settings.cableEnabled = false;
  return settings;
}
module.exports = { COLORS, CATEGORIES, DEFAULT_SETTINGS, validateClip, validateSettings };
