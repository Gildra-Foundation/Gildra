param([int]$Version)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$base='https://github.com/Gildra-Foundation/Gildra/releases/download/gear-desktop-build-'
$dir="$env:RUNNER_TEMP/portable"
foreach($bundle in @(@(20,'Gildra-Gear-Windows-x64'),@(21,'Gildra-Gear-Launcher'))) {
    $archive="$env:RUNNER_TEMP/$($bundle[1]).zip"
    Invoke-WebRequest "$base$($bundle[0])/$($bundle[1]).zip" -OutFile $archive
    Expand-Archive $archive -DestinationPath $dir -Force
}
function Controls($process) {
    $process.Refresh()
    if ($process.HasExited -or !$process.MainWindowHandle) {return}
    $root=[Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    $root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
}
$entry="$dir/Gildra Gear Launcher.exe"
$ui=Start-Process $entry -PassThru
for($i=0;$i -lt 120;$i++) {
    Start-Sleep 1
    $controls=Controls $ui
    $button=$controls | Where-Object {$_.Current.Name -eq 'Обновить' -and $_.Current.IsEnabled}
    if($button){break}
}
Write-Host (($controls|ForEach-Object {$_.Current.Name}) -join ' | ')
if(!$button){throw 'No update button'}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ClickWindow {
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
}
'@
$child=[IntPtr]$button.Current.NativeWindowHandle
if($child -eq [IntPtr]::Zero){throw 'No button handle'}
[ClickWindow]::PostMessage($child,0x0201,[IntPtr]1,[IntPtr]0x000A000A) | Out-Null
[ClickWindow]::PostMessage($child,0x0202,[IntPtr]0,[IntPtr]0x000A000A) | Out-Null
$active=Join-Path $env:LOCALAPPDATA 'Gildra Gear Launcher/active'
for($i=0;$i -lt 180;$i++){
    Start-Sleep 1
    if(Test-Path $active){break}
    if(!($i%10)){Write-Host (((Controls $ui)|ForEach-Object {$_.Current.Name}) -join ' | ')}
}
if((Get-Content $active) -ne "$Version"){throw 'Update not activated'}
$expected=Join-Path (Split-Path $active) "build-$Version/Gildra Gear Launcher.exe"
function Managed {
    Get-Process -Name 'Gildra Gear Launcher' -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq [IO.Path]::GetFullPath($expected)}
}
for($i=0;$i -lt 30 -and !(Managed);$i++){Start-Sleep 1}
if(!(Managed)){throw 'Updated launcher did not restart'}
(Managed).Kill()
Start-Sleep 1
Start-Process $entry
for($i=0;$i -lt 30 -and !(Managed);$i++){Start-Sleep 1}
if(!(Managed)){throw 'Original shortcut did not forward'}
Write-Host 'Portable v20 upgraded and original shortcut opened the updated launcher.'
