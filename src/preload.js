const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spotifly', {
  // Media session & playback controls
  getStatus: () => ipcRenderer.invoke('media:status'),
  command: (payload) => ipcRenderer.invoke('media:command', payload),
  onStatusUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('media:update', handler);
    return () => ipcRenderer.removeListener('media:update', handler);
  },
  onShortcutToast: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('shortcut:toast', handler);
    return () => ipcRenderer.removeListener('shortcut:toast', handler);
  },
  onModeChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:mode-changed', handler);
    return () => ipcRenderer.removeListener('window:mode-changed', handler);
  },
  onShortcutRecorded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('shortcut:recorded', handler);
    return () => ipcRenderer.removeListener('shortcut:recorded', handler);
  },

  // Spotify Web API & Library
  getAuthConfig: () => ipcRenderer.invoke('spotify:get-config'),
  connectSpotify: (clientId) => ipcRenderer.invoke('spotify:connect', clientId),
  disconnectSpotify: () => ipcRenderer.invoke('spotify:disconnect'),
  getPlaylists: () => ipcRenderer.invoke('spotify:playlists'),
  getPlaylistTracks: (playlistId) => ipcRenderer.invoke('spotify:playlist-tracks', playlistId),
  getLikedTracks: () => ipcRenderer.invoke('spotify:liked-tracks'),
  getQueue: () => ipcRenderer.invoke('spotify:queue'),
  search: (query) => ipcRenderer.invoke('spotify:search', query),
  playUri: (payload) => ipcRenderer.invoke('spotify:play-uri', payload),
  addToQueue: (uri) => ipcRenderer.invoke('spotify:add-queue', uri),
  toggleLike: (payload) => ipcRenderer.invoke('spotify:toggle-like', payload),

  // Window & Overlay controls
  setExpanded: (expanded) => ipcRenderer.invoke('window:set-expanded', expanded),
  startKeyRecord: (shortcutKey) => ipcRenderer.invoke('settings:start-key-record', shortcutKey),
  cancelKeyRecord: () => ipcRenderer.invoke('settings:cancel-key-record'),
  toggleGhostMode: () => ipcRenderer.invoke('window:toggle-ghost'),
  setOpacity: (opacity) => ipcRenderer.invoke('window:set-opacity', opacity),
  hideOverlay: () => ipcRenderer.invoke('window:hide'),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  updateShortcuts: (shortcuts) => ipcRenderer.invoke('settings:update-shortcuts', shortcuts),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url)
});
