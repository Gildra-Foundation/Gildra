param([Parameter(Mandatory = $true)][string]$AppDir)
$ErrorActionPreference = 'Stop'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=19222 --no-first-run'
$settings = Join-Path $env:LOCALAPPDATA 'Gildra/Gear'
New-Item -ItemType Directory -Force $settings | Out-Null
& (Join-Path $AppDir 'runtime/node.exe') "$PSScriptRoot/native-batch.mjs" (Join-Path $AppDir 'runtime')
if ($LASTEXITCODE) { throw 'Native batch regression failed' }
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class GearWindows {
  private delegate bool Enumerate(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(Enumerate callback, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, Enumerate callback, IntPtr data);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr window, int index);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder target, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(IntPtr window, uint msg, UIntPtr limit, StringBuilder target, uint flags, uint timeout, out UIntPtr result);
  public static bool HasOverlay(int appPid, IntPtr main, string text) {
    bool found = false;
    EnumWindows((window, ignored) => {
      uint pid;
      GetWindowThreadProcessId(window, out pid);
      if (pid != appPid || window == main || !IsWindowVisible(window) || (GetWindowLong(window,-20) & 8) == 0) return true;
      EnumChildWindows(window, (child, data) => {
        var name = new StringBuilder(256);
        GetClassName(child,name,name.Capacity);
        if (name.ToString().IndexOf("RichEdit", StringComparison.OrdinalIgnoreCase) < 0) return true;
        var value = new StringBuilder(8192);
        UIntPtr copied;
        SendMessageTimeout(child, 0x000D, (UIntPtr)value.Capacity, value, 2, 1000, out copied);
        found = value.ToString().Contains(text);
        return !found;
      }, IntPtr.Zero);
      return !found;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$runtimePaths = @("${env:ProgramFiles(x86)}/Microsoft/EdgeWebView/Application/*/msedgewebview2.exe", "$env:LOCALAPPDATA/Microsoft/EdgeWebView/Application/*/msedgewebview2.exe")
$webview = Get-Item -Path $runtimePaths -ErrorAction SilentlyContinue | Select-Object -Last 1
if (!$webview) {
  $installer = Join-Path $env:RUNNER_TEMP 'MicrosoftEdgeWebview2Setup.exe'
  Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $installer
  $signature = Get-AuthenticodeSignature $installer
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'Invalid WebView2 installer signature' }
  $install = Start-Process $installer -ArgumentList '/silent','/install' -Wait -PassThru
  $webview = Get-Item -Path $runtimePaths -ErrorAction SilentlyContinue | Select-Object -Last 1
  if (!$webview) { throw "WebView2 installer exit $($install.ExitCode)" }
}
Write-Host "WebView2 $($webview.VersionInfo.ProductVersion)"
foreach ($mode in 'server','local') {
  @{Local=($mode -eq 'local');Russian=$false} | ConvertTo-Json | Set-Content -Encoding utf8NoBOM (Join-Path $settings 'settings.json')
  $log = Join-Path $env:RUNNER_TEMP "gear-$mode.log"
  $app = Start-Process (Join-Path $AppDir 'Gildra Gear.exe') -PassThru -RedirectStandardError $log
  try {
    node "$PSScriptRoot/windows-smoke.mjs" $mode
    if ($LASTEXITCODE) { throw "WebView2 test failed in $mode mode" }
    if ($mode -eq 'local') {
      $app.Refresh()
      $main = $app.MainWindowHandle
      if (!$main -or ![GearWindows]::PostMessage($main,0x0312,0x646,0)) { throw 'Cannot toggle overlay' }
      $found = $false
      for ($attempt=0; $attempt -lt 25 -and !$found; $attempt++) {
        Start-Sleep -Milliseconds 500
        $found = [GearWindows]::HasOverlay($app.Id, $main, 'Windows smoke set')
      }
      if (!$found) { throw 'Always-on-top overlay did not show the selected result' }
      Write-Host 'Verified native always-on-top overlay and result text.'
    }
  } catch {
    $app.Refresh()
    Write-Host "App exited=$($app.HasExited) handle=$($app.MainWindowHandle) title=$($app.MainWindowTitle)"
    if (Test-Path $log) { Get-Content $log | Select-Object -Last 30 }
    Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Select-Object -First 5 Id,SessionId
    Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='.NET Runtime'; StartTime=(Get-Date).AddMinutes(-4) } -ErrorAction SilentlyContinue | Select-Object -First 2 -ExpandProperty Message
    throw
  } finally {
    $app.Refresh()
    if (!$app.HasExited) {
      [void]$app.CloseMainWindow()
      if (!$app.WaitForExit(12000)) { taskkill /PID $app.Id /T /F }
    }
  }
}
