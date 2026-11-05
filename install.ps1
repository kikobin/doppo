# Установка doppo для Spicetify (Windows PowerShell)
# Запуск: powershell -ExecutionPolicy Bypass -File .\install.ps1
$ErrorActionPreference = "Stop"

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "Spicetify не найден. Установи его: https://spicetify.app/docs/getting-started" -ForegroundColor Red
    exit 1
}

$spiceDir = Split-Path (spicetify -c)
$themes   = Join-Path $spiceDir "Themes"
$apps     = Join-Path $spiceDir "CustomApps"
New-Item -ItemType Directory -Force -Path $themes, $apps | Out-Null

Copy-Item -Recurse -Force (Join-Path $PSScriptRoot "Themes\Doppo") $themes
Copy-Item -Recurse -Force (Join-Path $PSScriptRoot "CustomApps\doppo-flow") $apps

spicetify config current_theme Doppo color_scheme doppo inject_css 1 replace_colors 1 inject_theme_js 1
spicetify config custom_apps doppo-flow
spicetify apply

Write-Host "Готово! Перезапусти Spotify, если он не перезапустился сам." -ForegroundColor Green
