@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "PYTHONUTF8=1"
echo Homescapes Save Studio - standalone EXE builder
if not exist "package.json" goto failed
if not exist "tools\build_standalone.py" goto failed
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
if exist ".venv\Scripts\python.exe" goto venv_ready
where py.exe >nul 2>&1
if errorlevel 1 goto use_python
py -3 -m venv .venv
if errorlevel 1 goto failed
goto venv_ready
:use_python
python -m venv .venv
if errorlevel 1 goto failed
:venv_ready
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install pyinstaller pywebview
if errorlevel 1 goto failed
if not exist "package-lock.json" goto npm_install
call npm.cmd ci --cache "%TEMP%\homescapes-npm-cache"
if errorlevel 1 goto failed
goto build_ui
:npm_install
call npm.cmd install --cache "%TEMP%\homescapes-npm-cache"
if errorlevel 1 goto failed
:build_ui
call npm.cmd run build
if errorlevel 1 goto failed
".venv\Scripts\python.exe" tools\build_standalone.py
if errorlevel 1 goto failed
echo.
echo SUCCESS: desktop_dist\HomescapesSaveStudio.exe
echo Double-click the EXE to start the full UI and API automatically.
pause
exit /b 0
:missing_node
echo Install Node.js x64 22.18+ or 24+ on this BUILD machine first.
:failed
echo BUILD FAILED. Read the error above. Keep this window open for troubleshooting.
pause
exit /b 1
