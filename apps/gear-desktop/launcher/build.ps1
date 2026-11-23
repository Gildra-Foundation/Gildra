param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Output | Out-Null
Push-Location $PSScriptRoot
try {
  $compiler = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
  $common = @('/nologo','/optimize+','/utf8output','/codepage:65001','/r:System.Net.Http.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll')
  & $compiler @common /target:winexe /resource:art/citadel.jpg,citadel /resource:art/action.png,action /resource:art/shield.png,shield /win32icon:../../web/app/favicon.ico "/out:$Output/Gildra Gear Launcher.exe" Update.cs Differential.cs Window.cs Art.cs
  if ($LASTEXITCODE) { throw 'Launcher compilation failed' }
  & $compiler @common "/out:$Output/LauncherTest.exe" Update.cs Differential.cs Test.cs
  if ($LASTEXITCODE) { throw 'Test compilation failed' }
  & "$Output/LauncherTest.exe"
  if ($LASTEXITCODE) { throw 'Launcher integration test failed' }
  Compress-Archive -LiteralPath "$Output/Gildra Gear Launcher.exe" -DestinationPath "$Output/Gildra-Gear-Launcher.zip"
} finally { Pop-Location }
