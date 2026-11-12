# Dot-source this file to make qa available in the current PowerShell session.
Set-Alias -Name qa -Value (Join-Path $PSScriptRoot 'qa.cmd') -Scope Global
