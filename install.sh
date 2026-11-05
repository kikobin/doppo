#!/usr/bin/env bash
# Установка doppo для Spicetify (macOS / Linux)
set -euo pipefail

command -v spicetify >/dev/null || { echo "Spicetify не найден: https://spicetify.app/docs/getting-started"; exit 1; }

here="$(cd "$(dirname "$0")" && pwd)"
spice_dir="$(dirname "$(spicetify -c)")"
mkdir -p "$spice_dir/Themes" "$spice_dir/CustomApps"

rm -rf "$spice_dir/Themes/Doppo" "$spice_dir/CustomApps/doppo-flow"
cp -r "$here/Themes/Doppo" "$spice_dir/Themes/"
cp -r "$here/CustomApps/doppo-flow" "$spice_dir/CustomApps/"

spicetify config current_theme Doppo color_scheme doppo inject_css 1 replace_colors 1 inject_theme_js 1
spicetify config custom_apps doppo-flow
spicetify apply

echo "Готово!"
