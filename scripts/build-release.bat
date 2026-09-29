@echo off
echo ===================================
echo Building Eastern Sweets ERP Release
echo ===================================
echo Closing running Eastern Sweets apps...
taskkill /F /T /IM "Eastern Sweets.exe" >nul 2>nul
taskkill /F /T /IM "Eastern Sweets - Backup Tool.exe" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"

echo Cleaning locked release folders...
if exist "desktop\release\win-unpacked" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 1; $i -le 5; $i++) { try { Remove-Item -LiteralPath 'desktop\release\win-unpacked' -Recurse -Force -ErrorAction Stop; exit 0 } catch { Start-Sleep -Seconds 2 } }; Write-Error 'Could not clean desktop release folder. Close Eastern Sweets ERP and File Explorer preview, then run again.'; exit 1"
  if errorlevel 1 exit /b 1
)
if exist "backup-tool\release\win-unpacked" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 1; $i -le 5; $i++) { try { Remove-Item -LiteralPath 'backup-tool\release\win-unpacked' -Recurse -Force -ErrorAction Stop; exit 0 } catch { Start-Sleep -Seconds 2 } }; Write-Error 'Could not clean backup tool release folder. Close Backup Tool and File Explorer preview, then run again.'; exit 1"
  if errorlevel 1 exit /b 1
)

echo [1/5] Building frontend...
cd client
call npm run build
if errorlevel 1 exit /b 1
cd ..

echo [2/5] Building backend...
cd server
call npm install
if errorlevel 1 exit /b 1
if exist prisma rmdir /S /Q prisma
xcopy /E /I /Y ..\prisma prisma
call npx prisma generate --schema prisma\schema.prisma
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
call npm install --production
if errorlevel 1 exit /b 1
call npx prisma generate --schema prisma\schema.prisma
if errorlevel 1 exit /b 1
cd ..

echo [3/5] Building backup tool...
cd backup-tool
call npm install
if errorlevel 1 exit /b 1
call npm run dist
if errorlevel 1 exit /b 1
cd ..

echo [4/5] Building desktop app...
cd desktop
call npm install
if errorlevel 1 exit /b 1
call npm run dist
if errorlevel 1 exit /b 1
cd ..

echo [5/5] Done!
echo Main app installer created in: desktop\release\
echo Backup tool: backup-tool\release\Eastern Sweets - Backup Tool.exe
echo Portable live folder also contains both exes: desktop\release\win-unpacked\
