@echo off
rem Starts the Todo app from Docker Hub (offsya/todolistsenamasoft) with its ports published
rem and opens it in the browser. Needs Docker Desktop running; just double-click this file.
setlocal
set "NAME=todolistsenamasoft"
set "IMAGE=offsya/todolistsenamasoft"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop, wait for "Engine running" and try again.
  goto fail
)

rem An existing container keeps the data: start it again instead of creating a new one.
docker container inspect %NAME% >nul 2>&1
if errorlevel 1 (
  echo Downloading %IMAGE% ...
  docker pull %IMAGE%
  if errorlevel 1 goto fail
  echo Starting the app...
  docker run -d --name %NAME% -p 8080:8080 -p 8082:8082 -p 4000:4000 %IMAGE% >nul
  if errorlevel 1 (
    rem docker run leaves the container behind when it cannot take the ports.
    docker rm -f %NAME% >nul 2>&1
    goto no_ports
  )
) else (
  echo Starting the app...
  docker start %NAME% >nul
  if errorlevel 1 goto no_ports
)

rem The container may run without its ports: they can be taken by another container, or this
rem one was created without them (for example from Docker Desktop's Run button).
docker port %NAME% 8080 >nul 2>&1
if errorlevel 1 (
  docker stop %NAME% >nul 2>&1
  goto no_ports
)

echo Waiting until it is ready...
set /a TRIES=0
:wait
set "STATE="
for /f "delims=" %%s in ('docker inspect -f "{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{end}}" %NAME%') do set "STATE=%%s"
if "%STATE%"=="running/healthy" goto ready
if not "%STATE:~0,7%"=="running" goto broken
set /a TRIES+=1
if %TRIES% geq 90 goto broken
rem A two-second pause that also works when the window has no keyboard input.
ping -n 3 127.0.0.1 >nul
goto wait

:ready
echo.
echo The app is running:
echo   web app      http://localhost:8080
echo   mobile app   http://localhost:8082
echo   API          http://localhost:4000
echo Stop it in Docker Desktop (Containers) or with: docker stop %NAME%
start "" http://localhost:8080
echo.
pause
exit /b 0

:no_ports
echo Could not publish ports 8080, 8082 and 4000. Either another container or program uses them
echo (for example another copy of this app: stop it in Docker Desktop), or the container
echo "%NAME%" was created without ports (delete it in Docker Desktop). Then run this file again.
goto fail

:broken
echo The app did not start. The end of its log:
docker logs --tail 20 %NAME%

:fail
echo.
pause
exit /b 1
