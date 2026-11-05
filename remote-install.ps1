# doppo — установка одной командой (Windows PowerShell):
#   iwr -useb https://raw.githubusercontent.com/kikobin/doppo/main/remote-install.ps1 | iex
$ErrorActionPreference = "Stop"
$repo = "kikobin/doppo"
$branch = if ($env:DOPPO_BRANCH) { $env:DOPPO_BRANCH } else { "main" }

# Spicetify мог только что установиться и ещё не попасть в PATH
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    $local = Join-Path $env:LOCALAPPDATA "spicetify"
    if (Test-Path (Join-Path $local "spicetify.exe")) { $env:PATH = "$local;$env:PATH" }
}
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "Сначала установи Spicetify:" -ForegroundColor Yellow
    Write-Host "  iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex"
    Write-Host "Потом перезапусти PowerShell и выполни эту команду ещё раз."
    return
}

$tmp = Join-Path $env:TEMP ("doppo-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Write-Host "Скачиваю doppo..."
    $zip = Join-Path $tmp "doppo.zip"
    Invoke-WebRequest "https://github.com/$repo/archive/refs/heads/$branch.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp -Force
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tmp "doppo-$branch\install.ps1")
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
