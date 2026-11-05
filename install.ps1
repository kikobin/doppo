# Установка doppo для Spicetify (Windows PowerShell)
# Запуск из папки репозитория:  powershell -ExecutionPolicy Bypass -File .\install.ps1
$ErrorActionPreference = "Stop"

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "Spicetify не найден. Установи его: https://spicetify.app/docs/getting-started" -ForegroundColor Red
    exit 1
}

$spiceDir = Split-Path (spicetify -c)
$themes   = Join-Path $spiceDir "Themes"
$apps     = Join-Path $spiceDir "CustomApps"
New-Item -ItemType Directory -Force -Path $themes, $apps | Out-Null

# убираем старые версии (doppo-flow — прежнее имя приложения)
foreach ($old in @((Join-Path $themes "Doppo"), (Join-Path $apps "doppo"), (Join-Path $apps "doppo-flow"))) {
    if (Test-Path $old) { Remove-Item -Recurse -Force $old }
}

Copy-Item -Recurse -Force (Join-Path $PSScriptRoot "Themes\Doppo") $themes
Copy-Item -Recurse -Force (Join-Path $PSScriptRoot "CustomApps\doppo") $apps

spicetify config custom_apps doppo-flow- 2>$null | Out-Null
spicetify config current_theme Doppo color_scheme doppo inject_css 1 replace_colors 1
spicetify config custom_apps doppo
spicetify apply

Write-Host "Готово! «Мой поток» — иконка в верхней панели и пункт в блоке doppo слева." -ForegroundColor Green
Write-Host "Настройки — меню профиля → doppo." -ForegroundColor Green
