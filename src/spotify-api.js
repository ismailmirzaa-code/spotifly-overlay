const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');

const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

class SpotifyApiManager {
  constructor(storeGetter, storeSetter, onAuthChange) {
    this.getStore = storeGetter;
    this.setStore = storeSetter;
    this.onAuthChange = onAuthChange;
    this.authServer = null;
    this.codeVerifier = null;
  }

  get config() {
    return this.getStore() || {};
  }

  isAuthenticated() {
    const cfg = this.config;
    return Boolean(cfg.accessToken && cfg.clientId);
  }

  base64URLEncode(buffer) {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
  }

  async startAuthFlow(clientId) {
    if (!clientId || !clientId.trim()) {
      throw new Error('Lütfen geçerli bir Spotify Client ID girin.');
    }
    const cleanClientId = clientId.trim();
    this.setStore({ ...this.config, clientId: cleanClientId });

    this.codeVerifier = this.base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = this.base64URLEncode(this.sha256(this.codeVerifier));

    if (this.authServer) {
      try {
        this.authServer.close();
      } catch {}
    }

    return new Promise((resolve, reject) => {
      this.authServer = http.createServer(async (req, res) => {
        try {
          const urlObj = new URL(req.url, REDIRECT_URI);
          if (urlObj.pathname === '/callback') {
            const code = urlObj.searchParams.get('code');
            const error = urlObj.searchParams.get('error');

            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <body style="background:#090b10;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                  <div style="text-align:center;padding:32px;background:#141824;border-radius:16px;border:1px solid #ff4d4d44;">
                    <h2 style="color:#ff5555;margin-top:0;">Spotify Bağlantısı İptal Edildi</h2>
                    <p>Hata: ${error}</p>
                    <p>Bu pencereyi kapatıp widget'a dönebilirsiniz.</p>
                  </div>
                </body>
              `);
              this.authServer.close();
              this.authServer = null;
              reject(new Error(error));
              return;
            }

            if (code) {
              await this.exchangeCodeForToken(cleanClientId, code);
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <body style="background:#090b10;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                  <div style="text-align:center;padding:32px;background:#141824;border-radius:16px;border:1px solid #1db95455;box-shadow:0 12px 40px #00000088;">
                    <h2 style="color:#1db954;margin-top:0;">Spotify Başarıyla Bağlandı!</h2>
                    <p>Artık bu tarayıcı sekmesini kapatıp oyuna/widget'a dönebilirsiniz.</p>
                  </div>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
              `);
              this.authServer.close();
              this.authServer = null;
              if (this.onAuthChange) this.onAuthChange(true);
              resolve({ ok: true });
            }
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Token alinamadi: ' + err.message);
          reject(err);
        }
      });

      this.authServer.listen(8888, '127.0.0.1', () => {
        const authUrl = new URL('https://accounts.spotify.com/authorize');
        authUrl.searchParams.set('client_id', cleanClientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('scope', SCOPES);
        shell.openExternal(authUrl.toString());
      });

      this.authServer.on('error', (err) => {
        reject(new Error('8888 portu açılamadı: ' + err.message));
      });
    });
  }

  async exchangeCodeForToken(clientId, code) {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: this.codeVerifier
    });

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error_description || data.error || 'Token hatası');
    }

    const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
    this.setStore({
      ...this.config,
      clientId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.config.refreshToken,
      expiresAt
    });
  }

  async ensureValidToken() {
    const cfg = this.config;
    if (!cfg.accessToken || !cfg.clientId) return null;
    if (cfg.expiresAt && Date.now() < cfg.expiresAt) {
      return cfg.accessToken;
    }
    if (!cfg.refreshToken) return null;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cfg.refreshToken,
        client_id: cfg.clientId
      });

      const resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Refresh failed');

      const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
      this.setStore({
        ...cfg,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || cfg.refreshToken,
        expiresAt
      });
      return data.access_token;
    } catch {
      return null;
    }
  }

  async apiRequest(endpoint, options = {}) {
    const token = await this.ensureValidToken();
    if (!token) throw new Error('SPOTIFY_NOT_CONNECTED');

    const url = endpoint.startsWith('http')
      ? endpoint
      : `https://api.spotify.com/v1${endpoint}`;

    const resp = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (resp.status === 204 || resp.status === 202) return { ok: true };
    const text = await resp.text();
    if (!text) return { ok: resp.ok };
    try {
      const json = JSON.parse(text);
      if (!resp.ok) {
        throw new Error(json.error?.message || `HTTP ${resp.status}`);
      }
      return json;
    } catch (e) {
      if (!resp.ok) throw e;
      return { ok: true };
    }
  }

  logout() {
    const cfg = this.config;
    this.setStore({
      ...cfg,
      accessToken: null,
      refreshToken: null,
      expiresAt: null
    });
    if (this.onAuthChange) this.onAuthChange(false);
  }

  async getCurrentPlayback() {
    if (!this.isAuthenticated()) return null;
    try {
      const data = await this.apiRequest('/me/player');
      if (!data || !data.item) return null;
      const item = data.item;
      let isLiked = false;
      if (item.id) {
        try {
          const likedArr = await this.apiRequest(`/me/tracks/contains?ids=${item.id}`);
          if (Array.isArray(likedArr)) isLiked = Boolean(likedArr[0]);
        } catch {}
      }
      return {
        trackId: item.id,
        uri: item.uri,
        title: item.name,
        artist: (item.artists || []).map((a) => a.name).join(', '),
        album: item.album?.name || '',
        thumbnail: item.album?.images?.[0]?.url || '',
        isPlaying: Boolean(data.is_playing),
        shuffle: Boolean(data.shuffle_state),
        repeat: data.repeat_state || 'off',
        positionMs: data.progress_ms || 0,
        durationMs: item.duration_ms || 0,
        volume: data.device?.volume_percent ?? null,
        isLiked
      };
    } catch {
      return null;
    }
  }

  async toggleLike(trackId, currentlyLiked) {
    if (!trackId) {
      const current = await this.getCurrentPlayback();
      if (!current || !current.trackId) {
        throw new Error('Şarkı kimliği bulunamadı (Spotify Web API bağlantısını kontrol edin).');
      }
      trackId = current.trackId;
      currentlyLiked = current.isLiked;
    }
    const method = currentlyLiked ? 'DELETE' : 'PUT';
    await this.apiRequest(`/me/tracks?ids=${encodeURIComponent(trackId)}`, { method });
    return { isLiked: !currentlyLiked, trackId };
  }

  async getPlaylists() {
    const data = await this.apiRequest('/me/playlists?limit=30');
    return (data.items || []).map((p) => ({
      id: p.id,
      uri: p.uri,
      name: p.name,
      tracksCount: p.tracks?.total || 0,
      image: p.images?.[0]?.url || '',
      owner: p.owner?.display_name || ''
    }));
  }

  async getPlaylistTracks(playlistId) {
    const data = await this.apiRequest(`/playlists/${playlistId}/tracks?limit=50`);
    return (data.items || [])
      .filter((i) => i.track && i.track.id)
      .map((i) => ({
        id: i.track.id,
        uri: i.track.uri,
        title: i.track.name,
        artist: (i.track.artists || []).map((a) => a.name).join(', '),
        album: i.track.album?.name || '',
        durationMs: i.track.duration_ms || 0,
        image: i.track.album?.images?.[i.track.album.images.length - 1]?.url || ''
      }));
  }

  async getLikedTracks() {
    const data = await this.apiRequest('/me/tracks?limit=40');
    return (data.items || [])
      .filter((i) => i.track && i.track.id)
      .map((i) => ({
        id: i.track.id,
        uri: i.track.uri,
        title: i.track.name,
        artist: (i.track.artists || []).map((a) => a.name).join(', '),
        album: i.track.album?.name || '',
        durationMs: i.track.duration_ms || 0,
        image: i.track.album?.images?.[i.track.album.images.length - 1]?.url || ''
      }));
  }

  async getQueue() {
    const data = await this.apiRequest('/me/player/queue');
    const current = data.currently_playing
      ? {
          id: data.currently_playing.id,
          uri: data.currently_playing.uri,
          title: data.currently_playing.name,
          artist: (data.currently_playing.artists || []).map((a) => a.name).join(', '),
          album: data.currently_playing.album?.name || '',
          durationMs: data.currently_playing.duration_ms || 0,
          image: data.currently_playing.album?.images?.[0]?.url || ''
        }
      : null;

    const queue = (data.queue || []).slice(0, 25).map((t) => ({
      id: t.id,
      uri: t.uri,
      title: t.name,
      artist: (t.artists || []).map((a) => a.name).join(', '),
      album: t.album?.name || '',
      durationMs: t.duration_ms || 0,
      image: t.album?.images?.[t.album.images.length - 1]?.url || ''
    }));

    return { current, queue };
  }

  async search(query) {
    if (!query || !query.trim()) return { tracks: [], playlists: [] };
    if (this.isAuthenticated()) {
      const q = encodeURIComponent(query.trim());
      const data = await this.apiRequest(`/search?q=${q}&type=track,playlist&limit=15`);
      const tracks = (data.tracks?.items || []).map((t) => ({
        id: t.id,
        uri: t.uri,
        title: t.name,
        artist: (t.artists || []).map((a) => a.name).join(', '),
        album: t.album?.name || '',
        durationMs: t.duration_ms || 0,
        image: t.album?.images?.[t.album.images.length - 1]?.url || ''
      }));
      const playlists = (data.playlists?.items || []).filter(Boolean).map((p) => ({
        id: p.id,
        uri: p.uri,
        name: p.name,
        tracksCount: p.tracks?.total || 0,
        image: p.images?.[0]?.url || '',
        owner: p.owner?.display_name || ''
      }));
      return { tracks, playlists, mode: 'spotify-api' };
    } else {
      // Fallback: iTunes public search API for instant metadata + open in Spotify Desktop URI
      try {
        const q = encodeURIComponent(query.trim());
        const resp = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=15`);
        const data = await resp.json();
        const tracks = (data.results || []).map((item) => ({
          id: String(item.trackId),
          uri: `spotify:search:${encodeURIComponent(`${item.trackName} ${item.artistName}`)}`,
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName || '',
          durationMs: item.trackTimeMillis || 0,
          image: item.artworkUrl100 || ''
        }));
        return { tracks, playlists: [], mode: 'local-uri' };
      } catch {
        return { tracks: [], playlists: [], mode: 'local-uri' };
      }
    }
  }

  async playUri({ uri, contextUri, offsetUri }) {
    if (this.isAuthenticated()) {
      try {
        const body = {};
        if (contextUri) {
          body.context_uri = contextUri;
          if (offsetUri) body.offset = { uri: offsetUri };
        } else if (uri) {
          if (uri.includes(':playlist:') || uri.includes(':album:') || uri.includes(':artist:')) {
            body.context_uri = uri;
          } else {
            body.uris = [uri];
          }
        }
        await this.apiRequest('/me/player/play', {
          method: 'PUT',
          body: JSON.stringify(body)
        });
        return { ok: true, via: 'api' };
      } catch {
        // Fallback to local URI if no active Premium Web API device
      }
    }
    const target = offsetUri || uri || contextUri;
    if (target && target.startsWith('spotify:')) {
      await shell.openExternal(target);
      return { ok: true, via: 'uri' };
    }
    return { ok: false };
  }

  async addToQueue(uri) {
    if (!uri) throw new Error('Geçersiz şarkı URI');
    await this.apiRequest(`/me/player/queue?uri=${encodeURIComponent(uri)}`, {
      method: 'POST'
    });
    return { ok: true };
  }
}

module.exports = { SpotifyApiManager, REDIRECT_URI };
