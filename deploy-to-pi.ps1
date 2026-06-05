param(
    [string]$PiTarget = "dave@homedash.local",

    [string]$TargetDir = "/home/dave/ai-news-dashboard"
)

$ErrorActionPreference = "Stop"

$SourceDir = $PSScriptRoot
$ParentDir = Split-Path -Parent $SourceDir
$FolderName = Split-Path -Leaf $SourceDir
$RemoteParent = Split-Path -Parent $TargetDir

Write-Host "Creating remote directory $RemoteParent on $PiTarget..."
ssh $PiTarget "mkdir -p '$RemoteParent'"

Write-Host "Copying $SourceDir to ${PiTarget}:$RemoteParent ..."
Push-Location $ParentDir
try {
    scp -r $FolderName "${PiTarget}:$RemoteParent/"
} finally {
    Pop-Location
}

Write-Host "Setting executable bits on Pi scripts..."
ssh $PiTarget "chmod +x '$TargetDir/pi-dashboard.sh' '$TargetDir/update-with-codex.sh' '$TargetDir/install-pi-cron.sh'"

Write-Host "Done."
Write-Host "Next:"
Write-Host "  ssh $PiTarget"
Write-Host "  cd $TargetDir"
Write-Host "  ./pi-dashboard.sh start"
