[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

# Load WinRT assemblies for GlobalSystemMediaTransportControls
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Helper to await WinRT IAsyncOperation
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT($WinRtTask, $ResultType) {
    if ($null -eq $WinRtTask) { return $null }
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(1500) | Out-Null
    if ($netTask.IsCompletedSuccessfully -or $netTask.Status -eq 'RanToCompletion') {
        return $netTask.Result
    }
    return $null
}

# C# Audio Session Volume Controller for targeting Spotify.exe specifically
$audioCode = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class SpotifyAudioController {
    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumerator { }

    internal enum EDataFlow { eRender, eCapture, eAll }
    internal enum ERole { eConsole, eMultimedia, eCommunications }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator {
        int NotImpl1();
        [PreserveSig]
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice {
        [PreserveSig]
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionManager2 {
        int NotImpl1();
        int NotImpl2();
        [PreserveSig]
        int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionEnumerator {
        [PreserveSig]
        int GetCount(out int SessionCount);
        [PreserveSig]
        int GetSession(int SessionCount, out IAudioSessionControl2 Session);
    }

    [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl2 {
        [PreserveSig] int NotImpl1();
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int NotImpl2();
        [PreserveSig] int NotImpl3();
        [PreserveSig] int NotImpl4();
        [PreserveSig] int NotImpl5();
        [PreserveSig] int NotImpl6();
        [PreserveSig] int NotImpl7();
        [PreserveSig] int NotImpl8();
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetProcessId(out int pRetVal);
    }

    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface ISimpleAudioVolume {
        [PreserveSig] int SetMasterVolume(float fLevel, ref Guid EventContext);
        [PreserveSig] int GetMasterVolume(out float pfLevel);
        [PreserveSig] int SetMute(bool bMute, ref Guid EventContext);
        [PreserveSig] int GetMute(out bool pbMute);
    }

    public static float GetSpotifyVolume() {
        try {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
            IMMDevice device;
            enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device);
            Guid iid = typeof(IAudioSessionManager2).GUID;
            object o;
            device.Activate(ref iid, 0, IntPtr.Zero, out o);
            var mgr = (IAudioSessionManager2)o;
            IAudioSessionEnumerator sessionEnum;
            mgr.GetSessionEnumerator(out sessionEnum);
            int count;
            sessionEnum.GetCount(out count);
            for (int i = 0; i < count; i++) {
                IAudioSessionControl2 ctl;
                sessionEnum.GetSession(i, out ctl);
                int pid;
                ctl.GetProcessId(out pid);
                string sid;
                ctl.GetSessionIdentifier(out sid);
                bool isSpotify = (sid != null && sid.ToLower().Contains("spotify"));
                if (!isSpotify && pid > 0) {
                    try {
                        var proc = Process.GetProcessById(pid);
                        if (proc.ProcessName.ToLower().Contains("spotify")) isSpotify = true;
                    } catch {}
                }
                if (isSpotify) {
                    var vol = (ISimpleAudioVolume)ctl;
                    float level;
                    vol.GetMasterVolume(out level);
                    return level;
                }
            }
        } catch {}
        return -1f;
    }

    public static bool SetSpotifyVolume(float level) {
        try {
            if (level < 0f) level = 0f;
            if (level > 1f) level = 1f;
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
            IMMDevice device;
            enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device);
            Guid iid = typeof(IAudioSessionManager2).GUID;
            object o;
            device.Activate(ref iid, 0, IntPtr.Zero, out o);
            var mgr = (IAudioSessionManager2)o;
            IAudioSessionEnumerator sessionEnum;
            mgr.GetSessionEnumerator(out sessionEnum);
            int count;
            sessionEnum.GetCount(out count);
            bool found = false;
            Guid guid = Guid.Empty;
            for (int i = 0; i < count; i++) {
                IAudioSessionControl2 ctl;
                sessionEnum.GetSession(i, out ctl);
                int pid;
                ctl.GetProcessId(out pid);
                string sid;
                ctl.GetSessionIdentifier(out sid);
                bool isSpotify = (sid != null && sid.ToLower().Contains("spotify"));
                if (!isSpotify && pid > 0) {
                    try {
                        var proc = Process.GetProcessById(pid);
                        if (proc.ProcessName.ToLower().Contains("spotify")) isSpotify = true;
                    } catch {}
                }
                if (isSpotify) {
                    var vol = (ISimpleAudioVolume)ctl;
                    vol.SetMasterVolume(level, ref guid);
                    found = true;
                }
            }
            return found;
        } catch {}
        return false;
    }

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;

    public static bool SetWindowNoActivate(long hwndVal, bool noActivate) {
        try {
            IntPtr hWnd = new IntPtr(hwndVal);
            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            if (noActivate) {
                exStyle |= (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
            } else {
                exStyle &= ~WS_EX_NOACTIVATE;
            }
            SetWindowLong(hWnd, GWL_EXSTYLE, exStyle);
            return true;
        } catch {}
        return false;
    }

    private static bool IsDown(int vk) {
        return (GetAsyncKeyState(vk) & 0x8000) != 0;
    }

    public static string GetPressedCombo() {
        try {
            if (IsDown(0x1B)) return "Escape";

            bool ctrl = IsDown(0x11) || IsDown(0xA2) || IsDown(0xA3);
            bool alt = IsDown(0x12) || IsDown(0xA4) || IsDown(0xA5);
            bool shift = IsDown(0x10) || IsDown(0xA0) || IsDown(0xA1);

            string mainKey = null;

            // F1 - F12 (0x70 - 0x7B)
            for (int i = 0; i < 12; i++) {
                if (IsDown(0x70 + i)) { mainKey = "F" + (i + 1); break; }
            }

            // A - Z (0x41 - 0x5A)
            if (mainKey == null) {
                for (int vk = 0x41; vk <= 0x5A; vk++) {
                    if (IsDown(vk)) { mainKey = ((char)vk).ToString(); break; }
                }
            }

            // 0 - 9 (0x30 - 0x39)
            if (mainKey == null) {
                for (int vk = 0x30; vk <= 0x39; vk++) {
                    if (IsDown(vk)) { mainKey = ((char)vk).ToString(); break; }
                }
            }

            // Numpad 0 - 9 (0x60 - 0x69)
            if (mainKey == null) {
                for (int i = 0; i <= 9; i++) {
                    if (IsDown(0x60 + i)) { mainKey = "num" + i; break; }
                }
            }

            // Navigation & Special Keys
            if (mainKey == null) {
                if (IsDown(0x20)) mainKey = "Space";
                else if (IsDown(0x21)) mainKey = "PageUp";
                else if (IsDown(0x22)) mainKey = "PageDown";
                else if (IsDown(0x23)) mainKey = "End";
                else if (IsDown(0x24)) mainKey = "Home";
                else if (IsDown(0x25)) mainKey = "Left";
                else if (IsDown(0x26)) mainKey = "Up";
                else if (IsDown(0x27)) mainKey = "Right";
                else if (IsDown(0x28)) mainKey = "Down";
                else if (IsDown(0x2D)) mainKey = "Insert";
                else if (IsDown(0x2E)) mainKey = "Delete";
                else if (IsDown(0x09)) mainKey = "Tab";
                else if (IsDown(0x6A)) mainKey = "nummult";
                else if (IsDown(0x6B)) mainKey = "numadd";
                else if (IsDown(0x6D)) mainKey = "numsub";
            }

            if (mainKey == null) return "";

            System.Collections.Generic.List<string> parts = new System.Collections.Generic.List<string>();
            if (ctrl) parts.Add("Ctrl");
            if (alt) parts.Add("Alt");
            if (shift) parts.Add("Shift");
            parts.Add(mainKey);
            return string.Join("+", parts.ToArray());
        } catch {}
        return "";
    }
}
"@

try {
    Add-Type -TypeDefinition $audioCode -ErrorAction SilentlyContinue
} catch {}

$script:lastTrackKey = ""
$script:lastThumbBase64 = ""
$script:cachedVolume = 100

function Get-TargetSession {
    $mgr = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    if ($null -eq $mgr) { return $null }
    $sessions = $mgr.GetSessions()
    foreach ($s in $sessions) {
        if ($s.SourceAppUserModelId -match "Spotify") {
            return $s
        }
    }
    return $mgr.GetCurrentSession()
}

function Get-ThumbnailBase64($thumbRef) {
    if ($null -eq $thumbRef) { return "" }
    try {
        $winrtStream = Await-WinRT ($thumbRef.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        if ($null -eq $winrtStream) { return "" }
        $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($winrtStream)
        $ms = New-Object System.IO.MemoryStream
        $netStream.CopyTo($ms)
        $bytes = $ms.ToArray()
        $ms.Dispose()
        $netStream.Dispose()
        $winrtStream.Dispose()
        if ($bytes.Length -eq 0) { return "" }
        return "data:image/jpeg;base64," + [Convert]::ToBase64String($bytes)
    } catch {
        return ""
    }
}

function Get-MediaStatus {
    try {
        $session = Get-TargetSession
        if ($null -eq $session) {
            return @{
                connected = $false
                title = "Spotify Bekleniyor..."
                artist = "Spotify uygulamasını açıp bir şarkı başlatın"
                album = ""
                isPlaying = $false
                shuffle = $false
                repeat = "off"
                positionMs = 0
                durationMs = 0
                volume = $script:cachedVolume
                thumbnail = ""
            }
        }

        $props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $playback = $session.GetPlaybackInfo()
        $timeline = $session.GetTimelineProperties()

        $title = if ($props -and $props.Title) { $props.Title } else { "Bilinmeyen Şarkı" }
        $artist = if ($props -and $props.Artist) { $props.Artist } else { "Spotify" }
        $album = if ($props -and $props.AlbumTitle) { $props.AlbumTitle } else { "" }

        $trackKey = "$title|$artist|$album"
        if ($trackKey -ne $script:lastTrackKey -and $props -and $props.Thumbnail) {
            $thumb = Get-ThumbnailBase64 $props.Thumbnail
            if ($thumb -ne "") {
                $script:lastThumbBase64 = $thumb
                $script:lastTrackKey = $trackKey
            }
        }

        $isPlaying = ($playback -and $playback.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
        $shuffle = if ($playback -and $null -ne $playback.IsShuffleActive) { [bool]$playback.IsShuffleActive } else { $false }
        $repeatStr = "off"
        if ($playback -and $null -ne $playback.AutoRepeatMode) {
            $rm = $playback.AutoRepeatMode.ToString()
            if ($rm -eq "Track") { $repeatStr = "track" }
            elseif ($rm -eq "List") { $repeatStr = "context" }
        }

        $posMs = 0
        $durMs = 0
        if ($timeline) {
            $durMs = [math]::Round($timeline.EndTime.TotalMilliseconds)
            $posMs = [math]::Round($timeline.Position.TotalMilliseconds)
            if ($isPlaying -and $timeline.LastUpdatedTime -and $durMs -gt 0) {
                $elapsed = ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalMilliseconds
                if ($elapsed -gt 0 -and $elapsed -lt 300000) {
                    $posMs = [math]::Min($durMs, [math]::Round($posMs + $elapsed))
                }
            }
        }

        $vol = [SpotifyAudioController]::GetSpotifyVolume()
        if ($vol -ge 0) {
            $script:cachedVolume = [math]::Round($vol * 100)
        }

        return @{
            connected = $true
            source = $session.SourceAppUserModelId
            title = $title
            artist = $artist
            album = $album
            isPlaying = $isPlaying
            shuffle = $shuffle
            repeat = $repeatStr
            positionMs = [math]::Max(0, $posMs)
            durationMs = [math]::Max(0, $durMs)
            volume = $script:cachedVolume
            thumbnail = $script:lastThumbBase64
        }
    } catch {
        return @{
            connected = $false
            title = "Bağlantı Bekleniyor"
            artist = $_.Exception.Message
            isPlaying = $false
            positionMs = 0
            durationMs = 0
            volume = $script:cachedVolume
            thumbnail = $script:lastThumbBase64
        }
    }
}

# Main loop reading JSON commands from stdin
while ($null -ne ($line = [Console]::ReadLine())) {
    $line = $line.Trim()
    if ($line -eq "") { continue }
    try {
        $cmdObj = $line | ConvertFrom-Json
        $action = $cmdObj.action

        if ($action -eq "keypoll") {
            $combo = [SpotifyAudioController]::GetPressedCombo()
            Write-Output (@{ combo = $combo } | ConvertTo-Json -Compress)
            continue
        }
        if ($action -eq "volume") {
            if ($null -ne $cmdObj.value) {
                $v = [float]$cmdObj.value / 100.0
                $null = [SpotifyAudioController]::SetSpotifyVolume($v)
                $script:cachedVolume = [int]$cmdObj.value
            }
            Write-Output (@{ ok = $true; volume = $script:cachedVolume } | ConvertTo-Json -Compress)
            continue
        }
        if ($action -eq "noactivate") {
            if ($null -ne $cmdObj.hwnd) {
                $null = [SpotifyAudioController]::SetWindowNoActivate([int64]$cmdObj.hwnd, [bool]$cmdObj.state)
            }
            Write-Output (@{ ok = $true } | ConvertTo-Json -Compress)
            continue
        }

        $session = Get-TargetSession

        switch ($action) {
            "status" {
                $res = Get-MediaStatus
                Write-Output ($res | ConvertTo-Json -Compress)
            }
            "play" {
                if ($session) { $null = Await-WinRT ($session.TryPlayAsync()) ([bool]) }
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "pause" {
                if ($session) { $null = Await-WinRT ($session.TryPauseAsync()) ([bool]) }
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "toggle" {
                if ($session) { $null = Await-WinRT ($session.TryTogglePlayPauseAsync()) ([bool]) }
                Start-Sleep -Milliseconds 60
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "next" {
                if ($session) { $null = Await-WinRT ($session.TrySkipNextAsync()) ([bool]) }
                Start-Sleep -Milliseconds 120
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "prev" {
                if ($session) { $null = Await-WinRT ($session.TrySkipPreviousAsync()) ([bool]) }
                Start-Sleep -Milliseconds 120
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "seek" {
                if ($session -and $null -ne $cmdObj.positionMs) {
                    $ticks = [int64]($cmdObj.positionMs) * 10000
                    $null = Await-WinRT ($session.TryChangePlaybackPositionAsync($ticks)) ([bool])
                }
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "shuffle" {
                if ($session -and $null -ne $cmdObj.state) {
                    $null = Await-WinRT ($session.TryChangeShuffleActiveAsync([bool]$cmdObj.state)) ([bool])
                }
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            "repeat" {
                if ($session -and $null -ne $cmdObj.mode) {
                    $modeEnum = [Windows.Media.MediaPlaybackAutoRepeatMode]::None
                    if ($cmdObj.mode -eq "track") { $modeEnum = [Windows.Media.MediaPlaybackAutoRepeatMode]::Track }
                    elseif ($cmdObj.mode -eq "context") { $modeEnum = [Windows.Media.MediaPlaybackAutoRepeatMode]::List }
                    $null = Await-WinRT ($session.TryChangeAutoRepeatModeAsync($modeEnum)) ([bool])
                }
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
            default {
                Write-Output ((Get-MediaStatus) | ConvertTo-Json -Compress)
            }
        }
    } catch {
        Write-Output (@{ connected = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
    }
}
