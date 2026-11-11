@echo off
set "QA_POWERSHELL_EXE="
if defined QA_POWERSHELL set "QA_POWERSHELL_EXE=%QA_POWERSHELL%"
if defined QA_POWERSHELL_EXE goto run
where pwsh.exe >nul 2>nul
if not errorlevel 1 (
  set "QA_POWERSHELL_EXE=pwsh.exe"
  goto run
)
where powershell.exe >nul 2>nul
if not errorlevel 1 (
  set "QA_POWERSHELL_EXE=powershell.exe"
  goto run
)
echo PowerShell 7 or Windows PowerShell 5.1 is required.
exit /b 1

:run
"%QA_POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0qa.ps1" %*
exit /b %errorlevel%
