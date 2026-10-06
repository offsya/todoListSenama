@echo off
rem Starts the Expo dev server from Docker Hub for Expo Go on a phone, which must be in the same
rem network as this computer. Starts the rest of the app first if it is not running (the phone
rem calls its API on port 4000). Needs Docker Desktop running; just double-click this file.
rem An address can be given instead of the detected one:  start-expo.bat 192.168.1.10
setlocal
set "IMAGE=offsya/todolistsenamasoft:expo"
set "STACK=oci://docker.io/offsya/todolistsenamasoft:compose"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop, wait for "Engine running" and try again.
  goto fail
)

rem The phone reaches this computer by its LAN address: the adapter with a default gateway.
set "HOST_IP=%~1"
if not defined HOST_IP (
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "HOST_IP=%%i"
)
if not defined HOST_IP (
  echo Could not find this computer's address in the local network. Pass it yourself, for
  echo example:  start-expo.bat 192.168.1.10
  goto fail
)

curl -s -o nul -m 3 http://localhost:4000/health
if errorlevel 1 (
  echo Starting the app first (the first time takes a few minutes^)...
  docker compose -f %STACK% up -d --wait --wait-timeout 300
  if errorlevel 1 (
    echo Could not start the app: see the message above.
    goto fail
  )
)

echo Downloading the latest Expo dev server image...
docker pull %IMAGE%
if errorlevel 1 goto fail

echo.
echo Address for the phone: %HOST_IP%. Open Expo Go and scan the QR code below once it appears
echo (Android: in Expo Go; iPhone: with the camera). Windows Firewall must allow incoming
echo connections to Docker on ports 8081 and 4000. Ctrl+C stops the dev server.
echo.
docker run -it --rm --name todoListSenamaSoft-expo -p 8081:8081 ^
  -e REACT_NATIVE_PACKAGER_HOSTNAME=%HOST_IP% %IMAGE%
exit /b 0

:fail
echo.
pause
exit /b 1
