import type { Settings } from '../types';

type Device = Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>;
const routes = [
  ['speakerId', 'speakerLabel', 'audiooutput'],
  ['cableId', 'cableLabel', 'audiooutput'],
  ['microphoneId', 'microphoneLabel', 'audioinput'],
] as const;

// Windows can add an instance counter after a driver/device is re-enumerated.
const normalizedLabel = (label: string) => label.normalize('NFKC').toLowerCase()
  .replace(/\(\s*\d+\s*-\s*/g, '(').replace(/\s+/g, ' ').trim();

/** Recover only one matching named device; never guess another output or channel layout. */
export function reconcileDeviceIdentities(saved: Settings, devices: readonly Device[], previous?: Settings): Settings {
  const settings = { ...saved };
  for (const [idKey, labelKey, kind] of routes) {
    const id = saved[idKey];
    if (previous && previous[idKey] !== id) settings[labelKey] = '';
    if (!id || id === 'default' || id === 'communications') {
      settings[labelKey] = '';
      continue;
    }
    const candidates = devices.filter(device => device.kind === kind && device.deviceId &&
      device.deviceId !== 'default' && device.deviceId !== 'communications');
    const exact = candidates.find(device => device.deviceId === id);
    if (exact) {
      if (exact.label) settings[labelKey] = exact.label;
      continue;
    }
    const label = settings[labelKey];
    if (!label) continue;
    const normalized = normalizedLabel(label);
    if (!normalized) continue;
    const matches = candidates.filter(device => device.label && normalizedLabel(device.label) === normalized);
    if (matches.length !== 1) continue;
    settings[idKey] = matches[0].deviceId;
    settings[labelKey] = matches[0].label;
  }
  return settings;
}
