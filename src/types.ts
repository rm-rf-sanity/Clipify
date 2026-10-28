export type Color = 'violet' | 'peach' | 'mint' | 'blue' | 'pink' | 'yellow';
export type Category = 'Essentials' | 'Reactions' | 'Music' | 'Effects';
export interface Clip {
  id: string;
  name: string;
  color: Color;
  category: Category;
  favorite: boolean;
  loop: boolean;
  volume: number;
  hotkey: string;
  duration: number;
  source: 'starter' | 'import';
  addedAt: string;
}
export interface Settings {
  speakerId: string;
  cableId: string;
  microphoneId: string;
  microphoneEnabled: boolean;
  speakerVolume: number;
  cableVolume: number;
  microphoneVolume: number;
  monitorEnabled: boolean;
  cableEnabled: boolean;
  overlap: boolean;
}
export interface LibraryState {
  version: number;
  clips: Clip[];
  settings: Settings;
  unavailableShortcuts?: string[];
}
export interface DesktopApi {
  load(): Promise<LibraryState>;
  importSounds(): Promise<{ library: LibraryState; errors: string[] }>;
  updateClip(clip: Clip): Promise<LibraryState>;
  removeClip(id: string): Promise<LibraryState>;
  readAudio(id: string): Promise<Uint8Array>;
  saveSettings(settings: Settings): Promise<LibraryState>;
  openCableGuide(): Promise<void>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  onHotkey(callback: (id: string) => void): () => void;
}
declare global { interface Window { clipify: DesktopApi } }
export const COLORS: Color[] = ['violet', 'peach', 'mint', 'blue', 'pink', 'yellow'];
export const CATEGORIES: Category[] = ['Essentials', 'Reactions', 'Music', 'Effects'];
export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export const formatHotkey = (key: string) => key.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
