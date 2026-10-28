const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  screen,
  nativeImage,
  shell
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { SpotifyApiManager, REDIRECT_URI } = require('./spotify-api');

let mainWindow = null;
let tray = null;
let psProcess = null;
let psCallbacks = [];
let pollInterval = null;
let keyPollInterval = null;
let isExpanded = false;
let isGhostMode = false;
let isOverlayHidden = false;

let recordingShortcutKey = null;
let lastDetectedCombo = '';
let lastActionTriggerTime = 0;

const COMPACT_WIDTH = 430;
const COMPACT_HEIGHT = 180;
const EXPANDED_WIDTH = 430;
const EXPANDED_HEIGHT = 570;

const getConfigPath = () => path.join(app.getPath('userData'), 'spotifly-config.json');

const DEFAULT_SHORTCUTS = {
  toggleOverlay: 'Alt+Space',
  playPause: 'Alt+P',
  nextTrack: 'Alt+Right',
  prevTrack: 'Alt+Left',
  toggleGhost: 'Alt+G',
  likeTrack: 'Alt+L'
};

function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        spotify: parsed.spotify || {},
        localLikes: parsed.localLikes || [],
        opacity: parsed.opacity ?? 0.96,
        shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts || {}) }
      };
    }
  } catch {}
  return {
    spotify: {},
    localLikes: [],
    opacity: 0.96,
    shortcuts: { ...DEFAULT_SHORTCUTS }
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}

let appConfig = null;
let spotifyManager = null;
let lastMergedStatus = {
  connected: false,
  title: 'Spotify Bekleniyor...',
  artist: 'Bir şarkı başlatın',
  album: '',
  isPlaying: false,
  shuffle: false,
  repeat: 'off',
  positionMs: 0,
  durationMs: 0,
  volume: 100,
  thumbnail: '',
  isLiked: false,
  apiConnected: false
};
let apiSyncCounter = 0;
let cachedApiData = null;

function startMediaBridge() {
  const scriptPath = path.join(__dirname, 'win-media-bridge.ps1');
  psProcess = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true
    }
  );

  const rl = readline.createInterface({ input: psProcess.stdout });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return;
    try {
      const data = JSON.parse(trimmed);
      const cb = psCallbacks.shift();
      if (cb) cb(data);
    } catch {}
  });

  psProcess.on('exit', () => {
    psProcess = null;
    psCallbacks = [];
    setTimeout(() => {
      if (!app.isQuitting) startMediaBridge();
    }, 1000);
  });
}

function sendBridgeCommand(cmdObj) {
  return new Promise((resolve) => {
    if (!psProcess || !psProcess.stdin.writable) {
      resolve(lastMergedStatus);
      return;
    }
    const timer = setTimeout(() => {
      const idx = psCallbacks.indexOf(handler);
      if (idx !== -1) psCallbacks.splice(idx, 1);
      resolve(lastMergedStatus);
    }, 1800);

    const handler = (res) => {
      clearTimeout(timer);
      resolve(res);
    };

    psCallbacks.push(handler);
    psProcess.stdin.write(JSON.stringify(cmdObj) + '\n');
  });
}

function getWindowHwndString() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    const buf = mainWindow.getNativeWindowHandle();
    if (buf.length === 8) {
      return buf.readBigInt64LE(0).toString();
    }
    return buf.readInt32LE(0).toString();
  } catch {
    return null;
  }
}

async function applyWin32NoActivate(noActivate = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const hwnd = getWindowHwndString();
    if (hwnd) {
      await sendBridgeCommand({ action: 'noactivate', hwnd, state: Boolean(noActivate) });
    }
  } catch {}
}

function isTrackLikedLocally(title, artist) {
  if (!title) return false;
  const key = `${title}|||${artist}`.toLowerCase();
  return (appConfig.localLikes || []).some((item) => item.key === key);
}

function toggleLocalLike(statusObj) {
  const title = statusObj.title || 'Bilinmeyen Şarkı';
  const artist = statusObj.artist || 'Spotify';
  const key = `${title}|||${artist}`.toLowerCase();
  const list = appConfig.localLikes || [];
  const existsIdx = list.findIndex((i) => i.key === key);
  let isLiked = false;
  if (existsIdx >= 0) {
    list.splice(existsIdx, 1);
    isLiked = false;
  } else {
    list.unshift({
      key,
      id: statusObj.trackId || key,
      uri: statusObj.uri || `spotify:search:${encodeURIComponent(`${title} ${artist}`)}`,
      title,
      artist,
      album: statusObj.album || '',
      durationMs: statusObj.durationMs || 0,
      image: statusObj.thumbnail || ''
    });
    isLiked = true;
  }
  appConfig.localLikes = list;
  saveConfig(appConfig);
  return { isLiked };
}

const artworkCache = new Map();

async function fetchArtworkFallback(title, artist) {
  if (!title || title === 'Spotify Bekleniyor...' || title === 'Bağlantı Bekleniyor') return '';
  const key = `${title}|${artist}`.toLowerCase();
  if (artworkCache.has(key)) return artworkCache.get(key);
  try {
    const q = encodeURIComponent(`${title} ${artist || ''}`.trim());
    const resp = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
    const data = await resp.json();
    const rawUrl = data?.results?.[0]?.artworkUrl100 || '';
    const hiRes = rawUrl ? rawUrl.replace('100x100bb', '600x600bb') : '';
    artworkCache.set(key, hiRes);
    return hiRes;
  } catch {
    return '';
  }
}

async function pollMediaStatus(forceApi = false) {
  if (isOverlayHidden) return lastMergedStatus;
  const winStatus = await sendBridgeCommand({ action: 'status' });
  const apiConnected = spotifyManager ? spotifyManager.isAuthenticated() : false;

  apiSyncCounter++;
  if (apiConnected && (forceApi || apiSyncCounter % 4 === 0 || !cachedApiData)) {
    const apiPlayback = await spotifyManager.getCurrentPlayback();
    if (apiPlayback) {
      cachedApiData = apiPlayback;
    }
  }

  const merged = {
    ...lastMergedStatus,
    ...winStatus,
    apiConnected
  };

  if (cachedApiData && apiConnected) {
    if (
      !merged.connected ||
      (cachedApiData.title &&
        merged.title &&
        cachedApiData.title.toLowerCase() === merged.title.toLowerCase())
    ) {
      merged.trackId = cachedApiData.trackId;
      merged.uri = cachedApiData.uri;
      merged.isLiked = cachedApiData.isLiked;
      merged.shuffle = cachedApiData.shuffle;
      merged.repeat = cachedApiData.repeat;
      if (!merged.thumbnail && cachedApiData.thumbnail) {
        merged.thumbnail = cachedApiData.thumbnail;
      }
      if (!merged.durationMs && cachedApiData.durationMs) {
        merged.durationMs = cachedApiData.durationMs;
        merged.positionMs = cachedApiData.positionMs;
      }
    }
  } else {
    merged.isLiked = isTrackLikedLocally(merged.title, merged.artist);
  }

  if (!merged.thumbnail && merged.connected && merged.title) {
    merged.thumbnail = await fetchArtworkFallback(merged.title, merged.artist);
  }

  lastMergedStatus = merged;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('media:update', merged);
  }
  return merged;
}

function createTrayIcon() {
  try {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVDhPY2RgYPgPxFQBjAwMDP8ZqA5GNRw1gGoG0N0A6m5gZGBgYBi0BtA0AwMDAL1fH8H63p4AAAAAAElFTkSuQmCC';
    const img = nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
    tray = new Tray(img);
    tray.setToolTip('SpotiFly Gaming Overlay');
    updateTrayMenu();
    tray.on('click', () => {
      toggleOverlayWindow();
    });
  } catch {}
}

function updateTrayMenu() {
  if (!tray) return;
  const shortcuts = appConfig?.shortcuts || DEFAULT_SHORTCUTS;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'SpotiFly Overlay Göster / Gizle (' + (shortcuts.toggleOverlay || 'Alt+Space') + ')',
      click: () => toggleOverlayWindow()
    },
    {
      label: isGhostMode ? 'Hayalet Modu (Click-Through): AÇIK' : 'Hayalet Modu (Click-Through): KAPALI',
      click: () => toggleGhostModeState()
    },
    { type: 'separator' },
    {
      label: 'Oynat / Duraklat (' + (shortcuts.playPause || 'Alt+P') + ')',
      click: () => sendBridgeCommand({ action: 'toggle' }).then(() => pollMediaStatus())
    },
    {
      label: 'Sonraki Şarkı (' + (shortcuts.nextTrack || 'Alt+Right') + ')',
      click: () => sendBridgeCommand({ action: 'next' }).then(() => pollMediaStatus())
    },
    {
      label: 'Önceki Şarkı (' + (shortcuts.prevTrack || 'Alt+Left') + ')',
      click: () => sendBridgeCommand({ action: 'prev' }).then(() => pollMediaStatus())
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

/**
 * Hides or shows the overlay via Renderer CSS alpha + Click-Through
 * without touching OS window visibility (SW_HIDE/SW_SHOW) or setOpacity(),
 * so transparent windows on Windows hide 100% cleanly and games never minimize!
 */
function setOverlayHiddenState(hidden) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isOverlayHidden = Boolean(hidden);

  if (isOverlayHidden) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(isGhostMode, { forward: true });
    pollMediaStatus(false);
  }

  mainWindow.webContents.send('window:mode-changed', {
    isExpanded,
    isGhostMode,
    isOverlayHidden
  });
}

function toggleOverlayWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isGhostMode && !isOverlayHidden) {
    setGhostModeState(false);
    return;
  }
  setOverlayHiddenState(!isOverlayHidden);
}

function setGhostModeState(enabled) {
  isGhostMode = Boolean(enabled);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isOverlayHidden) {
    isOverlayHidden = false;
  }
  if (isGhostMode) {
    if (isExpanded) {
      setWindowExpanded(false);
    }
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
  mainWindow.webContents.send('window:mode-changed', {
    isExpanded,
    isGhostMode,
    isOverlayHidden
  });
  updateTrayMenu();
}

function toggleGhostModeState() {
  setGhostModeState(!isGhostMode);
}

function setWindowExpanded(expanded) {
  isExpanded = Boolean(expanded);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setResizable(true);
  mainWindow.setSize(
    isExpanded ? EXPANDED_WIDTH : COMPACT_WIDTH,
    isExpanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT,
    false
  );
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: isExpanded ? EXPANDED_WIDTH : COMPACT_WIDTH,
    height: isExpanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT
  });
  mainWindow.setResizable(false);
  mainWindow.webContents.send('window:mode-changed', {
    isExpanded,
    isGhostMode,
    isOverlayHidden
  });
}

async function executeShortcutAction(actionName) {
  const now = Date.now();
  if (now - lastActionTriggerTime < 320) return;
  lastActionTriggerTime = now;

  switch (actionName) {
    case 'toggleOverlay':
      toggleOverlayWindow();
      break;
    case 'playPause':
      await sendBridgeCommand({ action: 'toggle' });
      await pollMediaStatus();
      if (mainWindow && !isOverlayHidden) {
        mainWindow.webContents.send('shortcut:toast', 'Oynat / Duraklat');
      }
      break;
    case 'nextTrack':
      await sendBridgeCommand({ action: 'next' });
      await pollMediaStatus();
      if (mainWindow && !isOverlayHidden) {
        mainWindow.webContents.send('shortcut:toast', 'Sonraki Şarkı ⏭');
      }
      break;
    case 'prevTrack':
      await sendBridgeCommand({ action: 'prev' });
      await pollMediaStatus();
      if (mainWindow && !isOverlayHidden) {
        mainWindow.webContents.send('shortcut:toast', 'Önceki Şarkı ⏮');
      }
      break;
    case 'toggleGhost':
      toggleGhostModeState();
      if (mainWindow && !isOverlayHidden) {
        mainWindow.webContents.send(
          'shortcut:toast',
          isGhostMode ? 'Hayalet HUD: AÇIK (Tıklamalar Oyuna Geçer)' : 'Etkileşimli Mod: AÇIK'
        );
      }
      break;
    case 'likeTrack':
      await handleToggleLike({});
      if (mainWindow && !isOverlayHidden) {
        mainWindow.webContents.send(
          'shortcut:toast',
          lastMergedStatus.isLiked ? 'Beğenilenlere Eklendi ♥' : 'Beğenilenlerden Çıkarıldı'
        );
      }
      break;
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  if (recordingShortcutKey) return;

  const sc = appConfig.shortcuts || DEFAULT_SHORTCUTS;

  const safeRegister = (accel, actionName) => {
    if (!accel || typeof accel !== 'string') return false;
    try {
      return globalShortcut.register(accel.trim(), () => {
        executeShortcutAction(actionName);
      });
    } catch {
      return false;
    }
  };

  safeRegister(sc.toggleOverlay, 'toggleOverlay');
  safeRegister(sc.playPause, 'playPause');
  safeRegister(sc.nextTrack, 'nextTrack');
  safeRegister(sc.prevTrack, 'prevTrack');
  safeRegister(sc.toggleGhost, 'toggleGhost');
  safeRegister(sc.likeTrack, 'likeTrack');
}

let isPollingKeys = false;
async function pollHardwareKeys() {
  if (isPollingKeys || !psProcess) return;
  isPollingKeys = true;
  try {
    const res = await sendBridgeCommand({ action: 'keypoll' });
    const combo = (res && typeof res.combo === 'string') ? res.combo.trim() : '';

    if (!combo) {
      lastDetectedCombo = '';
      isPollingKeys = false;
      return;
    }

    if (combo === lastDetectedCombo) {
      isPollingKeys = false;
      return;
    }
    lastDetectedCombo = combo;

    // 1. If waiting for the user to record a new shortcut key in Settings:
    if (recordingShortcutKey) {
      const targetKey = recordingShortcutKey;
      recordingShortcutKey = null;

      if (combo === 'Escape') {
        registerShortcuts();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut:recorded', { cancelled: true });
        }
      } else {
        appConfig.shortcuts = {
          ...DEFAULT_SHORTCUTS,
          ...appConfig.shortcuts,
          [targetKey]: combo
        };
        saveConfig(appConfig);
        registerShortcuts();
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut:recorded', {
            cancelled: false,
            key: targetKey,
            combo,
            shortcuts: appConfig.shortcuts
          });
        }
      }
      isPollingKeys = false;
      return;
    }

    // 2. Otherwise check if pressed hardware combo matches any configured shortcut
    const sc = appConfig.shortcuts || DEFAULT_SHORTCUTS;
    const norm = combo.toLowerCase();
    for (const [actionName, configuredCombo] of Object.entries(sc)) {
      if (configuredCombo && configuredCombo.trim().toLowerCase() === norm) {
        await executeShortcutAction(actionName);
        break;
      }
    }
  } catch {}
  isPollingKeys = false;
}

async function handleToggleLike(payload = {}) {
  if (spotifyManager && spotifyManager.isAuthenticated()) {
    try {
      const res = await spotifyManager.toggleLike(
        payload.trackId || lastMergedStatus.trackId,
        payload.isLiked ?? lastMergedStatus.isLiked
      );
      lastMergedStatus.isLiked = res.isLiked;
      if (cachedApiData) cachedApiData.isLiked = res.isLiked;
      if (mainWindow) mainWindow.webContents.send('media:update', lastMergedStatus);
      return res;
    } catch {}
  }
  const res = toggleLocalLike(lastMergedStatus);
  lastMergedStatus.isLiked = res.isLiked;
  if (mainWindow) mainWindow.webContents.send('media:update', lastMergedStatus);
  return res;
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    x: screenW - COMPACT_WIDTH - 24,
    y: 24,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.once('ready-to-show', async () => {
    await applyWin32NoActivate(true);
    mainWindow.showInactive();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  appConfig = loadConfig();
  spotifyManager = new SpotifyApiManager(
    () => appConfig.spotify,
    (newSpotifyCfg) => {
      appConfig.spotify = newSpotifyCfg;
      saveConfig(appConfig);
    },
    () => {
      pollMediaStatus(true);
    }
  );

  startMediaBridge();
  createWindow();
  createTrayIcon();
  registerShortcuts();

  pollInterval = setInterval(() => {
    pollMediaStatus(false);
  }, 1000);

  keyPollInterval = setInterval(() => {
    pollHardwareKeys();
  }, 75);
});

// IPC Handlers
ipcMain.handle('media:status', async () => {
  return await pollMediaStatus(false);
});

ipcMain.handle('media:command', async (_event, payload) => {
  const { action } = payload;

  if (spotifyManager && spotifyManager.isAuthenticated()) {
    try {
      if (action === 'shuffle') {
        await spotifyManager.apiRequest(`/me/player/shuffle?state=${Boolean(payload.state)}`, {
          method: 'PUT'
        });
      } else if (action === 'repeat') {
        await spotifyManager.apiRequest(`/me/player/repeat?state=${payload.mode || 'off'}`, {
          method: 'PUT'
        });
      }
    } catch {}
  }

  await sendBridgeCommand(payload);
  return await pollMediaStatus(action === 'shuffle' || action === 'repeat');
});

ipcMain.handle('spotify:get-config', () => {
  return {
    clientId: appConfig.spotify?.clientId || '',
    redirectUri: REDIRECT_URI,
    isAuthenticated: spotifyManager.isAuthenticated(),
    shortcuts: appConfig.shortcuts || DEFAULT_SHORTCUTS,
    opacity: appConfig.opacity || 0.96,
    isGhostMode,
    isExpanded,
    isOverlayHidden
  };
});

ipcMain.handle('spotify:connect', async (_event, clientId) => {
  const res = await spotifyManager.startAuthFlow(clientId);
  await pollMediaStatus(true);
  return res;
});

ipcMain.handle('spotify:disconnect', async () => {
  spotifyManager.logout();
  cachedApiData = null;
  await pollMediaStatus(false);
  return { ok: true };
});

ipcMain.handle('spotify:playlists', async () => {
  if (!spotifyManager.isAuthenticated()) {
    return {
      apiConnected: false,
      playlists: [
        {
          id: 'local-likes',
          uri: 'local:likes',
          name: 'Beğenilen Şarkılar (Widget)',
          tracksCount: (appConfig.localLikes || []).length,
          image: '',
          owner: 'Yerel Kütüphane'
        }
      ]
    };
  }
  const playlists = await spotifyManager.getPlaylists();
  return {
    apiConnected: true,
    playlists: [
      {
        id: 'spotify-liked',
        uri: 'spotify:collection:tracks',
        name: 'Beğenilen Şarkılar ♥',
        tracksCount: 'Spotify',
        image: '',
        owner: 'Kütüphanem'
      },
      ...playlists
    ]
  };
});

ipcMain.handle('spotify:playlist-tracks', async (_event, playlistId) => {
  if (playlistId === 'local-likes') {
    return appConfig.localLikes || [];
  }
  if (playlistId === 'spotify-liked') {
    return await spotifyManager.getLikedTracks();
  }
  return await spotifyManager.getPlaylistTracks(playlistId);
});

ipcMain.handle('spotify:liked-tracks', async () => {
  if (spotifyManager.isAuthenticated()) {
    return await spotifyManager.getLikedTracks();
  }
  return appConfig.localLikes || [];
});

ipcMain.handle('spotify:queue', async () => {
  if (!spotifyManager.isAuthenticated()) {
    return {
      apiConnected: false,
      current: {
        title: lastMergedStatus.title,
        artist: lastMergedStatus.artist,
        album: lastMergedStatus.album,
        image: lastMergedStatus.thumbnail,
        durationMs: lastMergedStatus.durationMs
      },
      queue: []
    };
  }
  const q = await spotifyManager.getQueue();
  return { apiConnected: true, ...q };
});

ipcMain.handle('spotify:search', async (_event, query) => {
  return await spotifyManager.search(query);
});

ipcMain.handle('spotify:play-uri', async (_event, payload) => {
  const res = await spotifyManager.playUri(payload);
  setTimeout(() => pollMediaStatus(true), 600);
  return res;
});

ipcMain.handle('spotify:add-queue', async (_event, uri) => {
  if (spotifyManager.isAuthenticated()) {
    return await spotifyManager.addToQueue(uri);
  }
  throw new Error('Sıraya eklemek için Ayarlar sekmesinden Spotify Web API bağlayın.');
});

ipcMain.handle('spotify:toggle-like', async (_event, payload) => {
  return await handleToggleLike(payload);
});

ipcMain.handle('window:set-expanded', (_event, expanded) => {
  setWindowExpanded(expanded);
  return { isExpanded, isGhostMode, isOverlayHidden };
});

ipcMain.handle('settings:start-key-record', (_event, shortcutKey) => {
  recordingShortcutKey = shortcutKey;
  lastDetectedCombo = '';
  globalShortcut.unregisterAll();
  return { ok: true };
});

ipcMain.handle('settings:cancel-key-record', () => {
  recordingShortcutKey = null;
  registerShortcuts();
  return { ok: true };
});

ipcMain.handle('window:toggle-ghost', () => {
  toggleGhostModeState();
  return { isExpanded, isGhostMode, isOverlayHidden };
});

ipcMain.handle('window:set-opacity', (_event, opacity) => {
  appConfig.opacity = opacity;
  saveConfig(appConfig);
  return { ok: true };
});

ipcMain.handle('window:hide', () => {
  setOverlayHiddenState(true);
});

ipcMain.handle('window:quit', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.handle('settings:update-shortcuts', (_event, shortcuts) => {
  recordingShortcutKey = null;
  appConfig.shortcuts = { ...DEFAULT_SHORTCUTS, ...appConfig.shortcuts, ...shortcuts };
  saveConfig(appConfig);
  registerShortcuts();
  updateTrayMenu();
  return appConfig.shortcuts;
});

ipcMain.handle('shell:open', (_event, url) => {
  shell.openExternal(url);
});

app.on('will-quit', () => {
  if (pollInterval) clearInterval(pollInterval);
  if (keyPollInterval) clearInterval(keyPollInterval);
  globalShortcut.unregisterAll();
  if (psProcess) {
    try {
      psProcess.kill();
    } catch {}
  }
});
