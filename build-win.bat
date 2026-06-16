@echo off
REM Build DevLaunch for Windows (run on Windows with Node.js installed)
cd /d "%~dp0"

echo ==^> Installing dependencies...
call npm install

echo ==^> Rebuilding native modules for Electron...
call npx @electron/rebuild

echo ==^> Building Windows installer...
call npx electron-builder --win --x64

echo ==^> Done! Check the dist\ folder.
