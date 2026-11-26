$ErrorActionPreference = "SilentlyContinue"
Set-Location $PSScriptRoot

$port = 5376
$logFile = Join-Path $PSScriptRoot "backend.log"
$errFile = Join-Path $PSScriptRoot "backend.err.log"
$runnerPidFile = Join-Path $PSScriptRoot ".runner.pid"
$serverPidFile = Join-Path $PSScriptRoot ".server.pid"
$stopFlagFile = Join-Path $PSScriptRoot ".stop_requested"

# Jika sudah ada proses yang listen di port 5376, jangan jalankan ganda
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    exit 0
}

if (Test-Path $stopFlagFile) {
    Remove-Item $stopFlagFile -Force -ErrorAction SilentlyContinue
}

$PID | Out-File -FilePath $runnerPidFile -Encoding ascii -Force

# Temukan path node.exe
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCmd) { $nodeCmd.Source } else { "C:\Program Files\nodejs\node.exe" }

while ($true) {
    if (Test-Path $stopFlagFile) {
        Remove-Item $stopFlagFile -Force -ErrorAction SilentlyContinue
        break
    }

    $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Start-Sleep -Seconds 5
        continue
    }

    # Batasi ukuran log agar tidak membengkak
    foreach ($f in @($logFile, $errFile)) {
        if ((Test-Path $f) -and ((Get-Item $f).Length -gt 2MB)) {
            Clear-Content $f -ErrorAction SilentlyContinue
        }
    }

    Add-Content -Path $logFile -Value "`n[Runner $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Memulai MediaMovie Backend..."
    $proc = Start-Process -FilePath $nodePath `
        -ArgumentList "dist/server.js" `
        -WorkingDirectory $PSScriptRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError $errFile `
        -PassThru

    $proc.Id | Out-File -FilePath $serverPidFile -Encoding ascii -Force
    $proc.WaitForExit()

    if (Test-Path $stopFlagFile) {
        Remove-Item $stopFlagFile -Force -ErrorAction SilentlyContinue
        break
    }

    if ($proc.ExitCode -eq 0) {
        break
    }

    Add-Content -Path $errFile -Value "[Runner $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Server berhenti (ExitCode=$($proc.ExitCode)). Restart dalam 5 detik..."
    Start-Sleep -Seconds 5
}

Remove-Item $runnerPidFile -Force -ErrorAction SilentlyContinue
Remove-Item $serverPidFile -Force -ErrorAction SilentlyContinue
