const { app, BrowserWindow, ipcMain, dialog, protocol, net, session, globalShortcut, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Library } = require('./services/library.cjs');

const testRoot = process.env.CLIPIFY_TEST_DATA;
const useTestProfile = testRoot && (!app.isPackaged || process.argv.includes('--clipify-test-profile'));
app.setName('Clipify');
app.setPath('userData', useTestProfile ? path.resolve(testRoot) : path.join(app.getPath('appData'), 'Clipify'));
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
const devUrl = !app.isPackaged && process.env.CLIPIFY_DEV_URL === 'http://127.0.0.1:5173' ? process.env.CLIPIFY_DEV_URL : null;
protocol.registerSchemesAsPrivileged([{ scheme: 'clipify', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window;
let library;
let unavailableShortcuts = [];
const isTrusted = url => devUrl ? url.startsWith(devUrl + '/') : url.startsWith('clipify://app/');

function registerHotkeys() {
  globalShortcut.unregisterAll();
  unavailableShortcuts = [];
  const mappings = [['CommandOrControl+Alt+Space', '__stop__'], ...library.state.clips.filter(c => c.hotkey).map(c => [c.hotkey, c.id])];
  for (const [accelerator, id] of mappings) {
    if (!globalShortcut.register(accelerator, () => window?.webContents.send('audio:hotkey', id))) unavailableShortcuts.push(accelerator);
  }
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== window?.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isTrusted(event.senderFrame.url)) throw new Error('Untrusted request.');
    return handler(...args);
  });
}

app.whenReady().then(async () => {
  protocol.handle('clipify', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
    const root = path.resolve(__dirname, '../dist');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted = contents === window?.webContents && isTrusted(contents.getURL()) && details.isMainFrame;
    callback(Boolean(trusted && (permission === 'speaker-selection' || (permission === 'media' && details.mediaTypes?.length > 0 && details.mediaTypes.every(type => type === 'audio')))));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === window?.webContents && isTrusted(contents.getURL()) && details.isMainFrame &&
    (permission === 'speaker-selection' || (permission === 'media' && details.mediaType === 'audio')));
  library = new Library(app.getPath('userData'));
  await library.initialize();
  handle('library:load', () => ({ ...library.snapshot(), unavailableShortcuts }));
  handle('library:import', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Add sounds to Clipify', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'webm'] }],
    });
    return result.canceled ? { library: library.snapshot(), errors: [] } : library.importFiles(result.filePaths);
  });
  handle('library:update', async input => { const result = await library.updateClip(input); registerHotkeys(); return { ...result, unavailableShortcuts }; });
  handle('library:remove', async id => { const result = await library.removeClip(id); registerHotkeys(); return { ...result, unavailableShortcuts }; });
  handle('audio:read', id => library.readAudio(id));
  handle('settings:save', settings => library.saveSettings(settings));
  handle('app:cable-guide', () => shell.openExternal('https://vb-audio.com/Cable/'));
  handle('window:control', action => {
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
  });
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1080, minHeight: 740,
    title: 'Clipify', frame: false, backgroundColor: '#111214', show: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isTrusted(url)) event.preventDefault(); });
  window.once('ready-to-show', () => window.show());
  registerHotkeys();
  await window.loadURL(devUrl ?? 'clipify://app/index.html');
}).catch(error => { dialog.showErrorBox('Clipify could not start', error.message); app.quit(); });

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
