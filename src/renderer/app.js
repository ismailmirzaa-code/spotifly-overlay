const state = {
  connected: false,
  apiConnected: false,
  title: 'Spotify Bekleniyor...',
  artist: 'Bir şarkı başlatın',
  album: '',
  isPlaying: false,
  shuffle: false,
  repeat: 'off',
  positionMs: 0,
  durationMs: 0,
  volume: 100,
  lastVolume: 80,
  thumbnail: '',
  isLiked: false,
  trackId: null,
  isScrubbing: false,
  isAdjustingVolume: false,
  isExpanded: false,
  isGhostMode: false,
  isOverlayHidden: false,
  shortcuts: {
    toggleOverlay: 'Alt+Space',
    playPause: 'Alt+P',
    nextTrack: 'Alt+Right',
    prevTrack: 'Alt+Left',
    toggleGhost: 'Alt+G',
    likeTrack: 'Alt+L'
  }
};

// Elements
const overlayRoot = document.getElementById('overlay-root');
const ambientBg = document.getElementById('ambient-bg');
const toastEl = document.getElementById('toast');
const ghostBanner = document.getElementById('ghost-banner');
const statusDot = document.getElementById('status-dot');
const eqBars = document.getElementById('eq-bars');
const connBadge = document.getElementById('connection-badge');

const btnSettingsQuick = document.getElementById('btn-settings-quick');
const btnGhost = document.getElementById('btn-ghost');
const btnExpand = document.getElementById('btn-expand');
const expandIcon = document.getElementById('expand-icon');
const btnHide = document.getElementById('btn-hide');
const coverWrapper = document.getElementById('cover-wrapper');
const albumArt = document.getElementById('album-art');
const albumPlaceholder = document.getElementById('album-placeholder');

const trackTitle = document.getElementById('track-title');
const trackArtist = document.getElementById('track-artist');
const btnLike = document.getElementById('btn-like');

const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressSlider = document.getElementById('progress-slider');

const btnShuffle = document.getElementById('btn-shuffle');
const btnRepeat = document.getElementById('btn-repeat');
const repeatBadge = document.getElementById('repeat-badge');
const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnNext = document.getElementById('btn-next');
const btnMute = document.getElementById('btn-mute');
const volumeSlider = document.getElementById('volume-slider');

const expandedDrawer = document.getElementById('expanded-drawer');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Search elements
const searchInput = document.getElementById('search-input');
const btnSearchGo = document.getElementById('btn-search-go');
const searchResults = document.getElementById('search-results');

// Playlists elements
const playlistHeaderBar = document.getElementById('playlist-header-bar');
const btnBackPlaylists = document.getElementById('btn-back-playlists');
const currentPlaylistTitle = document.getElementById('current-playlist-title');
const playlistsList = document.getElementById('playlists-list');

// Queue elements
const btnRefreshQueue = document.getElementById('btn-refresh-queue');
const queueList = document.getElementById('queue-list');

// Settings elements
const apiStatusPill = document.getElementById('api-status-pill');
const inputClientId = document.getElementById('input-client-id');
const btnCopyUri = document.getElementById('btn-copy-uri');
const btnConnectSpotify = document.getElementById('btn-connect-spotify');
const btnOpenDev = document.getElementById('btn-open-dev');
const btnDisconnectSpotify = document.getElementById('btn-disconnect-spotify');

const btnPresetFn = document.getElementById('btn-preset-fn');
const btnPresetDefault = document.getElementById('btn-preset-default');
const opacitySlider = document.getElementById('opacity-slider');
const btnQuitApp = document.getElementById('btn-quit-app');

let toastTimer = null;
let activeRecordingBtn = null;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2200);
}

function formatMs(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function renderShortcutBadges() {
  const sc = state.shortcuts || {};
  const keys = ['toggleOverlay', 'playPause', 'nextTrack', 'prevTrack', 'toggleGhost', 'likeTrack'];
  keys.forEach((k) => {
    const el = document.getElementById(`val-${k}`);
    if (el && sc[k]) el.textContent = sc[k];
  });
}

function renderState(data) {
  if (!data) return;
  Object.assign(state, data);

  statusDot.classList.toggle('online', Boolean(state.connected));
  eqBars.classList.toggle('paused', !state.isPlaying);

  if (state.apiConnected) {
    connBadge.textContent = 'OYUN MODU + API';
    apiStatusPill.textContent = 'Bağlı ✓';
    apiStatusPill.className = 'status-pill connected';
    btnDisconnectSpotify.classList.remove('hidden');
  } else {
    connBadge.textContent = 'OYUN MODU';
    apiStatusPill.textContent = 'Bağlı Değil';
    apiStatusPill.className = 'status-pill disconnected';
    btnDisconnectSpotify.classList.add('hidden');
  }

  trackTitle.textContent = state.title || 'Bilinmeyen Şarkı';
  trackArtist.textContent = state.artist
    ? state.album
      ? `${state.artist} • ${state.album}`
      : state.artist
    : 'Spotify';

  if (state.thumbnail) {
    if (albumArt.getAttribute('src') !== state.thumbnail) {
      albumArt.src = state.thumbnail;
      ambientBg.style.backgroundImage = `url("${state.thumbnail}")`;
    }
    albumArt.classList.remove('hidden');
    albumPlaceholder.classList.add('hidden');
  } else {
    albumArt.classList.add('hidden');
    albumPlaceholder.classList.remove('hidden');
    ambientBg.style.backgroundImage = 'none';
  }

  btnLike.classList.toggle('liked', Boolean(state.isLiked));

  iconPlay.classList.toggle('hidden', Boolean(state.isPlaying));
  iconPause.classList.toggle('hidden', !state.isPlaying);

  btnShuffle.classList.toggle('active', Boolean(state.shuffle));

  btnRepeat.classList.toggle('active', state.repeat === 'context' || state.repeat === 'track');
  repeatBadge.classList.toggle('hidden', state.repeat !== 'track');

  if (!state.isScrubbing) {
    timeCurrent.textContent = formatMs(state.positionMs);
    timeTotal.textContent = formatMs(state.durationMs);
    if (state.durationMs > 0) {
      const ratio = Math.min(1000, Math.max(0, Math.round((state.positionMs / state.durationMs) * 1000)));
      progressSlider.value = ratio;
    } else {
      progressSlider.value = 0;
    }
  }

  if (!state.isAdjustingVolume && typeof state.volume === 'number') {
    volumeSlider.value = state.volume;
  }
}

// Subscribe to backend events
window.spotifly.onStatusUpdate((data) => {
  renderState(data);
});

window.spotifly.onShortcutToast((msg) => {
  showToast(msg);
});

window.spotifly.onModeChanged(({ isExpanded, isGhostMode, isOverlayHidden }) => {
  state.isExpanded = Boolean(isExpanded);
  state.isGhostMode = Boolean(isGhostMode);
  state.isOverlayHidden = Boolean(isOverlayHidden);

  overlayRoot.classList.toggle('overlay-hidden', state.isOverlayHidden);

  expandedDrawer.classList.toggle('hidden', !state.isExpanded);
  btnExpand.classList.toggle('active', state.isExpanded);
  expandIcon.style.transform = state.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';

  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  btnSettingsQuick.classList.toggle('active', state.isExpanded && activeTab === 'settings');

  overlayRoot.classList.toggle('ghost-mode', state.isGhostMode);
  btnGhost.classList.toggle('active', state.isGhostMode);
  ghostBanner.classList.toggle('hidden', !state.isGhostMode);
});

window.spotifly.onShortcutRecorded((data) => {
  if (activeRecordingBtn) {
    activeRecordingBtn.classList.remove('recording');
    activeRecordingBtn.textContent = '⌨️ Değiştir';
    activeRecordingBtn = null;
  }
  if (data.cancelled) {
    showToast('Kısayol değiştirme iptal edildi');
    return;
  }
  if (data.shortcuts) {
    state.shortcuts = data.shortcuts;
    renderShortcutBadges();
    showToast(`Yeni Kısayol Kaydedildi: ${data.combo} ✓`);
  }
});

// Controls Events
btnPlay.addEventListener('click', async () => {
  const res = await window.spotifly.command({ action: 'toggle' });
  renderState(res);
});

btnNext.addEventListener('click', async () => {
  const res = await window.spotifly.command({ action: 'next' });
  renderState(res);
});

btnPrev.addEventListener('click', async () => {
  const res = await window.spotifly.command({ action: 'prev' });
  renderState(res);
});

btnShuffle.addEventListener('click', async () => {
  const nextState = !state.shuffle;
  state.shuffle = nextState;
  btnShuffle.classList.toggle('active', nextState);
  showToast(nextState ? 'Karıştırma: Açık 🔀' : 'Karıştırma: Kapalı');
  const res = await window.spotifly.command({ action: 'shuffle', state: nextState });
  renderState(res);
});

btnRepeat.addEventListener('click', async () => {
  const order = ['off', 'context', 'track'];
  const nextIdx = (order.indexOf(state.repeat) + 1) % order.length;
  const nextMode = order[nextIdx];
  state.repeat = nextMode;
  const labels = {
    off: 'Tekrarla: Kapalı',
    context: 'Tekrarla: Liste 🔁',
    track: 'Tekrarla: Tek Şarkı 🔂'
  };
  showToast(labels[nextMode]);
  const res = await window.spotifly.command({ action: 'repeat', mode: nextMode });
  renderState(res);
});

btnLike.addEventListener('click', async () => {
  try {
    const res = await window.spotifly.toggleLike({
      trackId: state.trackId,
      isLiked: state.isLiked
    });
    state.isLiked = res.isLiked;
    btnLike.classList.toggle('liked', state.isLiked);
    showToast(state.isLiked ? 'Beğenilenlere Eklendi ♥' : 'Beğenilenlerden Çıkarıldı');
  } catch (err) {
    showToast(err.message || 'İşlem başarısız');
  }
});

// Progress Slider Scrubbing
progressSlider.addEventListener('mousedown', () => {
  state.isScrubbing = true;
});

progressSlider.addEventListener('input', () => {
  state.isScrubbing = true;
  if (state.durationMs > 0) {
    const targetMs = Math.round((Number(progressSlider.value) / 1000) * state.durationMs);
    timeCurrent.textContent = formatMs(targetMs);
  }
});

progressSlider.addEventListener('change', async () => {
  if (state.durationMs > 0) {
    const targetMs = Math.round((Number(progressSlider.value) / 1000) * state.durationMs);
    state.positionMs = targetMs;
    await window.spotifly.command({ action: 'seek', positionMs: targetMs });
  }
  state.isScrubbing = false;
});

// Volume Slider
volumeSlider.addEventListener('mousedown', () => {
  state.isAdjustingVolume = true;
});

volumeSlider.addEventListener('input', async () => {
  state.isAdjustingVolume = true;
  const val = Number(volumeSlider.value);
  state.volume = val;
  await window.spotifly.command({ action: 'volume', value: val });
});

volumeSlider.addEventListener('change', () => {
  state.isAdjustingVolume = false;
});

btnMute.addEventListener('click', async () => {
  if (state.volume > 0) {
    state.lastVolume = state.volume;
    state.volume = 0;
  } else {
    state.volume = state.lastVolume || 80;
  }
  volumeSlider.value = state.volume;
  await window.spotifly.command({ action: 'volume', value: state.volume });
  showToast(`Spotify Sesi: %${state.volume}`);
});

// Window Header Actions & Tab Switching
function activateTab(tabName) {
  tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
  btnSettingsQuick.classList.toggle('active', state.isExpanded && tabName === 'settings');

  if (tabName === 'playlists') loadPlaylists();
  if (tabName === 'queue') loadQueue();
}

async function toggleDrawer() {
  const next = !state.isExpanded;
  await window.spotifly.setExpanded(next);
  if (next) {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'settings';
    activateTab(activeTab);
  } else {
    stopRecordingShortcut();
  }
}

btnExpand.addEventListener('click', toggleDrawer);
coverWrapper.addEventListener('click', toggleDrawer);

// Quick Settings / Shortcuts button on top bar
btnSettingsQuick.addEventListener('click', async () => {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (state.isExpanded && activeTab === 'settings') {
    await window.spotifly.setExpanded(false);
    stopRecordingShortcut();
  } else {
    if (!state.isExpanded) {
      await window.spotifly.setExpanded(true);
    }
    activateTab('settings');
  }
});

btnGhost.addEventListener('click', async () => {
  await window.spotifly.toggleGhostMode();
  showToast(`Hayalet HUD aktif! Çıkmak için ${state.shortcuts.toggleOverlay || 'Alt+Space'}`);
});

btnHide.addEventListener('click', () => {
  stopRecordingShortcut();
  window.spotifly.hideOverlay();
});

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    stopRecordingShortcut();
    activateTab(btn.dataset.tab);
  });
});

// Hardware-level Hotkey Recording Logic (No Window Focus Required!)
function stopRecordingShortcut() {
  if (activeRecordingBtn) {
    activeRecordingBtn.classList.remove('recording');
    activeRecordingBtn.textContent = '⌨️ Değiştir';
    activeRecordingBtn = null;
    window.spotifly.cancelKeyRecord();
  }
}

document.querySelectorAll('.sc-record-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (activeRecordingBtn === btn) {
      stopRecordingShortcut();
      return;
    }
    if (activeRecordingBtn) {
      activeRecordingBtn.classList.remove('recording');
      activeRecordingBtn.textContent = '⌨️ Değiştir';
    }
    activeRecordingBtn = btn;
    btn.classList.add('recording');
    btn.textContent = 'Tuşa Basın (Esc)';
    await window.spotifly.startKeyRecord(btn.dataset.key);
  });
});

// Preset Shortcut Profiles (One-Click Mouse Only!)
btnPresetFn.addEventListener('click', async () => {
  stopRecordingShortcut();
  const fnProfile = {
    toggleOverlay: 'F8',
    playPause: 'F9',
    prevTrack: 'F7',
    nextTrack: 'F10',
    toggleGhost: 'F11',
    likeTrack: 'Alt+L'
  };
  state.shortcuts = await window.spotifly.updateShortcuts(fnProfile);
  renderShortcutBadges();
  showToast('F-Tuşları Oyun Profili (F7-F11) aktif edildi! 🎮');
});

btnPresetDefault.addEventListener('click', async () => {
  stopRecordingShortcut();
  const defProfile = {
    toggleOverlay: 'Alt+Space',
    playPause: 'Alt+P',
    nextTrack: 'Alt+Right',
    prevTrack: 'Alt+Left',
    toggleGhost: 'Alt+G',
    likeTrack: 'Alt+L'
  };
  state.shortcuts = await window.spotifly.updateShortcuts(defProfile);
  renderShortcutBadges();
  showToast('Varsayılan kısayollar yüklendi ✓');
});

// Search Logic
async function performSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  searchResults.innerHTML = `<div class="empty-state">Aranıyor...</div>`;
  try {
    const res = await window.spotifly.search(q);
    const items = [];

    (res.tracks || []).forEach((t) => {
      items.push(`
        <div class="media-item" data-uri="${escapeAttr(t.uri)}">
          ${
            t.image
              ? `<img src="${escapeAttr(t.image)}" class="media-thumb" />`
              : `<div class="media-thumb">🎵</div>`
          }
          <div class="media-info">
            <div class="media-title">${escapeHtml(t.title)}</div>
            <div class="media-sub">${escapeHtml(t.artist)} ${t.album ? '• ' + escapeHtml(t.album) : ''}</div>
          </div>
          <div class="media-actions">
            ${
              res.mode === 'spotify-api'
                ? `<button class="mini-action-btn btn-queue-add" data-uri="${escapeAttr(t.uri)}" title="Sıraya Ekle">+ Sıra</button>`
                : ''
            }
            <button class="mini-action-btn btn-play-item" data-uri="${escapeAttr(t.uri)}">▶ Çal</button>
          </div>
        </div>
      `);
    });

    (res.playlists || []).forEach((p) => {
      items.push(`
        <div class="media-item" data-uri="${escapeAttr(p.uri)}">
          ${
            p.image
              ? `<img src="${escapeAttr(p.image)}" class="media-thumb" />`
              : `<div class="media-thumb">📀</div>`
          }
          <div class="media-info">
            <div class="media-title">[Liste] ${escapeHtml(p.name)}</div>
            <div class="media-sub">${escapeHtml(p.owner)} • ${p.tracksCount} şarkı</div>
          </div>
          <div class="media-actions">
            <button class="mini-action-btn btn-play-item" data-uri="${escapeAttr(p.uri)}">▶ Başlat</button>
          </div>
        </div>
      `);
    });

    if (items.length === 0) {
      searchResults.innerHTML = `<div class="empty-state">Sonuç bulunamadı.</div>`;
    } else {
      searchResults.innerHTML = items.join('');
      bindMediaListActions(searchResults);
    }
  } catch (err) {
    searchResults.innerHTML = `<div class="empty-state">Arama hatası: ${escapeHtml(err.message)}</div>`;
  }
}

btnSearchGo.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch();
});

// Playlists Logic
async function loadPlaylists() {
  playlistHeaderBar.classList.add('hidden');
  playlistsList.innerHTML = `<div class="empty-state">Listeler yükleniyor...</div>`;
  try {
    const res = await window.spotifly.getPlaylists();
    const list = res.playlists || [];
    if (list.length === 0) {
      playlistsList.innerHTML = `<div class="empty-state">Henüz liste yok.</div>`;
      return;
    }

    playlistsList.innerHTML = list
      .map(
        (p) => `
      <div class="media-item playlist-row" data-id="${escapeAttr(p.id)}" data-uri="${escapeAttr(p.uri)}" data-name="${escapeAttr(p.name)}">
        ${
          p.image
            ? `<img src="${escapeAttr(p.image)}" class="media-thumb" />`
            : `<div class="media-thumb">💚</div>`
        }
        <div class="media-info">
          <div class="media-title">${escapeHtml(p.name)}</div>
          <div class="media-sub">${escapeHtml(p.owner)} • ${p.tracksCount} şarkı</div>
        </div>
        <div class="media-actions">
          ${
            p.uri && p.uri.startsWith('spotify:playlist:')
              ? `<button class="mini-action-btn btn-play-context" data-uri="${escapeAttr(p.uri)}">▶ Çal</button>`
              : ''
          }
          <button class="mini-action-btn btn-open-playlist">Aç →</button>
        </div>
      </div>
    `
      )
      .join('');

    if (!res.apiConnected) {
      playlistsList.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-state" style="padding:14px;">
          Spotify hesabınızdaki tüm çalma listelerini görmek için <b>⚙️ Ayarlar & Kısayol</b> sekmesinden Spotify Web API'yi bağlayabilirsiniz.
        </div>`
      );
    }

    playlistsList.querySelectorAll('.playlist-row').forEach((row) => {
      const id = row.dataset.id;
      const name = row.dataset.name;
      const contextUri = row.dataset.uri;

      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-play-context')) {
          e.stopPropagation();
          window.spotifly.playUri({ contextUri });
          showToast(`${name} başlatılıyor...`);
          return;
        }
        openPlaylistTracks(id, name, contextUri);
      });
    });
  } catch (err) {
    playlistsList.innerHTML = `<div class="empty-state">Hata: ${escapeHtml(err.message)}</div>`;
  }
}

async function openPlaylistTracks(playlistId, playlistName, contextUri) {
  playlistHeaderBar.classList.remove('hidden');
  currentPlaylistTitle.textContent = playlistName;
  playlistsList.innerHTML = `<div class="empty-state">Şarkılar yükleniyor...</div>`;

  try {
    const tracks = await window.spotifly.getPlaylistTracks(playlistId);
    if (!tracks || tracks.length === 0) {
      playlistsList.innerHTML = `<div class="empty-state">Bu listede henüz şarkı yok.</div>`;
      return;
    }

    playlistsList.innerHTML = tracks
      .map(
        (t) => `
      <div class="media-item" data-uri="${escapeAttr(t.uri)}" data-context="${escapeAttr(
          contextUri && contextUri.startsWith('spotify:playlist:') ? contextUri : ''
        )}">
        ${
          t.image
            ? `<img src="${escapeAttr(t.image)}" class="media-thumb" />`
            : `<div class="media-thumb">🎵</div>`
        }
        <div class="media-info">
          <div class="media-title">${escapeHtml(t.title)}</div>
          <div class="media-sub">${escapeHtml(t.artist)}</div>
        </div>
        <div class="media-actions">
          <button class="mini-action-btn btn-play-item" data-uri="${escapeAttr(t.uri)}">▶</button>
        </div>
      </div>
    `
      )
      .join('');

    bindMediaListActions(playlistsList);
  } catch (err) {
    playlistsList.innerHTML = `<div class="empty-state">Hata: ${escapeHtml(err.message)}</div>`;
  }
}

btnBackPlaylists.addEventListener('click', loadPlaylists);

// Queue Logic
async function loadQueue() {
  queueList.innerHTML = `<div class="empty-state">Sıra yükleniyor...</div>`;
  try {
    const res = await window.spotifly.getQueue();
    if (!res.apiConnected) {
      queueList.innerHTML = `
        <div class="empty-state">
          Sıradaki şarkıları görmek ve sıraya şarkı eklemek için <b>⚙️ Ayarlar & Kısayol</b> sekmesinden Spotify Web API bağlantısını aktif edin.
        </div>
      `;
      return;
    }

    const q = res.queue || [];
    if (q.length === 0) {
      queueList.innerHTML = `<div class="empty-state">Sırada bekleyen şarkı bulunamadı.</div>`;
      return;
    }

    queueList.innerHTML = q
      .map(
        (t, idx) => `
      <div class="media-item" data-uri="${escapeAttr(t.uri)}">
        ${
          t.image
            ? `<img src="${escapeAttr(t.image)}" class="media-thumb" />`
            : `<div class="media-thumb">${idx + 1}</div>`
        }
        <div class="media-info">
          <div class="media-title">${escapeHtml(t.title)}</div>
          <div class="media-sub">${escapeHtml(t.artist)}</div>
        </div>
        <div class="media-actions">
          <button class="mini-action-btn btn-play-item" data-uri="${escapeAttr(t.uri)}">▶ Şimdi Çal</button>
        </div>
      </div>
    `
      )
      .join('');

    bindMediaListActions(queueList);
  } catch (err) {
    queueList.innerHTML = `<div class="empty-state">Sıra alınamadı: ${escapeHtml(err.message)}</div>`;
  }
}

btnRefreshQueue.addEventListener('click', loadQueue);

function bindMediaListActions(container) {
  container.querySelectorAll('.media-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      const queueBtn = e.target.closest('.btn-queue-add');
      if (queueBtn) {
        e.stopPropagation();
        const uri = queueBtn.dataset.uri;
        try {
          await window.spotifly.addToQueue(uri);
          showToast('Sıraya eklendi ⏭');
        } catch (err) {
          showToast(err.message);
        }
        return;
      }

      const uri = item.dataset.uri;
      const contextUri = item.dataset.context;
      if (contextUri) {
        await window.spotifly.playUri({ contextUri, offsetUri: uri });
      } else {
        await window.spotifly.playUri({ uri });
      }
      showToast('Spotify üzerinde başlatılıyor ♪');
    });
  });
}

// Settings Initialization
async function initSettings() {
  const cfg = await window.spotifly.getAuthConfig();
  inputClientId.value = cfg.clientId || '';
  if (cfg.shortcuts) {
    state.shortcuts = cfg.shortcuts;
    renderShortcutBadges();
  }
  if (cfg.opacity) {
    opacitySlider.value = Math.round(cfg.opacity * 100);
    overlayRoot.style.opacity = cfg.opacity;
  }
}

btnCopyUri.addEventListener('click', () => {
  navigator.clipboard.writeText('http://127.0.0.1:8888/callback');
  showToast('Redirect URI kopyalandı!');
});

btnOpenDev.addEventListener('click', () => {
  window.spotifly.openExternal('https://developer.spotify.com/dashboard');
});

btnConnectSpotify.addEventListener('click', async () => {
  const cid = inputClientId.value.trim();
  if (!cid) {
    showToast('Lütfen önce Spotify Client ID girin');
    return;
  }
  showToast('Tarayıcıda Spotify giriş sayfası açılıyor...');
  try {
    await window.spotifly.connectSpotify(cid);
    showToast('Spotify Web API başarıyla bağlandı! 🎉');
    const st = await window.spotifly.getStatus();
    renderState(st);
  } catch (err) {
    showToast(err.message || 'Bağlantı hatası');
  }
});

btnDisconnectSpotify.addEventListener('click', async () => {
  await window.spotifly.disconnectSpotify();
  showToast('Spotify Web API bağlantısı kesildi');
});

opacitySlider.addEventListener('input', () => {
  const op = Number(opacitySlider.value) / 100;
  overlayRoot.style.opacity = op;
  window.spotifly.setOpacity(op);
});

btnQuitApp.addEventListener('click', () => {
  window.spotifly.quitApp();
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

// Initial boot
(async () => {
  await initSettings();
  const initial = await window.spotifly.getStatus();
  renderState(initial);
})();
