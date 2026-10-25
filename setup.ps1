<#
  Space Works Machines - first-run setup for a local or desktop install (Windows).
  Right-click -> "Run with PowerShell", or run:  powershell -ExecutionPolicy Bypass -File setup.ps1 [--build]
  Needs Docker Desktop (running) and Git for Windows; the setup itself is setup.sh, run
  through Git Bash, so Windows and Linux installs share one questionnaire and one stack.
  For a server, use the curl installer on Linux instead (see README).
#>
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $docker) { throw "Docker Desktop is not installed. Install it, start it, then rerun setup.ps1." }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is not running. Start it, wait until it is ready, then rerun setup.ps1." }

$candidates = @(
  "$env:ProgramFiles\Git\bin\bash.exe",
  "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)
$bash = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($null -eq $bash) { throw "Git Bash was not found. Install Git for Windows (winget install Git.Git), then rerun setup.ps1." }

& $bash setup.sh @args
exit $LASTEXITCODE
