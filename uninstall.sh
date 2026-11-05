#!/usr/bin/env bash
# Удаление doppo (macOS / Linux). Сам Spicetify и другие темы/расширения не трогает.
set -euo pipefail
spice_dir="$(dirname "$(spicetify -c)")"
spicetify config custom_apps doppo-
spicetify config current_theme SpicetifyDefault
rm -rf "$spice_dir/Themes/Doppo" "$spice_dir/CustomApps/doppo"
spicetify apply
echo "doppo удалён."
