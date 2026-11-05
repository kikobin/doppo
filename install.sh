#!/usr/bin/env bash
# Установка doppo для Spicetify (macOS / Linux)
set -euo pipefail

command -v spicetify >/dev/null || { echo "Spicetify не найден: https://spicetify.app/docs/getting-started"; exit 1; }

here="$(cd "$(dirname "$0")" && pwd)"
spice_dir="$(dirname "$(spicetify -c)")"
mkdir -p "$spice_dir/Themes" "$spice_dir/CustomApps"

# убираем старые версии (doppo-flow — прежнее имя приложения)
rm -rf "$spice_dir/Themes/Doppo" "$spice_dir/CustomApps/doppo" "$spice_dir/CustomApps/doppo-flow"
cp -r "$here/Themes/Doppo" "$spice_dir/Themes/"
cp -r "$here/CustomApps/doppo" "$spice_dir/CustomApps/"

spicetify config custom_apps doppo-flow- >/dev/null 2>&1 || true
spicetify config current_theme Doppo color_scheme doppo inject_css 1 replace_colors 1
spicetify config custom_apps doppo
# первая установка или Spotify обновился — нужна свежая резервная копия
if ! spicetify apply; then
  echo "Делаю резервную копию Spotify и применяю заново…"
  spicetify backup apply
fi

echo "Готово! «Мой поток» — иконка в верхней панели и пункт в блоке doppo слева."
echo "Настройки — меню профиля → doppo."
