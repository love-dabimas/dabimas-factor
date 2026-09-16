param(
  [Parameter(Mandatory = $true)]
  [string]$Url,
  [string]$OutputPath = "",
  [int]$Width = 390,
  [int]$Height = 844,
  [int]$VirtualTimeBudget = 12000,
  [switch]$DumpDom,
  [int]$DebugPort = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
  throw "Chrome not found: $chromePath"
}

$runtimeRoot = Join-Path $PSScriptRoot "..\.chrome-runtime"
$runtimeRoot = (Resolve-Path (Split-Path $runtimeRoot -Parent)).Path + "\.chrome-runtime"
$userDataDir = Join-Path $runtimeRoot "user-data"
$localAppDataDir = Join-Path $runtimeRoot "localappdata"
$tempDir = Join-Path $runtimeRoot "temp"

New-Item -ItemType Directory -Force -Path $runtimeRoot, $userDataDir, $localAppDataDir, $tempDir | Out-Null

Remove-Item Env:CHROME_CRASHPAD_PIPE_NAME -ErrorAction SilentlyContinue
$env:LOCALAPPDATA = $localAppDataDir
$env:TEMP = $tempDir
$env:TMP = $tempDir

$arguments = @(
  "--headless"
  "--no-sandbox"
  "--disable-gpu"
  "--disable-web-security"
  "--allow-file-access-from-files"
  "--user-data-dir=$userDataDir"
  "--window-size=$Width,$Height"
)

if ($DebugPort -eq 0) {
  $arguments += "--virtual-time-budget=$VirtualTimeBudget"
}
# Keep the page alive for CDP measurement when a debug port is specified.
if ($DumpDom -and $DebugPort -eq 0) {
  $arguments += "--dump-dom"
}
if ($DebugPort -gt 0) {
  $arguments += "--remote-debugging-port=$DebugPort"
}

if ($OutputPath) {
  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  $arguments += "--screenshot=$resolvedOutput"
}

$arguments += $Url

& $chromePath @arguments
