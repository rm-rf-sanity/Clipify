const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipify', {
  load: () => ipcRenderer.invoke('library:load'),
  importSounds: () => ipcRenderer.invoke('library:import'),
  updateClip: clip => ipcRenderer.invoke('library:update', clip),
  removeClip: id => ipcRenderer.invoke('library:remove', id),
  readAudio: id => ipcRenderer.invoke('audio:read', id),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  openCableGuide: () => ipcRenderer.invoke('app:cable-guide'),
  windowControl: action => ipcRenderer.invoke('window:control', action),
  onHotkey: callback => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('audio:hotkey', listener);
    return () => ipcRenderer.removeListener('audio:hotkey', listener);
  },
});
