# Удаление doppo (Windows PowerShell). Сам Spicetify и другие темы/расширения не трогает.
$ErrorActionPreference = "Stop"
$spiceDir = Split-Path (spicetify -c)
spicetify config custom_apps doppo-
spicetify config current_theme SpicetifyDefault
foreach ($p in @((Join-Path $spiceDir "Themes\Doppo"), (Join-Path $spiceDir "CustomApps\doppo"))) {
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
spicetify apply
Write-Host "doppo удалён." -ForegroundColor Green
