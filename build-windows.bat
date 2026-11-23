@echo off
title Build Work Desk for Windows
cd /d "%~dp0"
echo.
echo  ==========================================
echo     Building Work Desk for Windows
echo  ==========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js is not installed. Install the LTS version from https://nodejs.org
  echo      then close this window and run this file again.
  pause
  exit /b 1
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo  [X] Rust is not installed. Install it from https://rustup.rs
  echo      ^(choose the default options^), then RESTART your PC and run this file again.
  pause
  exit /b 1
)

echo  [1/3] Copying the Work Desk app files...
if exist dist rmdir /s /q dist
mkdir dist
copy /y "..\index.html" dist\ >nul
copy /y "..\styles.css" dist\ >nul
copy /y "..\manifest.webmanifest" dist\ >nul
robocopy "..\js" "dist\js" /E /NFL /NDL /NJH /NJS /NP >nul
robocopy "..\assets" "dist\assets" /E /NFL /NDL /NJH /NJS /NP >nul
if not exist dist\index.html (
  echo  [X] Could not find index.html. Keep this "desktop" folder inside the Work Desk folder.
  pause
  exit /b 1
)

echo  [2/3] Downloading the build tool ^(first time only^)...
call npm install --no-fund --no-audit
if errorlevel 1 goto failed

echo  [3/3] Building the app. The FIRST build takes 5-15 minutes; later builds are faster...
call npm run build
if errorlevel 1 goto failed

echo.
echo  ==========================================
echo   DONE!  Your installer is in the folder that just opened:
echo   "Work Desk_1.0.0_x64-setup.exe"
echo  ==========================================
explorer "src-tauri\target\release\bundle\nsis"
pause
exit /b 0

:failed
echo.
echo  [X] The build stopped with an error ^(see the messages above^).
echo      Most common fix: install "Desktop development with C++" from Visual Studio Build Tools,
echo      restart the PC, and run this file again. See DESKTOP.md.
pause
exit /b 1
