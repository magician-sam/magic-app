const path = require('node:path');
const { app, BrowserWindow, dialog, Menu, shell, session } = require('electron');
const { HOME_URL, navigationKind } = require('./navigation.cjs');

app.setAppUserModelId('com.magicbysam.desktop');

async function offerExternalLink(parent, raw) {
  if (navigationKind(raw) !== 'external') return;
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    title: 'Open external website?',
    message: 'This link opens in your usual browser.',
    detail: raw,
    buttons: ['Cancel', 'Open link'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (response === 1) await shell.openExternal(raw);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 780,
    minHeight: 580,
    title: 'Magic App',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#fffaf0',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  const contents = win.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (navigationKind(url) === 'external') void offerExternalLink(win, url);
    if (navigationKind(url) === 'app') void contents.loadURL(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const kind = navigationKind(url);
    if (kind === 'app') return;
    event.preventDefault();
    if (kind === 'external') void offerExternalLink(win, url);
  });
  contents.on('will-redirect', (event, url) => {
    if (navigationKind(url) !== 'app') event.preventDefault();
  });
  contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && !win.isDestroyed()) {
      void win.loadFile(path.join(__dirname, 'offline.html'));
    }
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(HOME_URL);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Magic App', submenu: [
      { label: 'Home', click: () => void win.loadURL(HOME_URL) },
      { label: 'Back', accelerator: 'Alt+Left', click: () => { if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); } },
      { label: 'Forward', accelerator: 'Alt+Right', click: () => { if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); } },
      { role: 'reload' },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
  ]));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
