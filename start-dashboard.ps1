$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m http.server 8765 --bind 127.0.0.1
