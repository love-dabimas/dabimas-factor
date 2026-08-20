@echo off
setlocal

rem Always serve the repository root, even when this file is started elsewhere.
cd /d "%~dp0"

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"
set "URL=http://127.0.0.1:%PORT%/index.html"

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

:run_with_py
echo Dabimas Factor is starting at %URL%
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the local server.
echo.
if not defined DABIMAS_NO_BROWSER start "" /b powershell.exe -NoProfile -Command "Start-Sleep -Milliseconds 800; Start-Process '%URL%'"
py -3 -m http.server %PORT% --bind 127.0.0.1 --directory "."
goto server_stopped

:run_with_python
echo Dabimas Factor is starting at %URL%
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the local server.
echo.
if not defined DABIMAS_NO_BROWSER start "" /b powershell.exe -NoProfile -Command "Start-Sleep -Milliseconds 800; Start-Process '%URL%'"
python -m http.server %PORT% --bind 127.0.0.1 --directory "."

:server_stopped
echo.
echo The local server has stopped.
pause
endlocal
