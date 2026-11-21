param([Parameter(Mandatory = $true)][string]$AppDir)
$ErrorActionPreference = 'Stop'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=19222 --no-first-run'
$settings = Join-Path $env:LOCALAPPDATA 'Gildra/Gear'
New-Item -ItemType Directory -Force $settings | Out-Null
& (Join-Path $AppDir 'runtime/node.exe') "$PSScriptRoot/native-batch.mjs" (Join-Path $AppDir 'runtime')
if ($LASTEXITCODE) { throw 'Native batch regression failed' }
Add-Type -AssemblyName UIAutomationClient
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GearWindows {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr window, int index);
}
'@
$automation = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
foreach ($mode in 'server','local') {
  @{Local=($mode -eq 'local');Russian=$false} | ConvertTo-Json | Set-Content -Encoding utf8NoBOM (Join-Path $settings 'settings.json')
  $app = Start-Process (Join-Path $AppDir 'Gildra Gear.exe') -PassThru
  try {
    node "$PSScriptRoot/windows-smoke.mjs" $mode
    if ($LASTEXITCODE) { throw "WebView2 test failed in $mode mode" }
    if ($mode -eq 'local') {
      $app.Refresh()
      $main = $app.MainWindowHandle
      if (!$main -or ![GearWindows]::PostMessage($main,0x0312,0x646,0)) { throw 'Cannot toggle overlay' }
      $windows = [System.Windows.Automation.PropertyCondition]::new($automation::ProcessIdProperty,$app.Id)
      $found = $false
      for ($attempt=0; $attempt -lt 25 -and !$found; $attempt++) {
        Start-Sleep -Milliseconds 500
        foreach ($window in $automation::RootElement.FindAll($scope::Children,$windows)) {
          $handle = [IntPtr]$window.Current.NativeWindowHandle
          if ($handle -eq $main -or !([GearWindows]::GetWindowLong($handle,-20) -band 8)) { continue }
          foreach ($control in $window.FindAll($scope::Descendants,[System.Windows.Automation.Condition]::TrueCondition)) {
            $document = $null
            if ($control.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$document)) {
              if ($document.DocumentRange.GetText(-1) -match 'Windows smoke set') { $found = $true; break }
            }
          }
        }
      }
      if (!$found) { throw 'Always-on-top overlay did not show the selected result' }
      Write-Host 'Verified native always-on-top overlay and result text.'
    }
  } finally {
    $app.Refresh()
    if (!$app.HasExited) {
      [void]$app.CloseMainWindow()
      if (!$app.WaitForExit(12000)) { taskkill /PID $app.Id /T /F }
    }
  }
}
