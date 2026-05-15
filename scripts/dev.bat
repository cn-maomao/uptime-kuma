@echo off
REM One-click dev mode for the HLL fork of Uptime Kuma.

setlocal
pushd "%~dp0\.."

where node >nul 2>nul || (
    echo [Error] Node.js not found in PATH. Install Node.js ^>= 20.4 first.
    goto :err
)

if not exist "node_modules" (
    echo ==^> Installing dependencies (npm install)...
    call npm install || goto :err
)

echo ==^> Starting dev servers (vite on :3000, backend on :3001) ...
echo     Open http://localhost:3000 for the dev UI.
call npm run dev
goto :end

:err
echo.
echo [Error] Dev startup aborted.
popd
exit /b 1

:end
popd
endlocal
