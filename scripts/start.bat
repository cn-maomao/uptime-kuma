@echo off
REM One-click production startup for the HLL fork of Uptime Kuma.
REM Equivalent to scripts\start.ps1 for users who don't use PowerShell.

setlocal
pushd "%~dp0\.."

where node >nul 2>nul || (
    echo [Error] Node.js not found in PATH. Install Node.js ^>= 20.4 first.
    goto :err
)

if not exist "node_modules" (
    echo.
    echo ==^> Installing dependencies (npm install)...
    call npm install || goto :err
) else (
    echo ==^> node_modules already exists, skipping install
)

echo.
echo ==^> Building frontend (npm run build)...
call npm run build || goto :err

echo.
echo ==^> Starting Uptime Kuma server on http://localhost:3001 ...
node server\server.js
goto :end

:err
echo.
echo [Error] Startup aborted.
popd
exit /b 1

:end
popd
endlocal
