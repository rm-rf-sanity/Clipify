import type { Settings } from '../types';

interface MicrophoneEngine {
  readonly microphoneActive: boolean;
  startMicrophone(): Promise<void>;
  stopMicrophone(): void;
}

/** Apply the remembered voice preference only when a cable route is available. */
export async function syncMicrophone(settings: Settings, engine: MicrophoneEngine) {
  if (!settings.microphoneEnabled || !settings.cableEnabled) {
    engine.stopMicrophone();
    return false;
  }
  if (!engine.microphoneActive) await engine.startMicrophone();
  return engine.microphoneActive;
}
