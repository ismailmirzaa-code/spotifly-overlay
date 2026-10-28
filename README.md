# 🎧 SpotiFly — Gaming & Fullscreen Spotify Overlay Widget

![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=for-the-badge&logo=windows)
![Electron](https://img.shields.io/badge/Electron-33-47848F?style=for-the-badge&logo=electron)
![Spotify](https://img.shields.io/badge/Spotify-Control%20%2B%20API-1DB954?style=for-the-badge&logo=spotify)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**SpotiFly**, oyun oynarken veya tam ekran bir uygulama kullanırken `Alt + Tab` yapıp ekran değiştirmeye gerek kalmadan Spotify'ı kısayollarla kontrol etmenizi sağlayan, **odağı çalmayan (`WS_EX_NOACTIVATE`)** gelişmiş bir masaüstü overlay widget'ıdır.

---

## ✨ Özellikler

- 🛡️ **Oyunu Alta Düşürmeyen Mimari (`WS_EX_NOACTIVATE` + Sıfır Kesinti Gizleme):**
  Widget'ı kısayolla gizleyip açtığınızda veya üzerindeki butonlara fareyle tıkladığınızda arkadaki tam ekran oyun odağını kaybetmez ve görev çubuğuna düşmez.
- ⚡ **Sıfır Gecikmeli Windows Media Session:**
  Hiçbir API anahtarı gerektirmeden bilgisayarda çalan Spotify şarkısını, albüm kapağını, süresini ve çalma durumunu doğrudan okur ve kontrol eder.
- 🔊 **Sadece Spotify Sesini Değiştiren Mikser (CoreAudio):**
  Widget üzerindeki ses çubuğu Windows CoreAudio üzerinden **yalnızca `Spotify.exe` sesini** kısar veya açar; oyununuzun ses seviyesine dokunmaz.
- 👻 **Hayalet HUD Modu (Click-Through):**
  Widget'ı ekranda yarı saydam olarak sabitleyip fare tıklamalarının doğrudan arkadaki oyuna geçmesini sağlayabilirsiniz.
- ⌨️ **Özelleştirilebilir Oyun İçi Kısayollar:**
  Oyunlarla çakışmaması için tüm kısayol tuşlarını widget içindeki **⚙️ Kısayollar** menüsünden tek tıkla değiştirebilir veya hazır **F-Tuşları Profilini (`F7` - `F11`)** seçebilirsiniz.
- 🔍 **Oyun İçi Şarkı Arama, Çalma Listeleri ve Sıradakiler:**
  Genişletilebilir çekmece üzerinden şarkı aratıp anında başlatabilir, beğendiğiniz şarkıları (`♥`) yönetebilir ve Spotify Web API (PKCE) bağlantısıyla tüm çalma listelerinize/sıraya erişebilirsiniz.

---

## 🎮 Varsayılan Kısayollar

| İşlev | Varsayılan Kısayol | F-Tuşları Oyun Profili |
| :--- | :---: | :---: |
| **Widget Göster / Gizle** | `Alt + Space` | `F8` |
| **Oynat / Duraklat** | `Alt + P` | `F9` |
| **Sonraki Şarkı** | `Alt + Sağ Ok` | `F10` |
| **Önceki Şarkı** | `Alt + Sol Ok` | `F7` |
| **Hayalet HUD (Click-Through)** | `Alt + G` | `F11` |
| **Şarkıyı Beğen (♥)** | `Alt + L` | `Alt + L` |

> 💡 Tüm kısayolları widget'ın sağ üst köşesindeki **⚙️ Kısayollar** butonuna tıklayarak dilediğiniz tuşa atayabilirsiniz.

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Windows 10 / 11**
- **Node.js** (v18 veya üzeri)

### Adımlar

```bash
# 1. Repoyu klonlayın
git clone https://github.com/KULLANICI_ADINIZ/spotifly-overlay.git
cd spotifly-overlay

# 2. Bağımlılıkları yükleyin
npm install

# 3. Uygulamayı başlatın
npm start
```

Windows üzerinde terminal açmadan doğrudan **`Baslat-SpotiFly.bat`** dosyasına çift tıklayarak da başlatabilirsiniz.

---

## 🔗 Spotify Web API Kurulumu (Opsiyonel)

Temel medya kontrolleri, şarkı arama, albüm kapağı ve Spotify ses kontrolü **kurulumsuz** çalışır. Kendi Spotify kütüphanenizdeki çalma listelerini ve sıradaki şarkıları senkronize etmek isterseniz:

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) adresine gidin ve **Create App** butonuna tıklayın.
2. **Redirect URIs** alanına şu adresi ekleyin:
   ```text
   http://127.0.0.1:8888/callback
   ```
3. Uygulamanızın **Client ID** değerini kopyalayıp SpotiFly içindeki **⚙️ Ayarlar & Kısayol** sekmesine yapıştırın ve **Spotify Bağla** butonuna tıklayın.

---

## 📄 Lisans

Bu proje **MIT Lisansı** altında lisanslanmıştır.
