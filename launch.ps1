param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = (Get-Command python -ErrorAction Stop).Source }
$taskPort = (Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'settings.json') | ConvertFrom-Json).port
$taskUrl = "http://127.0.0.1:$taskPort"
$taskReady = $false
try {
    $taskResponse = Invoke-RestMethod -Uri "$taskUrl/api/catalogue" -TimeoutSec 2
    if (-not $taskResponse.search_mode) { throw 'The port is occupied by another service.' }
    $taskReady = $true
} catch [System.Net.WebException], [System.Net.Http.HttpRequestException], [System.Threading.Tasks.TaskCanceledException] { }
if (-not $taskReady) {
    Start-Process -FilePath $taskPython -ArgumentList @('-X','utf8',"`"$(Join-Path $taskRoot 'workbench.py')`"",'serve','--port',"$taskPort") -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'server.log') -RedirectStandardError (Join-Path $taskRoot 'server-error.log')
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
        Start-Sleep -Milliseconds 250
        try {
            $taskResponse = Invoke-RestMethod -Uri "$taskUrl/api/catalogue" -TimeoutSec 2
            if ($taskResponse.search_mode) { $taskReady = $true; break }
        } catch [System.Net.WebException], [System.Net.Http.HttpRequestException], [System.Threading.Tasks.TaskCanceledException] { }
    }
}
if (-not $taskReady) { throw 'Could not start the workbench. Check server-error.log and your Python 3.11+ installation.' }
if (-not $NoBrowser) { Start-Process $taskUrl }
Write-Output $taskUrl
