@echo off
rem Starts the Todo app from Docker Hub as four containers (MongoDB, API, web app, mobile web
rem build) with their ports published, and opens it in the browser. Needs Docker Desktop
rem running; just double-click this file. Afterwards the "todolistsenamasoft" group in Docker
rem Desktop's Containers tab starts and stops all four with one button.
setlocal
set "STACK=oci://docker.io/offsya/todolistsenamasoft:compose"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop, wait for "Engine running" and try again.
  goto fail
)

echo Downloading and starting the app (the first time takes a few minutes)...
rem --wait returns once every container reports healthy. An existing stack keeps its data.
docker compose -f %STACK% up -d --wait --wait-timeout 300
if errorlevel 1 (
  echo.
  echo Could not start the app. If the message above says a port is already allocated, ports 8080,
  echo 8082 or 4000 are taken, for example by another copy of the app: stop it in Docker Desktop
  echo and run this file again.
  goto fail
)

echo.
echo The app is running:
echo   web app      http://localhost:8080
echo   mobile app   http://localhost:8082
echo   API          http://localhost:4000
echo In Docker Desktop it is the "todolistsenamasoft" group in Containers: expand it to see each
echo container with its image and ports; one button there starts or stops all of them.
start "" http://localhost:8080
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
