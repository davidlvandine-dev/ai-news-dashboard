param(
    [ValidateSet("start", "stop", "status", "update")]
    [string]$Action
)

$ErrorActionPreference = "Stop"

$DashboardRoot = $PSScriptRoot
$Port = 8765
$Url = "http://127.0.0.1:$Port"

function Get-DashboardProcess {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        return @()
    }

    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        Get-Process -Id $processId -ErrorAction SilentlyContinue
    }
}

function Show-DashboardStatus {
    $processes = @(Get-DashboardProcess)

    if (-not $processes -or $processes.Count -eq 0) {
        Write-Host "AI News Dashboard is stopped." -ForegroundColor Yellow
        return
    }

    Write-Host "AI News Dashboard is running." -ForegroundColor Green
    Write-Host "URL: $Url"
    foreach ($process in $processes) {
        Write-Host "Process: $($process.ProcessName) PID $($process.Id)"
    }
}

function Start-Dashboard {
    $processes = @(Get-DashboardProcess)
    if ($processes.Count -gt 0) {
        Write-Host "AI News Dashboard is already running at $Url" -ForegroundColor Yellow
        return
    }

    Start-Process `
        -FilePath python `
        -ArgumentList "-m", "http.server", "$Port", "--bind", "127.0.0.1" `
        -WorkingDirectory $DashboardRoot `
        -WindowStyle Hidden

    Start-Sleep -Seconds 2
    $processes = @(Get-DashboardProcess)
    if ($processes.Count -gt 0) {
        Write-Host "AI News Dashboard started." -ForegroundColor Green
        Write-Host "URL: $Url"
    } else {
        Write-Host "Start command ran, but no listener was found on port $Port." -ForegroundColor Red
    }
}

function Stop-Dashboard {
    $processes = @(Get-DashboardProcess)
    if ($processes.Count -eq 0) {
        Write-Host "AI News Dashboard is already stopped." -ForegroundColor Yellow
        return
    }

    foreach ($process in $processes) {
        Stop-Process -Id $process.Id -Force
        Write-Host "Stopped PID $($process.Id)." -ForegroundColor Green
    }
}

function Update-DashboardSnapshot {
    $generatorPath = Join-Path $DashboardRoot "generate-snapshot.py"
    if (-not (Test-Path $generatorPath)) {
        Write-Host "Snapshot generator not found at $generatorPath" -ForegroundColor Red
        return
    }

    if (-not $env:ANTHROPIC_API_KEY) {
        Write-Host "ANTHROPIC_API_KEY is not set. Set it before running a manual update." -ForegroundColor Red
        Write-Host '$env:ANTHROPIC_API_KEY = "your_api_key_here"'
        return
    }

    Push-Location $DashboardRoot
    try {
        python .\generate-snapshot.py
    } finally {
        Pop-Location
    }
}

function Invoke-DashboardAction {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("start", "stop", "status", "update")]
        [string]$RequestedAction
    )

    switch ($RequestedAction) {
        "start" { Start-Dashboard }
        "stop" { Stop-Dashboard }
        "status" { Show-DashboardStatus }
        "update" { Update-DashboardSnapshot }
    }
}

if ($Action) {
    Invoke-DashboardAction -RequestedAction $Action
    return
}

do {
    Write-Host ""
    Write-Host "AI News Dashboard Menu"
    Write-Host "1. Start dashboard"
    Write-Host "2. Stop dashboard"
    Write-Host "3. Show status"
    Write-Host "4. Manual update now"
    Write-Host "5. Exit"
    Write-Host ""

    $selection = Read-Host "Enter your selection (1, 2, 3, 4, or 5)"

    switch ($selection) {
        "1" {
            Start-Dashboard
        }
        "2" {
            Stop-Dashboard
        }
        "3" {
            Show-DashboardStatus
        }
        "4" {
            Update-DashboardSnapshot
        }
        "5" {
            Write-Host "Exiting."
            return
        }
        default {
            Write-Host "Invalid selection. Please enter 1, 2, 3, 4, or 5." -ForegroundColor Yellow
        }
    }
} while ($true)
