@echo off
setlocal
set "GIT_BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GIT_BASH%" set "GIT_BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GIT_BASH%" (
  echo ERROR: Git for Windows was not found.
  echo Install Git for Windows before using this launcher.
  pause
  exit /b 1
)
"%GIT_BASH%" "%~dp0Roku-Game-Engine-Git-Push.sh"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo Script failed with exit code %RESULT%.
pause
exit /b %RESULT%
