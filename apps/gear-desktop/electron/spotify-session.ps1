$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Read-Operation($operation, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null,@($operation))
    $task.GetAwaiter().GetResult()
}
$manager = Read-Operation ($managerType::RequestAsync()) $managerType
$previous = ''
do {
    $spotify = $manager.GetSessions() | Where-Object {
        $_.SourceAppUserModelId -match '^(Spotify(\.exe)?|SpotifyAB\.SpotifyMusic_[a-z0-9]+!Spotify)$'
    } | Select-Object -First 1
    if (!$spotify) { 'null'; exit 0 }
    if ($env:GILDRA_SPOTIFY_ACTION -eq 'toggle') {
        if (!(Read-Operation ($spotify.TryTogglePlayPauseAsync()) ([bool]))) { throw 'Playback command declined' }
    }
    $props = Read-Operation ($spotify.TryGetMediaPropertiesAsync()) $propsType
    $current = [ordered]@{title=$props.Title; artist=$props.Artist; playing=($spotify.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing')} | ConvertTo-Json -Compress
    if ($current -ne $previous) { [Console]::WriteLine($current); $previous=$current }
    if ($env:GILDRA_SPOTIFY_ACTION -ne 'watch') { break }
    Start-Sleep -Seconds 4
} while ($true)
