@echo off
setlocal

rem Always serve the repository root, even when this file is started elsewhere.
cd /d "%~dp0"

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"
set "LOCAL_URL=http://127.0.0.1:%PORT%/index.html"
set "LAN_IP="

rem Find the IPv4 address of the first active adapter with a default gateway.
for /f "delims=" %%I in ('powershell.exe -NoProfile -Command "$ip = $null; foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) { if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }; $properties = $adapter.GetIPProperties(); if ($properties.GatewayAddresses.Count -eq 0) { continue }; foreach ($address in $properties.UnicastAddresses) { if ($address.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) { $ip = $address.Address.IPAddressToString; break } }; if ($ip) { break } }; if ($ip) { $ip }"') do set "LAN_IP=%%I"

rem Prefer the Windows Python launcher, then fall back to python on PATH.
py -3 --version >nul 2>&1
if not errorlevel 1 goto run_with_py

python --version >nul 2>&1
if not errorlevel 1 goto run_with_python

echo.
echo [ERROR] Python 3 was not found.
echo Install Python 3, then double-click this file again.
echo https://www.python.org/downloads/windows/
echo.
pause
exit /b 1

:show_urls
echo Dabimas Factor is starting for devices on this network.
echo.
if defined LAN_IP (
  echo Open this URL on another device:
  echo   http://%LAN_IP%:%PORT%/index.html
) else (
  echo The LAN IPv4 address could not be detected automatically.
  echo Run ipconfig and use: http://YOUR-IPv4-ADDRESS:%PORT%/index.html
)
echo.
echo If Windows Firewall asks, allow access on Private networks.
echo Only use this on a network you trust.
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the local server.
echo.
if not defined DABIMAS_NO_BROWSER start "" /b powershell.exe -NoProfile -Command "Start-Sleep -Milliseconds 800; Start-Process '%LOCAL_URL%'"
exit /b 0

:run_with_py
call :show_urls
py -3 scripts\lan_server.py %PORT% --bind 0.0.0.0 --directory "."
goto server_stopped

:run_with_python
call :show_urls
python scripts\lan_server.py %PORT% --bind 0.0.0.0 --directory "."

:server_stopped
echo.
echo The local network server has stopped.
pause
endlocal
