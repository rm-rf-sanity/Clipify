import type { Settings } from '../types';

/** Restore saved outputs independently so one disconnected device cannot block the other. */
export async function restoreRouting(saved: Settings, configure: (settings: Settings) => Promise<void>) {
  let settings = { ...saved, cableEnabled: false };
  const messages: string[] = [];

  try {
    await configure(settings);
  } catch {
    settings = { ...settings, speakerId: 'default' };
    await configure(settings);
    messages.push('The saved speaker is unavailable. System default is selected; check Audio routing.');
  }

  if (saved.cableEnabled) {
    try {
      const connected = { ...settings, cableEnabled: true };
      await configure(connected);
      settings = connected;
    } catch {
      await configure(settings);
      messages.push('The saved virtual cable is unavailable. Virtual microphone routing is off; check Audio routing.');
    }
  }

  return { settings, message: messages.join(' ') };
}
